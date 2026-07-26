import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { DateTime } from 'luxon'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { BlockedSlotModel } from '../models/BlockedSlot.model.js'
import { BookingLockModel } from '../models/BookingLock.model.js'
import {
  cancelInterview,
  createInterview,
  getInterviewByToken,
  hashManageToken,
  rescheduleInterview,
} from './interview.service.js'
import { SlotConflictError, InterviewNotFoundError, BookingValidationError } from './booking.errors.js'

/**
 * Integration tests against a real MongoDB replica set — the same project-dedicated local
 * instance the README's "Local MongoDB" section documents — but a separate database name so
 * test runs never touch dev data. This isn't hermetic/CI-portable the way an ephemeral
 * instance (mongodb-memory-server, or a Dockerized Mongo) would be; that's a reasonable
 * follow-up once CI exists, not needed yet.
 */
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/booking_system_test?replicaSet=rs0'

function nextWeekdayAt(weekday: number, hour: number): Date {
  const zone = 'America/New_York'
  let day = DateTime.fromJSDate(new Date(), { zone }).plus({ days: 1 }).startOf('day')
  while (day.weekday !== weekday) day = day.plus({ days: 1 })
  return day.plus({ hours: hour }).toJSDate()
}

const baseInput = {
  title: 'Consultation',
  candidateName: 'Ada Lovelace',
  candidateEmail: 'ada@example.com',
  durationMinutes: 30,
  timezone: 'America/New_York',
} as const

