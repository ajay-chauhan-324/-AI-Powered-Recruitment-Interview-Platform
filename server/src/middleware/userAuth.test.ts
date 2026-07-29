import http from 'node:http'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { createApp } from '../app.js'
import { UserModel } from '../models/User.model.js'

/**
 * HTTP-level tests for candidate/user authentication — mirrors adminAuth.test.ts's approach
 * (authorization is fundamentally an HTTP/middleware concern), but for the separate,
 * self-service `user_session` auth system (userAuth.ts), which must remain fully independent
 * from admin auth (CLAUDE.md: "without weakening the existing admin authentication").
 */
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/booking_system_test?replicaSet=rs0'
const TEST_PORT = 4096
const BASE_URL = `http://localhost:${TEST_PORT}`

let server: http.Server
const testEmail = 'user-auth-test@example.com'
const testPassword = 'a-reasonable-test-password1'

function extractCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  assert.ok(setCookie, 'expected a Set-Cookie header')
  return setCookie.split(';')[0] ?? ''
}

describe('candidate/user authentication', () => {
  before(async () => {
    await mongoose.connect(TEST_MONGODB_URI)
    await UserModel.deleteMany({ email: { $in: [testEmail, 'other-registrant@example.com'] } })

    const app = createApp()
    server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve))
  })

  after(async () => {
    await UserModel.deleteMany({ email: { $in: [testEmail, 'other-registrant@example.com'] } })
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await mongoose.disconnect()
  })

  it('rejects registration with a weak password', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Weak Pw', email: 'weak-pw@example.com', password: 'short', timezone: 'America/New_York' }),
    })
    assert.equal(response.status, 400)
  })

  it('registers a new candidate account and sets a user_session cookie distinct from admin_session', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Candidate', email: testEmail, password: testPassword, timezone: 'America/New_York' }),
    })
    assert.equal(response.status, 201)
    const cookie = extractCookie(response)
    assert.match(cookie, /^user_session=/)

    const body = (await response.json()) as { user: { email: string; name: string } }
    assert.equal(body.user.email, testEmail)
    assert.equal(body.user.name, 'Test Candidate')
  })

  it('rejects a duplicate registration for the same email', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dup', email: testEmail, password: testPassword, timezone: 'America/New_York' }),
    })
    assert.equal(response.status, 409)
  })

  it('rejects a protected route with no session cookie at all', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/auth/me`)
    assert.equal(response.status, 401)
  })

  it('rejects a protected route when only an admin_session cookie is present (no cross-auth)', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: { Cookie: 'admin_session=not-a-real-jwt' },
    })
    assert.equal(response.status, 401)
  })

  it('rejects login with the wrong password', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'wrong-password' }),
    })
    assert.equal(response.status, 401)
  })

  it('logs in and accesses a protected route with the session cookie', async () => {
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    })
    assert.equal(loginResponse.status, 200)
    const cookie = extractCookie(loginResponse)

    const meResponse = await fetch(`${BASE_URL}/api/v1/auth/me`, { headers: { Cookie: cookie } })
    assert.equal(meResponse.status, 200)
    const body = (await meResponse.json()) as { user: { email: string } }
    assert.equal(body.user.email, testEmail)
  })

  it('logout clears the user_session cookie', async () => {
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    })
    const cookie = extractCookie(loginResponse)

    const logoutResponse = await fetch(`${BASE_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    assert.equal(logoutResponse.status, 200)
    const clearedCookie = logoutResponse.headers.get('set-cookie')
    assert.ok(clearedCookie, 'expected logout to send a Set-Cookie header clearing the session')
    assert.match(clearedCookie!, /user_session=;/)
  })

  it('updates profile fields via PATCH /auth/me while authenticated', async () => {
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    })
    const cookie = extractCookie(loginResponse)

    const patchResponse = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Updated Name', timezone: 'Europe/London' }),
    })
    assert.equal(patchResponse.status, 200)
    const body = (await patchResponse.json()) as { user: { name: string; timezone: string } }
    assert.equal(body.user.name, 'Updated Name')
    assert.equal(body.user.timezone, 'Europe/London')
  })

  it('rejects a password change with an incorrect current password', async () => {
    const loginResponse = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    })
    const cookie = extractCookie(loginResponse)

    const response = await fetch(`${BASE_URL}/api/v1/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'a-new-reasonable-password1' }),
    })
    assert.equal(response.status, 401)
  })
})
