import http from 'node:http'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { DateTime } from 'luxon'
import { createApp } from '../app.js'
import { UserModel } from '../models/User.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { createInterview } from '../services/interview.service.js'

/**
 * HTTP-level ownership/IDOR tests for the authenticated "my interviews" API
 * (myInterviews.route.ts/controller.ts) — user A must never be able to read, reschedule, or
 * cancel user B's interview by guessing/reusing its id, even though both are authenticated.
 */
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/booking_system_test?replicaSet=rs0'
const TEST_PORT = 4095
const BASE_URL = `http://localhost:${TEST_PORT}`
const TIMEZONE = 'America/New_York'

let server: http.Server

function nextWeekdayAt(weekday: number, hour: number): Date {
  let day = DateTime.fromJSDate(new Date(), { zone: TIMEZONE }).plus({ days: 1 }).startOf('day')
  while (day.weekday !== weekday) day = day.plus({ days: 1 })
  return day.plus({ hours: hour }).toJSDate()
}

function extractCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  assert.ok(setCookie, 'expected a Set-Cookie header')
  return setCookie.split(';')[0] ?? ''
}

async function registerAndLogin(email: string, name: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'a-reasonable-test-password1', timezone: TIMEZONE }),
  })
  assert.equal(response.status, 201)
  return extractCookie(response)
}

describe('my-interviews ownership and authorization', () => {
  const userAEmail = 'idor-user-a@example.com'
  const userBEmail = 'idor-user-b@example.com'
  let cookieA: string
  let cookieB: string

  before(async () => {
    await mongoose.connect(TEST_MONGODB_URI)
    await UserModel.deleteMany({ email: { $in: [userAEmail, userBEmail] } })
    await ScheduleConfigModel.deleteOne({ singleton: 'default' })
    await ScheduleConfigModel.create({
      singleton: 'default',
      timezone: TIMEZONE,
      workingHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 540, endMinutes: 1020, isActive: true })),
      breaks: [],
    })

    const app = createApp()
    server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve))

    cookieA = await registerAndLogin(userAEmail, 'User A')
    cookieB = await registerAndLogin(userBEmail, 'User B')
  })

  after(async () => {
    await InterviewModel.deleteMany({ candidateEmail: { $in: [userAEmail, userBEmail] } })
    await UserModel.deleteMany({ email: { $in: [userAEmail, userBEmail] } })
    await ScheduleConfigModel.deleteMany({})
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await mongoose.disconnect()
  })

  it('rejects the my-interviews list route with no session', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/my/interviews`)
    assert.equal(response.status, 401)
  })

  it("a user only ever sees interviews attached to their own account, never another user's", async () => {
    const { interview: interviewA } = await createInterview({
      title: 'User A Interview',
      candidateName: 'User A',
      candidateEmail: userAEmail,
      startAt: nextWeekdayAt(1, 9),
      durationMinutes: 30,
      timezone: TIMEZONE,
      source: 'public',
    })

    const { interview: interviewB } = await createInterview({
      title: 'User B Interview',
      candidateName: 'User B',
      candidateEmail: userBEmail,
      startAt: nextWeekdayAt(2, 9),
      durationMinutes: 30,
      timezone: TIMEZONE,
      source: 'public',
    })

    const listA = (await (
      await fetch(`${BASE_URL}/api/v1/my/interviews`, { headers: { Cookie: cookieA } })
    ).json()) as { interviews: Array<{ id: string }> }
    const idsA = listA.interviews.map((interview) => interview.id)
    assert.ok(idsA.includes(interviewA._id.toString()), "user A must see their own interview")
    assert.ok(!idsA.includes(interviewB._id.toString()), "user A must never see user B's interview")

    // GET by id: user B's interview id, using user A's session, must 404 (not leak existence via 403).
    const getForeign = await fetch(`${BASE_URL}/api/v1/my/interviews/${interviewB._id.toString()}`, {
      headers: { Cookie: cookieA },
    })
    assert.equal(getForeign.status, 404)

    // PATCH (reschedule) attempt on a foreign interview must fail and must not mutate it.
    const patchForeign = await fetch(`${BASE_URL}/api/v1/my/interviews/${interviewB._id.toString()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ newStart: nextWeekdayAt(3, 9).toISOString() }),
    })
    assert.equal(patchForeign.status, 404)

    // DELETE (cancel) attempt on a foreign interview must fail and must not mutate it.
    const deleteForeign = await fetch(`${BASE_URL}/api/v1/my/interviews/${interviewB._id.toString()}`, {
      method: 'DELETE',
      headers: { Cookie: cookieA },
    })
    assert.equal(deleteForeign.status, 404)

    const untouched = await InterviewModel.findById(interviewB._id)
    assert.equal(untouched?.status, 'confirmed', "user A's failed attempts must never affect user B's interview")

    // User B, acting on their own interview, succeeds.
    const ownPatch = await fetch(`${BASE_URL}/api/v1/my/interviews/${interviewB._id.toString()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieB },
      body: JSON.stringify({ newStart: nextWeekdayAt(4, 9).toISOString() }),
    })
    assert.equal(ownPatch.status, 200)
  })

  it('an interview booked while signed in is auto-attached to that account without any client-supplied userId', async () => {
    const bookResponse = await fetch(`${BASE_URL}/api/v1/interviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        title: 'Auto-attached Booking',
        candidateName: 'User A',
        candidateEmail: userAEmail,
        startAt: nextWeekdayAt(5, 9).toISOString(),
        durationMinutes: 30,
        timezone: TIMEZONE,
        // Attempt to smuggle a foreign userId — must be ignored; Zod strips unknown keys.
        userId: '000000000000000000000000',
      }),
    })
    assert.equal(bookResponse.status, 201)
    const body = (await bookResponse.json()) as { interview: { id: string } }

    const found = await InterviewModel.findById(body.interview.id)
    assert.ok(found?.userId, 'expected userId to be auto-attached from the session')

    const userA = await UserModel.findOne({ email: userAEmail })
    assert.equal(found?.userId?.toString(), userA?._id.toString())
  })
})