describe('InterviewService', () => {
  before(async () => {
    await mongoose.connect(TEST_MONGODB_URI)
    await ScheduleConfigModel.deleteMany({})
    await ScheduleConfigModel.create({
      singleton: 'default',
      timezone: 'America/New_York',
      workingHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 540, endMinutes: 1020, isActive: true })),
      breaks: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 720, endMinutes: 780, label: 'Lunch' })),
    })
  })

  after(async () => {
    await InterviewModel.deleteMany({})
    await BlockedSlotModel.deleteMany({})
    await BookingLockModel.deleteMany({})
    await ScheduleConfigModel.deleteMany({})
    await mongoose.disconnect()
  })

  it('creates an interview and returns a raw manage token distinct from its stored hash', async () => {
    const start = nextWeekdayAt(1, 9) // next Monday, 9:00 AM
    const { interview, manageToken } = await createInterview({
      ...baseInput,
      startAt: start,
      source: 'public',
    })

    assert.equal(interview.status, 'confirmed')
    assert.equal(interview.interviewType, 'custom')
    assert.equal(interview.round, 1)
    assert.notEqual(manageToken, interview.manageTokenHash)
    assert.equal(hashManageToken(manageToken), interview.manageTokenHash)

    await InterviewModel.deleteOne({ _id: interview._id })
  })

  it('rejects a booking outside working hours and offers alternatives', async () => {
    const start = nextWeekdayAt(2, 22) // next Tuesday, 10:00 PM — outside 9-5
    await assert.rejects(
      () =>
        createInterview({
          ...baseInput,
          candidateEmail: 'grace@example.com',
          startAt: start,
          source: 'public',
        }),
      (error: unknown) => {
        assert.ok(error instanceof SlotConflictError)
        assert.ok(error.alternatives.length > 0)
        return true
      },
    )
  })

  it('rejects booking in the past', async () => {
    await assert.rejects(
      () =>
        createInterview({
          ...baseInput,
          candidateEmail: 'past@example.com',
          startAt: new Date('2020-01-01T09:00:00.000Z'),
          source: 'public',
        }),
      (error: unknown) => error instanceof BookingValidationError,
    )
  })

  it('rejects a sequential double-booking of the exact same slot', async () => {
    const start = nextWeekdayAt(3, 10) // next Wednesday, 10:00 AM
    const first = await createInterview({
      ...baseInput,
      candidateEmail: 'first@example.com',
      startAt: start,
      source: 'public',
    })

    await assert.rejects(
      () =>
        createInterview({
          ...baseInput,
          candidateEmail: 'second@example.com',
          startAt: start,
          source: 'public',
        }),
      (error: unknown) => error instanceof SlotConflictError,
    )

    await InterviewModel.deleteOne({ _id: first.interview._id })
  })

  it('prevents a true concurrent double-booking race — exactly one of two simultaneous requests succeeds', async () => {
    const start = nextWeekdayAt(4, 11) // next Thursday, 11:00 AM

    const input = (candidateEmail: string) => ({
      ...baseInput,
      candidateEmail,
      startAt: start,
      source: 'public' as const,
    })

    const results = await Promise.allSettled([createInterview(input('racer-a@example.com')), createInterview(input('racer-b@example.com'))])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    assert.equal(fulfilled.length, 1, 'exactly one concurrent booking attempt must succeed')
    assert.equal(rejected.length, 1, 'exactly one concurrent booking attempt must fail')
    assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof SlotConflictError)

    const winner = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createInterview>>>).value
    const overlapping = await InterviewModel.find({
      status: { $in: ['pending', 'confirmed'] },
      startAt: { $lt: new Date(start.getTime() + 30 * 60_000) },
      endAt: { $gt: start },
    })
    assert.equal(overlapping.length, 1, 'the database must contain exactly one interview for this slot, not two')

    await InterviewModel.deleteOne({ _id: winner.interview._id })
  })

  it('reschedules an interview to a new available time and records reschedule history', async () => {
    const start = nextWeekdayAt(5, 9) // next Friday, 9:00 AM
    const { interview } = await createInterview({
      ...baseInput,
      candidateEmail: 'reschedule@example.com',
      startAt: start,
      source: 'admin',
    })

    const newStart = nextWeekdayAt(5, 14) // same Friday, 2:00 PM
    const updated = await rescheduleInterview(interview._id.toString(), newStart)
    assert.equal(updated.startAt.getTime(), newStart.getTime())
    assert.equal(updated.rescheduleHistory.length, 1)
    assert.equal(updated.rescheduleHistory[0]?.previousStartAt.getTime(), start.getTime())

    await InterviewModel.deleteOne({ _id: interview._id })
  })

  it('allows rescheduling into a time that overlaps only its own current slot', async () => {
    const start = nextWeekdayAt(1, 9) // next Monday, 9:00 AM (30 min: 9:00-9:30)
    const { interview } = await createInterview({
      ...baseInput,
      candidateEmail: 'self-overlap@example.com',
      startAt: start,
      source: 'admin',
    })

    const newStart = new Date(start.getTime() + 15 * 60_000) // 9:15-9:45 — overlaps only itself
    const updated = await rescheduleInterview(interview._id.toString(), newStart)
    assert.equal(updated.startAt.getTime(), newStart.getTime())

    await InterviewModel.deleteOne({ _id: interview._id })
  })

  it('rejects rescheduling into a time that conflicts with a different interview', async () => {
    const startA = nextWeekdayAt(2, 9) // next Tuesday, 9:00 AM
    const startB = nextWeekdayAt(2, 10) // next Tuesday, 10:00 AM

    const a = await createInterview({ ...baseInput, candidateEmail: 'a@example.com', startAt: startA, source: 'admin' })
    const b = await createInterview({ ...baseInput, candidateEmail: 'b@example.com', startAt: startB, source: 'admin' })

    await assert.rejects(
      () => rescheduleInterview(a.interview._id.toString(), startB),
      (error: unknown) => error instanceof SlotConflictError,
    )

    await InterviewModel.deleteMany({ _id: { $in: [a.interview._id, b.interview._id] } })
  })

  it('cancels an interview (soft delete) and it remains queryable', async () => {
    const start = nextWeekdayAt(3, 9) // next Wednesday, 9:00 AM
    const { interview } = await createInterview({
      ...baseInput,
      candidateEmail: 'cancel@example.com',
      startAt: start,
      source: 'public',
    })

    const cancelled = await cancelInterview(interview._id.toString())
    assert.equal(cancelled.status, 'cancelled')

    const stillExists = await InterviewModel.findById(interview._id)
    assert.ok(stillExists, 'cancelled interviews must not be hard-deleted')
    assert.equal(stillExists?.status, 'cancelled')

    await assert.rejects(
      () => cancelInterview(interview._id.toString()),
      (error: unknown) => error instanceof InterviewNotFoundError,
    )

    await InterviewModel.deleteOne({ _id: interview._id })
  })

  it('resolves an interview by its raw manage token, and returns null for a wrong token', async () => {
    const start = nextWeekdayAt(4, 9) // next Thursday, 9:00 AM
    const { interview, manageToken } = await createInterview({
      ...baseInput,
      candidateEmail: 'token@example.com',
      startAt: start,
      source: 'public',
    })

    const found = await getInterviewByToken(manageToken)
    assert.equal(found?._id.toString(), interview._id.toString())

    const notFound = await getInterviewByToken('0'.repeat(64))
    assert.equal(notFound, null)

    await InterviewModel.deleteOne({ _id: interview._id })
  })

  it('applies interview-specific fields (type, round, location, interviewer) on creation', async () => {
    const start = nextWeekdayAt(1, 10)
    const { interview } = await createInterview({
      ...baseInput,
      candidateEmail: 'typed@example.com',
      startAt: start,
      source: 'admin',
      title: 'Backend Technical Round',
      interviewType: 'technical',
      round: 2,
      locationType: 'video',
      meetingUrl: 'https://meet.example.com/abc',
      interviewerName: 'Priya Sharma',
      interviewerEmail: 'priya@example.com',
    })

    assert.equal(interview.interviewType, 'technical')
    assert.equal(interview.round, 2)
    assert.equal(interview.locationType, 'video')
    assert.equal(interview.meetingUrl, 'https://meet.example.com/abc')
    assert.equal(interview.interviewerName, 'Priya Sharma')

    await InterviewModel.deleteOne({ _id: interview._id })
  })
})
