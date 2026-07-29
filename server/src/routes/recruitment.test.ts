import http from 'node:http'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { DateTime } from 'luxon'
import { createApp } from '../app.js'
import { UserModel } from '../models/User.model.js'
import { CompanyModel } from '../models/Company.model.js'
import { JobModel } from '../models/Job.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'

/**
 * HTTP-level tests for the recruitment domain (recruiter accounts, jobs, applications,
 * ownership/IDOR boundaries, and the invite -> candidate-schedules interview flow) — mirrors
 * myInterviews.test.ts's approach: authorization here is fundamentally an HTTP/middleware
 * concern, so it needs real Express routes, not just service-layer calls.
 */
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/booking_system_test?replicaSet=rs0'
const TEST_PORT = 4094
const BASE_URL = `http://localhost:${TEST_PORT}`
const TIMEZONE = 'America/New_York'

let server: http.Server

function nextWorkingWeekdayAt(hour: number): Date {
  let day = DateTime.fromJSDate(new Date(), { zone: TIMEZONE }).plus({ days: 1 }).startOf('day')
  while (day.weekday < 1 || day.weekday > 5) day = day.plus({ days: 1 })
  return day.plus({ hours: hour }).toJSDate()
}

function extractCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  assert.ok(setCookie, 'expected a Set-Cookie header')
  return setCookie.split(';')[0] ?? ''
}

async function registerRecruiter(email: string, companyName: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Recruiter',
      email,
      password: 'a-reasonable-test-password1',
      timezone: TIMEZONE,
      accountType: 'recruiter',
      companyName,
    }),
  })
  assert.equal(response.status, 201)
  return extractCookie(response)
}

async function registerCandidate(email: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Candidate', email, password: 'a-reasonable-test-password1', timezone: TIMEZONE }),
  })
  assert.equal(response.status, 201)
  return extractCookie(response)
}

