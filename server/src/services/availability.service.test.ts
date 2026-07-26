import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { DateTime } from 'luxon'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { AppointmentModel } from '../models/Appointment.model.js'
import { BlockedSlotModel } from '../models/BlockedSlot.model.js'
import {
  findAvailableSlots,
  findNearestAlternatives,
  isSlotAvailable,
  ScheduleNotConfiguredError,
} from './availability.service.js'

/** Same project-dedicated local replica set as appointment.service.test.ts, under the same
 * separate booking_system_test database — see that file's comment for the CI-portability
 * caveat (an ephemeral instance would be a reasonable Phase 13/14 follow-up). */
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/booking_system_test?replicaSet=rs0'
const TIMEZONE = 'America/New_York'

function nextWeekdayAt(weekday: number, hour: number, minute = 0): Date {
  let day = DateTime.fromJSDate(new Date(), { zone: TIMEZONE }).plus({ days: 1 }).startOf('day')
  while (day.weekday !== weekday) day = day.plus({ days: 1 })
  return day.plus({ hours: hour, minutes: minute }).toJSDate()
}

describe('AvailabilityService', () => {
  before(async () => {
    await mongoose.connect(TEST_MONGODB_URI)
  })

  after(async () => {
    await AppointmentModel.deleteMany({})
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

    it('excludes an existing appointment\'s exact range and nothing more', async () => {
      const start = nextWeekdayAt(2, 10)
      const appointment = await AppointmentModel.create({
        name: 'Busy',
        email: 'busy@example.com',
        purpose: 'Test',
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60_000),
        durationMinutes: 30,
        timezone: TIMEZONE,
        status: 'confirmed',
        source: 'admin',
        manageTokenHash: 'availability-test-hash-1',
      })

      assert.equal(await isSlotAvailable(start, 30), false)
      assert.equal(await isSlotAvailable(new Date(start.getTime() + 30 * 60_000), 30), true)

      await AppointmentModel.deleteOne({ _id: appointment._id })
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

    it('excludeAppointmentId lets a reschedule ignore its own current slot', async () => {
      const start = nextWeekdayAt(4, 9)
      const appointment = await AppointmentModel.create({
        name: 'Self',
        email: 'self@example.com',
        purpose: 'Test',
        startAt: start,
        endAt: new Date(start.getTime() + 30 * 60_000),
        durationMinutes: 30,
        timezone: TIMEZONE,
        status: 'confirmed',
        source: 'admin',
        manageTokenHash: 'availability-test-hash-2',
      })

      assert.equal(await isSlotAvailable(start, 30), false)
      assert.equal(await isSlotAvailable(start, 30, new Date(), appointment._id.toString()), true)

      await AppointmentModel.deleteOne({ _id: appointment._id })
    })

    it('findAvailableSlots over a full day excludes the break, an appointment, and a block simultaneously', async () => {
      const day = nextWeekdayAt(5, 0)
      const appointment = await AppointmentModel.create({
        name: 'Busy',
        email: 'busy2@example.com',
        purpose: 'Test',
        startAt: nextWeekdayAt(5, 10),
        endAt: new Date(nextWeekdayAt(5, 10).getTime() + 30 * 60_000),
        durationMinutes: 30,
        timezone: TIMEZONE,
        status: 'confirmed',
        source: 'admin',
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
        !slots.some((slot) => slot.start.getTime() === appointment.startAt.getTime()),
        'the existing appointment must be excluded',
      )
      assert.ok(
        !slots.some(
          (slot) => slot.start.getTime() >= blocked.startAt.getTime() && slot.start.getTime() < blocked.endAt.getTime(),
        ),
        'the blocked range must be excluded',
      )

      await AppointmentModel.deleteOne({ _id: appointment._id })
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
})
