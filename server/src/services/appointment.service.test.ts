import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { DateTime } from 'luxon'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { AppointmentModel } from '../models/Appointment.model.js'
import { BlockedSlotModel } from '../models/BlockedSlot.model.js'
import { BookingLockModel } from '../models/BookingLock.model.js'
import {
  cancelAppointment,
  createAppointment,
  getAppointmentByToken,
  hashManageToken,
  rescheduleAppointment,
} from './appointment.service.js'
import { SlotConflictError, AppointmentNotFoundError, BookingValidationError } from './booking.errors.js'

/**
 * Integration tests against a real MongoDB replica set — the same
 * project-dedicated local instance Phase 2/3 set up (see README "Local
 * MongoDB"), but a separate database name so test runs never touch dev
 * data. This isn't hermetic/CI-portable the way an ephemeral instance
 * (mongodb-memory-server, or a Dockerized Mongo) would be; that's a
 * reasonable follow-up for Phase 12/13 once CI exists, not needed yet.
 */
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/booking_system_test?replicaSet=rs0'

function nextWeekdayAt(weekday: number, hour: number): Date {
  const zone = 'America/New_York'
  let day = DateTime.fromJSDate(new Date(), { zone }).plus({ days: 1 }).startOf('day')
  while (day.weekday !== weekday) day = day.plus({ days: 1 })
  return day.plus({ hours: hour }).toJSDate()
}

