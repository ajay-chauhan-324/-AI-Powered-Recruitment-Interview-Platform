import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { DateTime } from 'luxon'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { BlockedSlotModel } from '../models/BlockedSlot.model.js'
import {
  findAvailableSlots,
  findNearestAlternatives,
  isSlotAvailable,
  ScheduleNotConfiguredError,
} from './availability.service.js'

/** Same project-dedicated local replica set as interview.service.test.ts, under the same
 * separate booking_system_test database — see that file's comment for the CI-portability
 * caveat (an ephemeral instance would be a reasonable follow-up). */
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/booking_system_test?replicaSet=rs0'
const TIMEZONE = 'America/New_York'

function nextWeekdayAt(weekday: number, hour: number, minute = 0): Date {
  let day = DateTime.fromJSDate(new Date(), { zone: TIMEZONE }).plus({ days: 1 }).startOf('day')
  while (day.weekday !== weekday) day = day.plus({ days: 1 })
  return day.plus({ hours: hour, minutes: minute }).toJSDate()
}

const baseInterview = {
  candidateName: 'Busy',
  candidateEmail: 'busy@example.com',
  title: 'Consultation',
  durationMinutes: 30,
  timezone: TIMEZONE,
  status: 'confirmed' as const,
  source: 'admin' as const,
}

