import http from 'node:http'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { io, type Socket } from 'socket.io-client'
import { DateTime } from 'luxon'
import { InterviewModel } from '../models/Interview.model.js'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { createInterview, cancelInterview } from '../services/interview.service.js'
import { initSocketServer } from './socketServer.js'

/**
 * Self-contained: starts its own http+socket server in THIS process. This matters because
 * interviewEvents (the EventEmitter interview.service.ts publishes to) is a per-process
 * singleton — a separate test process calling the service would never reach a different
 * process's Socket.IO instance.
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

  it('broadcasts interview.created with the correct public-safe payload after a real booking', async () => {
    const createdEventPromise = waitForEvent('interview.created')
    const { interview } = await createInterview({
      title: 'Realtime Test',
      candidateName: 'Realtime Test',
      candidateEmail: 'realtime-test@example.com',
      startAt: nextMondayAt(10),
      durationMinutes: 30,
      timezone: TIMEZONE,
      source: 'admin',
    })

    const payload = (await createdEventPromise) as { id: string; status: string }
    assert.equal(payload.id, interview._id.toString())
    assert.equal(payload.status, 'confirmed')
    assert.ok(!('candidateName' in payload), 'the broadcast payload must never include candidateName (public-safe, matching the calendar read endpoint)')
    assert.ok(!('candidateEmail' in payload), 'the broadcast payload must never include candidateEmail')

    await InterviewModel.deleteOne({ _id: interview._id })
  })

  it('broadcasts interview.cancelled after a cancellation', async () => {
    const { interview } = await createInterview({
      title: 'Realtime Cancel Test',
      candidateName: 'Realtime Cancel Test',
      candidateEmail: 'realtime-cancel@example.com',
      startAt: nextMondayAt(11),
      durationMinutes: 30,
      timezone: TIMEZONE,
      source: 'admin',
    })

    const cancelledEventPromise = waitForEvent('interview.cancelled')
    await cancelInterview(interview._id.toString())
    const payload = (await cancelledEventPromise) as { id: string; status: string }

    assert.equal(payload.id, interview._id.toString())
    assert.equal(payload.status, 'cancelled')

    await InterviewModel.deleteOne({ _id: interview._id })
  })
})