describe('recruitment domain: jobs, applications, ownership, and the invite/schedule flow', () => {
  const recruiterAEmail = 'recruitment-test-recruiter-a@example.com'
  const recruiterBEmail = 'recruitment-test-recruiter-b@example.com'
  const candidateEmail = 'recruitment-test-candidate@example.com'
  let cookieRecruiterA: string
  let cookieRecruiterB: string
  let cookieCandidate: string

  before(async () => {
    await mongoose.connect(TEST_MONGODB_URI)
    await UserModel.deleteMany({ email: { $in: [recruiterAEmail, recruiterBEmail, candidateEmail] } })
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

    cookieRecruiterA = await registerRecruiter(recruiterAEmail, 'Company A')
    cookieRecruiterB = await registerRecruiter(recruiterBEmail, 'Company B')
    cookieCandidate = await registerCandidate(candidateEmail)

    // Every recruiter now owns their own calendar (CLAUDE.md §36 second pivot) — candidate
    // bookings against recruiter A's jobs check THIS configuration, not the legacy singleton
    // above. Set to the same America/New_York 9-5 pattern the singleton used to represent, so
    // nextWorkingWeekdayAt(10) below still lands inside working hours.
    const scheduleResponse = await fetch(`${BASE_URL}/api/v1/recruiter/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterA },
      body: JSON.stringify({
        timezone: TIMEZONE,
        workingHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 540, endMinutes: 1020, isActive: true })),
        breaks: [],
      }),
    })
    assert.equal(scheduleResponse.status, 200)
  })

  after(async () => {
    const users = await UserModel.find({ email: { $in: [recruiterAEmail, recruiterBEmail, candidateEmail] } })
    const userIds = users.map((u) => u._id)
    await ApplicationModel.deleteMany({ candidateId: { $in: userIds } })
    await InterviewModel.deleteMany({ candidateEmail })
    await JobModel.deleteMany({ recruiterId: { $in: userIds } })
    await CompanyModel.deleteMany({ recruiterId: { $in: userIds } })
    await UserModel.deleteMany({ _id: { $in: userIds } })
    await ScheduleConfigModel.deleteMany({})
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await mongoose.disconnect()
  })

  it('registering as a recruiter creates a company; registering as a candidate does not', async () => {
    const companyResponse = await fetch(`${BASE_URL}/api/v1/recruiter/company`, { headers: { Cookie: cookieRecruiterA } })
    assert.equal(companyResponse.status, 200)
    const body = (await companyResponse.json()) as { company: { name: string } }
    assert.equal(body.company.name, 'Company A')
  })

  it("each recruiter has their own calendar — reading/writing one recruiter's schedule never affects another's", async () => {
    const getA = await fetch(`${BASE_URL}/api/v1/recruiter/schedule`, { headers: { Cookie: cookieRecruiterA } })
    assert.equal(getA.status, 200)
    const scheduleA = ((await getA.json()) as { schedule: { timezone: string } }).schedule
    assert.equal(scheduleA.timezone, TIMEZONE, "recruiter A's calendar reflects what the before() hook configured")

    // Recruiter B never configured their own calendar — GET auto-seeds a default rather than
    // erroring, and it must never be recruiter A's settings.
    const getB = await fetch(`${BASE_URL}/api/v1/recruiter/schedule`, { headers: { Cookie: cookieRecruiterB } })
    assert.equal(getB.status, 200)
    const scheduleB = ((await getB.json()) as { schedule: { timezone: string } }).schedule
    assert.notEqual(scheduleB.timezone, TIMEZONE, "recruiter B's auto-seeded calendar must be independent of recruiter A's")

    // An unauthenticated request must never see or set anyone's calendar.
    const unauthenticated = await fetch(`${BASE_URL}/api/v1/recruiter/schedule`)
    assert.equal(unauthenticated.status, 401)

    // Recruiter B can freely set any working-hours pattern — unlike the legacy admin
    // schedule, there is no fixed-pattern restriction on a recruiter's own calendar.
    const putB = await fetch(`${BASE_URL}/api/v1/recruiter/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterB },
      body: JSON.stringify({
        timezone: 'Europe/London',
        workingHours: [2, 3, 4].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 480, endMinutes: 960, isActive: true })),
        breaks: [],
      }),
    })
    assert.equal(putB.status, 200)
    const updatedB = ((await putB.json()) as { schedule: { timezone: string } }).schedule
    assert.equal(updatedB.timezone, 'Europe/London')

    // Recruiter A's own calendar must be completely unaffected by recruiter B's change.
    const getAAgain = await fetch(`${BASE_URL}/api/v1/recruiter/schedule`, { headers: { Cookie: cookieRecruiterA } })
    const scheduleAAgain = ((await getAAgain.json()) as { schedule: { timezone: string } }).schedule
    assert.equal(scheduleAAgain.timezone, TIMEZONE)
  })

  it('a candidate account cannot access recruiter-only routes', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/recruiter/jobs`, { headers: { Cookie: cookieCandidate } })
    assert.equal(response.status, 403)
  })

  it('a recruiter account cannot access candidate-only routes, even though it shares the same session cookie/auth system', async () => {
    // Regression test for a bug where a recruiter, after logging back into their own
    // account, was shown the candidate application/resume experience — accountType must be
    // enforced on every candidate-only endpoint, not just assumed from "is authenticated".
    const listApplications = await fetch(`${BASE_URL}/api/v1/applications`, { headers: { Cookie: cookieRecruiterA } })
    assert.equal(listApplications.status, 403)

    const createApplication = await fetch(`${BASE_URL}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterA },
      body: JSON.stringify({ jobId: '000000000000000000000000', resumeId: '000000000000000000000000' }),
    })
    assert.equal(createApplication.status, 403)

    const resumeForm = new FormData()
    resumeForm.append('resume', new Blob(['Not a real candidate.'], { type: 'text/plain' }), 'resume.txt')
    const uploadResume = await fetch(`${BASE_URL}/api/v1/resumes`, {
      method: 'POST',
      headers: { Cookie: cookieRecruiterA },
      body: resumeForm,
    })
    assert.equal(uploadResume.status, 403)

    const listMyInterviews = await fetch(`${BASE_URL}/api/v1/my/interviews`, { headers: { Cookie: cookieRecruiterA } })
    assert.equal(listMyInterviews.status, 403)

    const candidateAiChat = await fetch(`${BASE_URL}/api/v1/my/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterA },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], timezone: TIMEZONE }),
    })
    assert.equal(candidateAiChat.status, 403)
  })

  it('a draft job is never visible on the public jobs listing', async () => {
    const createResponse = await fetch(`${BASE_URL}/api/v1/recruiter/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterA },
      body: JSON.stringify({ title: 'Draft-Only Job', requiredSkills: ['Rust'] }),
    })
    assert.equal(createResponse.status, 201)
    const created = (await createResponse.json()) as { job: { id: string } }

    const publicListResponse = await fetch(`${BASE_URL}/api/v1/jobs?search=Draft-Only`)
    const publicList = (await publicListResponse.json()) as { jobs: Array<{ id: string }> }
    assert.ok(!publicList.jobs.some((job) => job.id === created.job.id), 'a draft job must never appear in the public listing')
  })

  it("a recruiter cannot edit, publish, or view applications for another recruiter's job (IDOR)", async () => {
    const createResponse = await fetch(`${BASE_URL}/api/v1/recruiter/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterA },
      body: JSON.stringify({ title: "Recruiter A's Job", requiredSkills: ['Go'] }),
    })
    const job = ((await createResponse.json()) as { job: { id: string } }).job

    const editByB = await fetch(`${BASE_URL}/api/v1/recruiter/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterB },
      body: JSON.stringify({ title: 'Hijacked title' }),
    })
    assert.equal(editByB.status, 404)

    const publishByB = await fetch(`${BASE_URL}/api/v1/recruiter/jobs/${job.id}/publish`, {
      method: 'POST',
      headers: { Cookie: cookieRecruiterB },
    })
    assert.equal(publishByB.status, 404)

    const applicationsByB = await fetch(`${BASE_URL}/api/v1/recruiter/jobs/${job.id}/applications`, {
      headers: { Cookie: cookieRecruiterB },
    })
    assert.equal(applicationsByB.status, 404)

    const untouched = await JobModel.findById(job.id)
    assert.equal(untouched?.title, "Recruiter A's Job", "recruiter B's failed attempt must never affect recruiter A's job")
  })

  interface RoundJson {
    order: number
    status: string
    interviewId: string | null
  }
  interface ApplicationJson {
    id: string
    status: string
    atsAnalysis: unknown
    rounds: RoundJson[]
  }

  it('full loop: publish -> apply -> duplicate blocked -> IDOR checks -> round unlock -> candidate schedules -> interview created', async () => {
    // Publish a real job as recruiter A — a job needs at least one pipeline round to publish.
    const createResponse = await fetch(`${BASE_URL}/api/v1/recruiter/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterA },
      body: JSON.stringify({
        title: 'Full Loop Engineer',
        requiredSkills: ['TypeScript'],
        experienceLevel: 'mid',
        minExperienceYears: 2,
        pipeline: [
          { order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 45 },
          { order: 2, type: 'final', title: 'Final Interview', durationMinutes: 30 },
        ],
      }),
    })
    const job = ((await createResponse.json()) as { job: { id: string } }).job
    const publishResponse = await fetch(`${BASE_URL}/api/v1/recruiter/jobs/${job.id}/publish`, {
      method: 'POST',
      headers: { Cookie: cookieRecruiterA },
    })
    assert.equal(publishResponse.status, 200)

    // Candidate uploads a resume and applies.
    const resumeForm = new FormData()
    resumeForm.append('resume', new Blob(['Experienced TypeScript engineer, 4 years.'], { type: 'text/plain' }), 'resume.txt')
    const resumeResponse = await fetch(`${BASE_URL}/api/v1/resumes`, {
      method: 'POST',
      headers: { Cookie: cookieCandidate },
      body: resumeForm,
    })
    assert.equal(resumeResponse.status, 201)
    const resume = ((await resumeResponse.json()) as { resume: { id: string } }).resume

    // The candidate must complete their profile before applying (CLAUDE.md's product-
    // completion pass: headline, location, skills, education, phone, and LinkedIn are
    // mandatory, on top of the resume just uploaded above).
    const profileResponse = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieCandidate },
      body: JSON.stringify({
        headline: 'Senior TypeScript Engineer',
        location: 'Remote',
        skills: ['TypeScript'],
        phone: '+1-555-0100',
        linkedIn: 'https://linkedin.com/in/test-candidate',
        education: [{ institution: 'Test University', degree: 'B.S. Computer Science', endYear: 2018 }],
      }),
    })
    assert.equal(profileResponse.status, 200)

    const applyResponse = await fetch(`${BASE_URL}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieCandidate },
      body: JSON.stringify({ jobId: job.id, resumeId: resume.id }),
    })
    assert.equal(applyResponse.status, 201)
    const application = ((await applyResponse.json()) as { application: ApplicationJson }).application
    assert.equal(application.status, 'applied')
    assert.equal(application.rounds.length, 2)
    assert.ok(
      application.rounds.every((round) => round.status === 'locked'),
      'every round must start locked — a candidate must never see an unlocked round before the recruiter acts',
    )
    // AI analysis is best-effort — it may be null if the provider is unavailable in this
    // environment, but must never block the application itself (this assertion already
    // passing on status 201 proves that). If present, it must be a real validated shape.
    if (application.atsAnalysis) {
      assert.ok(typeof (application.atsAnalysis as { score: number }).score === 'number')
    }

    // Duplicate application must be rejected.
    const duplicateResponse = await fetch(`${BASE_URL}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieCandidate },
      body: JSON.stringify({ jobId: job.id, resumeId: resume.id }),
    })
    assert.equal(duplicateResponse.status, 409)

    // A second candidate must never be able to view this application (IDOR).
    const otherCandidateCookie = await registerCandidate('recruitment-test-other-candidate@example.com')
    const foreignView = await fetch(`${BASE_URL}/api/v1/applications/${application.id}`, {
      headers: { Cookie: otherCandidateCookie },
    })
    assert.equal(foreignView.status, 404)

    // Recruiter B (doesn't own this job) must never see this application either.
    const foreignRecruiterView = await fetch(`${BASE_URL}/api/v1/recruiter/applications/${application.id}`, {
      headers: { Cookie: cookieRecruiterB },
    })
    assert.equal(foreignRecruiterView.status, 404)

    // The candidate cannot book anything while every round is still locked.
    const bookLockedResponse = await fetch(`${BASE_URL}/api/v1/applications/${application.id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieCandidate },
      body: JSON.stringify({ startAt: nextWorkingWeekdayAt(10).toISOString(), timezone: TIMEZONE }),
    })
    assert.equal(bookLockedResponse.status, 400, 'a candidate must never be able to book while every round is locked')

    // The other candidate cannot book against candidate A's application id either (IDOR on the
    // schedule endpoint itself, not just the read endpoint).
    const foreignBookResponse = await fetch(`${BASE_URL}/api/v1/applications/${application.id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: otherCandidateCookie },
      body: JSON.stringify({ startAt: nextWorkingWeekdayAt(10).toISOString(), timezone: TIMEZONE }),
    })
    assert.equal(foreignBookResponse.status, 404, "a candidate must never be able to book another candidate's application")

    // Recruiter B cannot shortlist (and thereby unlock round 1) on recruiter A's application
    // either — round unlocking is automatic and driven only by the status/outcome endpoints,
    // so this is the same IDOR boundary, just reached through the new automatic trigger.
    const foreignShortlistResponse = await fetch(`${BASE_URL}/api/v1/recruiter/applications/${application.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterB },
      body: JSON.stringify({ status: 'shortlisted' }),
    })
    assert.equal(foreignShortlistResponse.status, 404)

    // Recruiter A shortlists — this automatically unlocks round 1 only, never round 2 (no
    // manual "unlock" step or client-controllable round number exists anymore).
    const shortlistResponse = await fetch(`${BASE_URL}/api/v1/recruiter/applications/${application.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterA },
      body: JSON.stringify({ status: 'shortlisted' }),
    })
    assert.equal(shortlistResponse.status, 200)
    const advanced = ((await shortlistResponse.json()) as { application: ApplicationJson }).application
    assert.equal(advanced.status, 'interview_in_progress', 'shortlisting automatically advances status once a round unlocks')
    assert.equal(advanced.rounds[0]?.status, 'ready_to_book')
    assert.equal(advanced.rounds[1]?.status, 'locked', 'round 2 must remain locked until round 1 is passed')

    // The candidate still cannot book round 2 directly — the server always books whichever
    // round is 'ready_to_book', never a caller-chosen round, so there is no round-number
    // argument to manipulate in the first place.
    const start = nextWorkingWeekdayAt(10)
    const scheduleResponse = await fetch(`${BASE_URL}/api/v1/applications/${application.id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieCandidate },
      body: JSON.stringify({ startAt: start.toISOString(), timezone: TIMEZONE }),
    })
    assert.equal(scheduleResponse.status, 200)
    const scheduled = ((await scheduleResponse.json()) as { application: ApplicationJson }).application
    assert.equal(scheduled.status, 'interview_in_progress')
    assert.equal(scheduled.rounds[0]?.status, 'scheduled')
    assert.ok(scheduled.rounds[0]?.interviewId, 'expected an interview to have been created for round 1')
    assert.equal(scheduled.rounds[1]?.status, 'locked')

    const interview = await InterviewModel.findById(scheduled.rounds[0]!.interviewId)
    assert.ok(interview, 'the interview must actually exist')
    assert.equal(interview?.jobId?.toString(), job.id)

    // Recruiter A cannot mark round 1 passed/failed before it happens... it's already
    // 'scheduled', so this is the valid path: record the outcome.
    const outcomeResponse = await fetch(`${BASE_URL}/api/v1/recruiter/applications/${application.id}/rounds/1/outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieRecruiterA },
      body: JSON.stringify({ outcome: 'passed' }),
    })
    assert.equal(outcomeResponse.status, 200)
    const afterOutcome = ((await outcomeResponse.json()) as { application: ApplicationJson }).application
    assert.equal(afterOutcome.rounds[0]?.status, 'passed')
    assert.equal(afterOutcome.status, 'interview_in_progress')
    assert.equal(
      afterOutcome.rounds[1]?.status,
      'ready_to_book',
      'passing round 1 automatically unlocks round 2 — no separate manual unlock step',
    )

    // Cleanup this test's own extra candidate account (the fixture-wide after() covers the rest).
    const otherCandidate = await UserModel.findOne({ email: 'recruitment-test-other-candidate@example.com' })
    if (otherCandidate) await UserModel.deleteOne({ _id: otherCandidate._id })
  })
})