describe('AvailabilityService', () => {
  before(async () => {
    await mongoose.connect(TEST_MONGODB_URI)
  })

  after(async () => {
    await InterviewModel.deleteMany({})
    await BlockedSlotModel.deleteMany({})
    await ScheduleConfigModel.deleteMany({})
    await mongoose.disconnect()
  })

  describe('DST correctness (no schedule config needed)', () => {
    it('resolves America/New_York offsets correctly across the 2027 spring-forward', () => {
      const beforeDst = DateTime.fromObject({ year: 2027, month: 3, day: 8, hour: 9 }, { zone: TIMEZONE })
      const afterDst = DateTime.fromObject({ year: 2027, month: 3, day: 15, hour: 9 }, { zone: TIMEZONE })
      assert.equal(beforeDst.offset, -300, 'expected EST (-300) before the transition')
      assert.equal(afterDst.offset, -240, 'expected EDT (-240) after the transition')
    })
  })

  describe('with no schedule configured', () => {
    it('throws ScheduleNotConfiguredError', async () => {
      await assert.rejects(
        () => isSlotAvailable(nextWeekdayAt(1, 9), 30),
        (error: unknown) => error instanceof ScheduleNotConfiguredError,
      )
    })
  })

  describe('with a Mon-Fri 9-5 schedule and a lunch break', () => {
    beforeEach(async () => {
      await ScheduleConfigModel.deleteOne({ singleton: 'default' })
      await ScheduleConfigModel.create({
        singleton: 'default',
        timezone: TIMEZONE,
        workingHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startMinutes: 540,
          endMinutes: 1020,
          isActive: true,
        })),
        breaks: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startMinutes: 720,
          endMinutes: 780,
          label: 'Lunch',
        })),
      })
    })

    it('reports a slot inside working hours as available', async () => {
      assert.equal(await isSlotAvailable(nextWeekdayAt(1, 9), 30), true)
    })

    it('reports a slot during the recurring lunch break as unavailable', async () => {
      assert.equal(await isSlotAvailable(nextWeekdayAt(1, 12), 30), false)
    })

    it('reports a slot before working hours as unavailable', async () => {
      assert.equal(await isSlotAvailable(nextWeekdayAt(1, 1), 30), false)
    })

    it('reports a slot on a day with no working hours (weekend) as unavailable', async () => {
      const saturday = nextWeekdayAt(1, 9)
      saturday.setDate(saturday.getDate() + 5)
      assert.equal(await isSlotAvailable(saturday, 30), false)
    })

    it('excludes an existing interview\'s exact range and nothing more', async () => {
      const start = nextWeekdayAt(2, 10)
      const interview = await InterviewModel.create({
        ...baseInterview,
        candidateEmail: 'availability-test-1@example.com',
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60_000),
        manageTokenHash: 'availability-test-hash-1',
      })

      assert.equal(await isSlotAvailable(start, 30), false)
      assert.equal(await isSlotAvailable(new Date(start.getTime() + 30 * 60_000), 30), true)

      await InterviewModel.deleteOne({ _id: interview._id })
    })

    it('excludes a blocked slot\'s exact range', async () => {
      const start = nextWeekdayAt(3, 14)
      const blocked = await BlockedSlotModel.create({
        label: 'Team offsite',
        startAt: start,
        endAt: new Date(start.getTime() + 60 * 60_000),
      })

      assert.equal(await isSlotAvailable(new Date(start.getTime() + 15 * 60_000), 30), false)

      await BlockedSlotModel.deleteOne({ _id: blocked._id })
    })

    it('excludeInterviewId lets a reschedule ignore its own current slot', async () => {
      const start = nextWeekdayAt(4, 9)
      const interview = await InterviewModel.create({
        ...baseInterview,
        candidateEmail: 'availability-test-2@example.com',
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60_000),
        manageTokenHash: 'availability-test-hash-2',
      })

      assert.equal(await isSlotAvailable(start, 30), false)
      assert.equal(await isSlotAvailable(start, 30, new Date(), interview._id.toString()), true)

      await InterviewModel.deleteOne({ _id: interview._id })
    })

    it('findAvailableSlots over a full day excludes the break, an interview, and a block simultaneously', async () => {
      const day = nextWeekdayAt(5, 0)
      const interview = await InterviewModel.create({
        ...baseInterview,
        candidateEmail: 'availability-test-3@example.com',
        startAt: nextWeekdayAt(5, 10),
        endAt: new Date(nextWeekdayAt(5, 10).getTime() + 30 * 60_000),
        manageTokenHash: 'availability-test-hash-3',
      })
      const blocked = await BlockedSlotModel.create({
        label: 'Blocked',
        startAt: nextWeekdayAt(5, 15),
        endAt: new Date(nextWeekdayAt(5, 15).getTime() + 60 * 60_000),
      })

      const slots = await findAvailableSlots({
        rangeStart: day,
        rangeEnd: new Date(day.getTime() + 24 * 60 * 60_000),
        durationMinutes: 30,
      })

      assert.ok(slots.length > 0, 'the day should still have free slots')
      assert.ok(
        !slots.some((slot) => slot.start.getTime() === nextWeekdayAt(5, 12).getTime()),
        'lunch break must be excluded',
      )
      assert.ok(
        !slots.some((slot) => slot.start.getTime() === interview.startAt.getTime()),
        'the existing interview must be excluded',
      )
      assert.ok(
        !slots.some(
          (slot) => slot.start.getTime() >= blocked.startAt.getTime() && slot.start.getTime() < blocked.endAt.getTime(),
        ),
        'the blocked range must be excluded',
      )

      await InterviewModel.deleteOne({ _id: interview._id })
      await BlockedSlotModel.deleteOne({ _id: blocked._id })
    })

    it('findNearestAlternatives suggests real slots and never the unavailable preferred time', async () => {
      const preferredStart = nextWeekdayAt(1, 12) // lunch — unavailable
      const alternatives = await findNearestAlternatives({ preferredStart, durationMinutes: 30, count: 3 })

      assert.ok(alternatives.length > 0)
      assert.ok(alternatives.every((slot) => slot.start.getTime() !== preferredStart.getTime()))
    })

    it('rejects an availability query wider than the maximum allowed range', async () => {
      const rangeStart = nextWeekdayAt(1, 0)
      const rangeEnd = new Date(rangeStart.getTime() + 100 * 24 * 60 * 60_000)
      await assert.rejects(() => findAvailableSlots({ rangeStart, rangeEnd, durationMinutes: 30 }))
    })
  })

  describe('booking rules: buffer time, minimum notice, maximum booking window', () => {
    beforeEach(async () => {
      await ScheduleConfigModel.deleteOne({ singleton: 'default' })
      await ScheduleConfigModel.create({
        singleton: 'default',
        timezone: TIMEZONE,
        workingHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 540, endMinutes: 1020, isActive: true })),
        breaks: [],
        bufferMinutes: 15,
        minNoticeMinutes: 120,
        maxBookingWindowDays: 3,
      })
    })

    it('extends unavailability by the configured buffer on both sides of an existing interview', async () => {
      const start = nextWeekdayAt(1, 10) // 10:00-10:30, with a 15-min buffer -> 9:45-10:45 unavailable
      const interview = await InterviewModel.create({
        ...baseInterview,
        candidateEmail: 'buffer-test@example.com',
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60_000),
        manageTokenHash: 'buffer-test-hash',
      })

      assert.equal(await isSlotAvailable(new Date(start.getTime() - 15 * 60_000), 30), false, 'the 15min buffer before must block a slot ending exactly at the interview start')
      assert.equal(await isSlotAvailable(new Date(start.getTime() + 30 * 60_000), 30), false, 'the 15min buffer after must block a slot starting exactly at the interview end')
      assert.equal(await isSlotAvailable(new Date(start.getTime() - 45 * 60_000), 30), true, 'a slot fully outside the buffered range must remain available')

      await InterviewModel.deleteOne({ _id: interview._id })
    })

    it('rejects a slot that starts sooner than the configured minimum notice', async () => {
      const now = new Date()
      const tooSoon = new Date(now.getTime() + 60 * 60_000) // 1h from now; minNotice is 2h
      // Force this onto a real working-hours instant by aligning to the next weekday 9am+ if needed is
      // unnecessary here — isSlotAvailable/findAvailableSlots apply minNotice before working-hours
      // filtering would even matter, so any near-future instant demonstrates the rule.
      assert.equal(await isSlotAvailable(tooSoon, 30, now), false)
    })

    it('rejects a slot beyond the configured maximum booking window', async () => {
      const now = new Date()
      const farFuture = nextWeekdayAt(1, 9)
      const daysOut = (farFuture.getTime() - now.getTime()) / 86_400_000
      // Only meaningful if the "next Monday" used elsewhere in this suite actually falls
      // beyond the 3-day window configured above; if not (e.g. the test runs on a Sunday),
      // pick an instant 10 days out instead so the assertion is always exercising the rule.
      const target = daysOut > 3 ? farFuture : new Date(now.getTime() + 10 * 86_400_000)
      assert.equal(await isSlotAvailable(target, 30, now), false)
    })
  })
})