describe('AppointmentService', () => {
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
    await AppointmentModel.deleteMany({})
    await BlockedSlotModel.deleteMany({})
    await BookingLockModel.deleteMany({})
    await ScheduleConfigModel.deleteMany({})
    await mongoose.disconnect()
  })

  it('creates an appointment and returns a raw manage token distinct from its stored hash', async () => {
    const start = nextWeekdayAt(1, 9) // next Monday, 9:00 AM
    const { appointment, manageToken } = await createAppointment({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      purpose: 'Consultation',
      startAt: start,
      durationMinutes: 30,
      timezone: 'America/New_York',
      source: 'public',
    })

    assert.equal(appointment.status, 'confirmed')
    assert.notEqual(manageToken, appointment.manageTokenHash)
    assert.equal(hashManageToken(manageToken), appointment.manageTokenHash)

    await AppointmentModel.deleteOne({ _id: appointment._id })
  })

  it('rejects a booking outside working hours and offers alternatives', async () => {
    const start = nextWeekdayAt(2, 22) // next Tuesday, 10:00 PM — outside 9-5
    await assert.rejects(
      () =>
        createAppointment({
          name: 'Grace Hopper',
          email: 'grace@example.com',
          purpose: 'Consultation',
          startAt: start,
          durationMinutes: 30,
          timezone: 'America/New_York',
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
        createAppointment({
          name: 'Past Booker',
          email: 'past@example.com',
          purpose: 'Consultation',
          startAt: new Date('2020-01-01T09:00:00.000Z'),
          durationMinutes: 30,
          timezone: 'America/New_York',
          source: 'public',
        }),
      (error: unknown) => error instanceof BookingValidationError,
    )
  })

  it('rejects a sequential double-booking of the exact same slot', async () => {
    const start = nextWeekdayAt(3, 10) // next Wednesday, 10:00 AM
    const first = await createAppointment({
      name: 'First Booker',
      email: 'first@example.com',
      purpose: 'Consultation',
      startAt: start,
      durationMinutes: 30,
      timezone: 'America/New_York',
      source: 'public',
    })

    await assert.rejects(
      () =>
        createAppointment({
          name: 'Second Booker',
          email: 'second@example.com',
          purpose: 'Consultation',
          startAt: start,
          durationMinutes: 30,
          timezone: 'America/New_York',
          source: 'public',
        }),
      (error: unknown) => error instanceof SlotConflictError,
    )

    await AppointmentModel.deleteOne({ _id: first.appointment._id })
  })

  it('prevents a true concurrent double-booking race — exactly one of two simultaneous requests succeeds', async () => {
    const start = nextWeekdayAt(4, 11) // next Thursday, 11:00 AM

    const input = (name: string, email: string) => ({
      name,
      email,
      purpose: 'Consultation',
      startAt: start,
      durationMinutes: 30,
      timezone: 'America/New_York',
      source: 'public' as const,
    })

    const results = await Promise.allSettled([
      createAppointment(input('Racer A', 'racer-a@example.com')),
      createAppointment(input('Racer B', 'racer-b@example.com')),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    assert.equal(fulfilled.length, 1, 'exactly one concurrent booking attempt must succeed')
    assert.equal(rejected.length, 1, 'exactly one concurrent booking attempt must fail')
    assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof SlotConflictError)

    const winner = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createAppointment>>>).value
    const overlapping = await AppointmentModel.find({
      status: { $in: ['pending', 'confirmed'] },
      startAt: { $lt: new Date(start.getTime() + 30 * 60_000) },
      endAt: { $gt: start },
    })
    assert.equal(overlapping.length, 1, 'the database must contain exactly one appointment for this slot, not two')

    await AppointmentModel.deleteOne({ _id: winner.appointment._id })
  })

  it('reschedules an appointment to a new available time', async () => {
    const start = nextWeekdayAt(5, 9) // next Friday, 9:00 AM
    const { appointment } = await createAppointment({
      name: 'Reschedule Me',
      email: 'reschedule@example.com',
      purpose: 'Consultation',
      startAt: start,
      durationMinutes: 30,
      timezone: 'America/New_York',
      source: 'admin',
    })

    const newStart = nextWeekdayAt(5, 14) // same Friday, 2:00 PM
    const updated = await rescheduleAppointment(appointment._id.toString(), newStart)
    assert.equal(updated.startAt.getTime(), newStart.getTime())

    await AppointmentModel.deleteOne({ _id: appointment._id })
  })

  it('allows rescheduling into a time that overlaps only its own current slot', async () => {
    const start = nextWeekdayAt(1, 9) // next Monday, 9:00 AM (30 min: 9:00-9:30)
    const { appointment } = await createAppointment({
      name: 'Self Overlap',
      email: 'self-overlap@example.com',
      purpose: 'Consultation',
      startAt: start,
      durationMinutes: 30,
      timezone: 'America/New_York',
      source: 'admin',
    })

    const newStart = new Date(start.getTime() + 15 * 60_000) // 9:15-9:45 — overlaps only itself
    const updated = await rescheduleAppointment(appointment._id.toString(), newStart)
    assert.equal(updated.startAt.getTime(), newStart.getTime())

    await AppointmentModel.deleteOne({ _id: appointment._id })
  })

  it('rejects rescheduling into a time that conflicts with a different appointment', async () => {
    const startA = nextWeekdayAt(2, 9) // next Tuesday, 9:00 AM
    const startB = nextWeekdayAt(2, 10) // next Tuesday, 10:00 AM

    const a = await createAppointment({
      name: 'Appointment A',
      email: 'a@example.com',
      purpose: 'Consultation',
      startAt: startA,
      durationMinutes: 30,
      timezone: 'America/New_York',
      source: 'admin',
    })
    const b = await createAppointment({
      name: 'Appointment B',
      email: 'b@example.com',
      purpose: 'Consultation',
      startAt: startB,
      durationMinutes: 30,
      timezone: 'America/New_York',
      source: 'admin',
    })

    await assert.rejects(
      () => rescheduleAppointment(a.appointment._id.toString(), startB),
      (error: unknown) => error instanceof SlotConflictError,
    )

    await AppointmentModel.deleteMany({ _id: { $in: [a.appointment._id, b.appointment._id] } })
  })

  it('cancels an appointment (soft delete) and it remains queryable', async () => {
    const start = nextWeekdayAt(3, 9) // next Wednesday, 9:00 AM
    const { appointment } = await createAppointment({
      name: 'Cancel Me',
      email: 'cancel@example.com',
      purpose: 'Consultation',
      startAt: start,
      durationMinutes: 30,
      timezone: 'America/New_York',
      source: 'public',
    })

    const cancelled = await cancelAppointment(appointment._id.toString())
    assert.equal(cancelled.status, 'cancelled')

    const stillExists = await AppointmentModel.findById(appointment._id)
    assert.ok(stillExists, 'cancelled appointments must not be hard-deleted')
    assert.equal(stillExists?.status, 'cancelled')

    await assert.rejects(
      () => cancelAppointment(appointment._id.toString()),
      (error: unknown) => error instanceof AppointmentNotFoundError,
    )

    await AppointmentModel.deleteOne({ _id: appointment._id })
  })

  it('resolves an appointment by its raw manage token, and returns null for a wrong token', async () => {
    const start = nextWeekdayAt(4, 9) // next Thursday, 9:00 AM
    const { appointment, manageToken } = await createAppointment({
      name: 'Token Lookup',
      email: 'token@example.com',
      purpose: 'Consultation',
      startAt: start,
      durationMinutes: 30,
      timezone: 'America/New_York',
      source: 'public',
    })

    const found = await getAppointmentByToken(manageToken)
    assert.equal(found?._id.toString(), appointment._id.toString())

    const notFound = await getAppointmentByToken('0'.repeat(64))
    assert.equal(notFound, null)

    await AppointmentModel.deleteOne({ _id: appointment._id })
  })
})
