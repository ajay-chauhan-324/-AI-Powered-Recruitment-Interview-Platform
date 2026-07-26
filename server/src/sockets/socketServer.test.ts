import http from 'node:http'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { io, type Socket } from 'socket.io-client'
import { DateTime } from 'luxon'
import { AppointmentModel } from '../models/Appointment.model.js'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { createAppointment, cancelAppointment } from '../services/appointment.service.js'
import { initSocketServer } from './socketServer.js'

/**
 * Self-contained: starts its own http+socket server in THIS process. This matters because
 * appointmentEvents (the EventEmitter appointment.service.ts publishes to) is a per-process
 * singleton — a separate test process calling the service would never reach a different
 * process's Socket.IO instance. This is the permanent version of the ad-hoc script used to
 * verify Phase 6; CLAUDE.md's Phase 12 checklist explicitly names "Real-time behavior" as
 * its own test dimension, so it shouldn't only have been checked once and thrown away.
 */
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/booking_system_test?replicaSet=rs0'
const TEST_PORT = 4097
const TIMEZONE = 'America/New_York'

let httpServer: http.Server
let socket: Socket
let existingConfig: boolean

function waitForEvent(eventName: string, timeoutMs = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeoutMs)
    socket.once(eventName, (payload: unknown) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

function nextMondayAt(hour: number): Date {
  let day = DateTime.now().setZone(TIMEZONE).plus({ days: 1 }).startOf('day')
  while (day.weekday !== 1) day = day.plus({ days: 1 })
  return day.plus({ hours: hour }).toJSDate()
}

describe('real-time domain events', () => {
  before(async () => {
    await mongoose.connect(TEST_MONGODB_URI)

    existingConfig = (await ScheduleConfigModel.findOne({ singleton: 'default' })) !== null
    if (!existingConfig) {
      await ScheduleConfigModel.create({
        singleton: 'default',
        timezone: TIMEZONE,
        workingHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 540, endMinutes: 1020, isActive: true })),
        breaks: [],
      })
    }

    httpServer = http.createServer()
    initSocketServer(httpServer)
    await new Promise<void>((resolve) => httpServer.listen(TEST_PORT, resolve))

    socket = io(`http://localhost:${TEST_PORT}/calendar`, { path: '/socket.io', transports: ['websocket'] })
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve())
      socket.on('connect_error', reject)
    })
  })

  after(async () => {
    socket.disconnect()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    if (!existingConfig) {
      await ScheduleConfigModel.deleteOne({ singleton: 'default' })
    }
    await mongoose.disconnect()
  })

  it('broadcasts appointment.created with the correct public-safe payload after a real booking', async () => {
    const createdEventPromise = waitForEvent('appointment.created')
    const { appointment } = await createAppointment({
      name: 'Realtime Test',
      email: 'realtime-test@example.com',
      purpose: 'Verify socket delivery',
      startAt: nextMondayAt(10),
      durationMinutes: 30,
      timezone: TIMEZONE,
      source: 'admin',
    })

    const payload = (await createdEventPromise) as { id: string; status: string }
    assert.equal(payload.id, appointment._id.toString())
    assert.equal(payload.status, 'confirmed')
    assert.ok(!('name' in payload), 'the broadcast payload must never include name (public-safe, matching the calendar read endpoint)')
    assert.ok(!('email' in payload), 'the broadcast payload must never include email')

    await AppointmentModel.deleteOne({ _id: appointment._id })
  })

  it('broadcasts appointment.cancelled after a cancellation', async () => {
    const { appointment } = await createAppointment({
      name: 'Realtime Cancel Test',
      email: 'realtime-cancel@example.com',
      purpose: 'Verify cancel event',
      startAt: nextMondayAt(11),
      durationMinutes: 30,
      timezone: TIMEZONE,
      source: 'admin',
    })

    const cancelledEventPromise = waitForEvent('appointment.cancelled')
    await cancelAppointment(appointment._id.toString())
    const payload = (await cancelledEventPromise) as { id: string; status: string }

    assert.equal(payload.id, appointment._id.toString())
    assert.equal(payload.status, 'cancelled')

    await AppointmentModel.deleteOne({ _id: appointment._id })
  })
})
