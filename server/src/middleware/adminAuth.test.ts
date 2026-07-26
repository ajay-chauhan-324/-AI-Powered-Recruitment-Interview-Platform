import http from 'node:http'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { createApp } from '../app.js'
import { AdminUserModel } from '../models/AdminUser.model.js'

/**
 * A real HTTP-level test — unlike appointment.service.test.ts (which calls the service
 * layer directly), authorization is fundamentally an HTTP/middleware concern (CLAUDE.md
 * §12's Phase 12 checklist explicitly names "Authorization" as its own test dimension), so
 * it needs to actually exercise requireAdminAuth wired into real Express routes, not just
 * the JWT-verification logic in isolation.
 */
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/booking_system_test?replicaSet=rs0'
const TEST_PORT = 4098
const BASE_URL = `http://localhost:${TEST_PORT}`

let server: http.Server
let adminEmail: string
let adminPassword: string

function extractCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  assert.ok(setCookie, 'expected a Set-Cookie header')
  return setCookie.split(';')[0] ?? ''
}

describe('admin authorization', () => {
  before(async () => {
    await mongoose.connect(TEST_MONGODB_URI)

    adminEmail = 'auth-test-admin@example.com'
    adminPassword = 'a-reasonably-long-test-password'
    await AdminUserModel.deleteOne({ email: adminEmail })
    await AdminUserModel.create({ email: adminEmail, passwordHash: await bcrypt.hash(adminPassword, 4) })

    const app = createApp()
    server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve))
  })

  after(async () => {
    await AdminUserModel.deleteOne({ email: adminEmail })
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await mongoose.disconnect()
  })

  it('rejects an admin route with no session cookie at all', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/admin/appointments?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z`)
    assert.equal(response.status, 401)
    const body = (await response.json()) as { error: { code: string } }
    assert.equal(body.error.code, 'UNAUTHORIZED')
  })

  it('rejects an admin route with a garbage/invalid session cookie', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/admin/appointments?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z`, {
      headers: { Cookie: 'admin_session=not-a-real-jwt' },
    })
    assert.equal(response.status, 401)
  })

  it('rejects login with the wrong password', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: 'wrong-password' }),
    })
    assert.equal(response.status, 401)
  })

  it('accepts an admin route once logged in', async () => {
    const loginResponse = await fetch(`${BASE_URL}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    })
    assert.equal(loginResponse.status, 200)
    const cookie = extractCookie(loginResponse)

    const meResponse = await fetch(`${BASE_URL}/api/v1/admin/auth/me`, { headers: { Cookie: cookie } })
    assert.equal(meResponse.status, 200)

    const appointmentsResponse = await fetch(
      `${BASE_URL}/api/v1/admin/appointments?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z`,
      { headers: { Cookie: cookie } },
    )
    assert.equal(appointmentsResponse.status, 200)
  })

  it('logout tells the browser to clear the cookie (Set-Cookie with Max-Age=0)', async () => {
    // Sessions are stateless JWTs with no server-side revocation list — logout clears the
    // browser's cookie via Set-Cookie, it does not invalidate the token itself. A copy of
    // the raw token captured before logout remains technically valid until its 12h expiry,
    // the same well-known tradeoff most stateless-JWT auth makes (see README "Known notes").
    // This test asserts what logout actually does — clear the cookie — not a false
    // "token revoked" claim.
    const loginResponse = await fetch(`${BASE_URL}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    })
    const cookie = extractCookie(loginResponse)

    const logoutResponse = await fetch(`${BASE_URL}/api/v1/admin/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    assert.equal(logoutResponse.status, 200)
    const clearedCookie = logoutResponse.headers.get('set-cookie')
    assert.ok(clearedCookie, 'expected logout to send a Set-Cookie header clearing the session')
    assert.match(clearedCookie!, /admin_session=;/, 'expected the cookie value to be cleared')
  })

  it('never requires authentication for the public calendar route', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/calendar?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z`)
    assert.equal(response.status, 200)
  })
})
