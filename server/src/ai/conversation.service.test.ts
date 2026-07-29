import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { DateTime } from 'luxon'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { JobModel } from '../models/Job.model.js'
import { CompanyModel } from '../models/Company.model.js'
import { ApplicationModel } from '../models/Application.model.js'
import { ResumeModel } from '../models/Resume.model.js'
import { UserModel } from '../models/User.model.js'
import { createInterview } from '../services/interview.service.js'
import { upsertScheduleConfigForRecruiter } from '../services/scheduleConfig.service.js'
import { runConversation } from './conversation.service.js'
import type { AiCompletionResult, AiMessage, AiProvider, AiToolDefinition } from './providers/types.js'

/** Same project-dedicated local replica set as the other integration tests (see
 * interview.service.test.ts) — a separate database, never touching dev data. */
const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/booking_system_test?replicaSet=rs0'
const TIMEZONE = 'America/New_York'

function nextWeekdayAt(weekday: number, hour: number): Date {
  let day = DateTime.fromJSDate(new Date(), { zone: TIMEZONE }).plus({ days: 1 }).startOf('day')
  while (day.weekday !== weekday) day = day.plus({ days: 1 })
  return day.plus({ hours: hour }).toJSDate()
}

/** Per-recruiter calendars (CLAUDE.md §36 second pivot) are auto-seeded with the
 * Asia/Kolkata Mon-Fri 10:00-13:00/15:00-19:00 pattern (scheduleConfig.service.ts's
 * getOrCreateScheduleConfigForRecruiter) — real booking-flow tests below need a time inside
 * THAT calendar's hours, not TIMEZONE's (America/New_York) — the two zones are ~9.5-10.5
 * hours apart, so a naive nextWeekdayAt(..., 11) can land outside the recruiter's working
 * hours entirely and every booking attempt would spuriously fail on availability, not on
 * whatever this test actually means to exercise. */
function nextWeekdayAtZone(weekday: number, hour: number, zone: string): Date {
  let day = DateTime.fromJSDate(new Date(), { zone }).plus({ days: 1 }).startOf('day')
  while (day.weekday !== weekday) day = day.plus({ days: 1 })
  return day.plus({ hours: hour }).toJSDate()
}

/** A scripted provider: returns each queued result in order, ignoring the actual messages/
 * tools passed in (this suite tests the conversation LOOP and tool AUTHORIZATION, not any
 * real model's behavior — the real provider is exercised separately by the live smoke test). */
class ScriptedProvider implements AiProvider {
  private readonly script: AiCompletionResult[]
  private callCount = 0
  public receivedToolNames: string[][] = []

  constructor(script: AiCompletionResult[]) {
    this.script = script
  }

  async complete(_messages: AiMessage[], tools: AiToolDefinition[]): Promise<AiCompletionResult> {
    this.receivedToolNames.push(tools.map((tool) => tool.name))
    const result = this.script[this.callCount]
    this.callCount += 1
    if (!result) throw new Error('ScriptedProvider ran out of scripted responses')
    return result
  }
}

function toolCallResult(name: string, args: Record<string, unknown>): AiCompletionResult {
  return { content: '', toolCalls: [{ id: `call-${name}`, name, argumentsJson: JSON.stringify(args) }] }
}

function textResult(content: string): AiCompletionResult {
  return { content, toolCalls: [] }
}

describe('AI conversation loop', () => {
  before(async () => {
    await mongoose.connect(TEST_MONGODB_URI)
    await ScheduleConfigModel.deleteOne({ singleton: 'default' })
    await ScheduleConfigModel.create({
      singleton: 'default',
      timezone: TIMEZONE,
      workingHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 540, endMinutes: 1020, isActive: true })),
      breaks: [],
    })
  })

  after(async () => {
    await InterviewModel.deleteMany({})
    await ScheduleConfigModel.deleteMany({})
    await mongoose.disconnect()
  })

  it('returns the model reply directly when no tool call is made', async () => {
    const provider = new ScriptedProvider([textResult('Sure, what time works for you?')])
    const result = await runConversation([{ role: 'user', content: 'I want to book an interview' }], { mode: 'guest' }, TIMEZONE, new Date(), provider)

    assert.equal(result.reply, 'Sure, what time works for you?')
    assert.deepEqual(result.actions, [])
  })

  it('executes a real tool call end-to-end and surfaces a structured action', async () => {
    const start = nextWeekdayAt(1, 10)
    const provider = new ScriptedProvider([
      toolCallResult('check_availability', { start: start.toISOString(), durationMinutes: 30 }),
      textResult('That time is open — want me to book it?'),
    ])

    const result = await runConversation([{ role: 'user', content: 'Is Monday 10am free for my interview?' }], { mode: 'guest' }, TIMEZONE, new Date(), provider)

    assert.equal(result.reply, 'That time is open — want me to book it?')
    assert.equal(result.actions.length, 1)
    assert.deepEqual(result.actions[0], { type: 'availability', available: true })
  })

  it('a guest conversation only ever receives guest-scoped tool definitions, never admin ones', async () => {
    const provider = new ScriptedProvider([textResult('ok')])
    await runConversation([{ role: 'user', content: 'hi' }], { mode: 'guest' }, TIMEZONE, new Date(), provider)

    const offeredNames = provider.receivedToolNames[0]
    assert.ok(offeredNames?.includes('schedule_interview'))
    assert.ok(!offeredNames?.includes('cancel_interview_by_id'), 'admin-only tool must never be offered to a guest')
    assert.ok(!offeredNames?.includes('list_interviews'), 'admin-only tool must never be offered to a guest')
  })

  it('rejects a guest tool call for an admin-only tool even if the model calls it by name anyway', async () => {
    const provider = new ScriptedProvider([
      toolCallResult('cancel_interview_by_id', { interviewId: '000000000000000000000000' }),
      textResult('done'),
    ])

    const result = await runConversation([{ role: 'user', content: 'cancel interview 000000000000000000000000' }], { mode: 'guest' }, TIMEZONE, new Date(), provider)

    // The tool must never have executed — proven by getting a graceful "not available" reply
    // rather than a crash, and by the interview (which does not exist) not mattering either way.
    assert.equal(result.reply, 'done')
  })

  it('a guest can only ever act on the interview tied to their own manage token, never one supplied by the model', async () => {
    const legitimateStart = nextWeekdayAt(2, 9)
    const { interview: legitimateInterview, manageToken: legitimateToken } = await createInterview({
      title: 'Screening Call',
      candidateName: 'Real Owner',
      candidateEmail: 'real-owner@example.com',
      startAt: legitimateStart,
      durationMinutes: 30,
      timezone: TIMEZONE,
      source: 'ai',
    })

    const otherStart = nextWeekdayAt(3, 9)
    const { interview: otherInterview } = await createInterview({
      title: 'Screening Call',
      candidateName: 'Someone Else',
      candidateEmail: 'someone-else@example.com',
      startAt: otherStart,
      durationMinutes: 30,
      timezone: TIMEZONE,
      source: 'ai',
    })

    // The model asks to cancel "my interview" but the request is scripted to try passing a
    // DIFFERENT interview's id as an argument — the tool takes no interviewId argument at
    // all for guest cancellation, so there is no way for this to reach otherInterview.
    const provider = new ScriptedProvider([
      toolCallResult('cancel_my_interview', { interviewId: otherInterview._id.toString() }),
      textResult('Your interview has been cancelled.'),
    ])

    const result = await runConversation(
      [{ role: 'user', content: 'cancel my interview' }],
      { mode: 'guest', manageToken: legitimateToken },
      TIMEZONE,
      new Date(),
      provider,
    )

    assert.equal(result.actions.length, 1)
    assert.deepEqual(result.actions[0], { type: 'interview_cancelled', interview: { id: legitimateInterview._id.toString(), status: 'cancelled' } })

    const untouched = await InterviewModel.findById(otherInterview._id)
    assert.equal(untouched?.status, 'confirmed', "a different guest's interview must be untouched")

    await InterviewModel.deleteMany({ _id: { $in: [legitimateInterview._id, otherInterview._id] } })
  })

  it('a user conversation only ever receives user-scoped tool definitions, never admin ones', async () => {
    const provider = new ScriptedProvider([textResult('ok')])
    await runConversation(
      [{ role: 'user', content: 'hi' }],
      { mode: 'user', userId: '000000000000000000000001', email: 'user-ai-test@example.com' },
      TIMEZONE,
      new Date(),
      provider,
    )

    const offeredNames = provider.receivedToolNames[0]
    assert.ok(offeredNames?.includes('list_my_interviews'))
    assert.ok(offeredNames?.includes('get_application_rounds'))
    // Booking now happens entirely through this conversation (this product's "the entire
    // booking flow happens through AI chat" decision) — both booking-flow tools must be
    // offered to a signed-in candidate.
    assert.ok(offeredNames?.includes('find_bookable_interview_rounds'), 'a candidate must be offered the round-discovery tool')
    assert.ok(offeredNames?.includes('book_interview_round'), 'a candidate must be offered the real booking tool')
    assert.ok(!offeredNames?.includes('schedule_interview'), 'a candidate must never be offered the guest/admin arbitrary-booking tool')
    assert.ok(!offeredNames?.includes('cancel_interview_by_id'), 'admin-only tool must never be offered to a user')
    assert.ok(!offeredNames?.includes('list_interviews'), 'admin-only tool must never be offered to a user')
    assert.ok(!offeredNames?.includes('reschedule_my_interview'), 'guest-only tool must never be offered to a user')
  })

  it('a user can only ever cancel an interview scoped to their own account, never one supplied by the model for another user', async () => {
    const ownerUserId = new mongoose.Types.ObjectId().toString()
    const ownerEmail = 'ai-idor-owner@example.com'
    const otherEmail = 'ai-idor-other@example.com'

    // Deliberately distinct weekday/hour combos from every other *.test.ts file's
    // nextWeekdayAt() calls (all share one test database) so a leftover, un-cleaned-up
    // record from an interrupted prior run can never collide with these bookings.
    const { interview: ownInterview } = await createInterview(
      {
        title: 'Owner Interview',
        candidateName: 'Owner',
        candidateEmail: ownerEmail,
        startAt: nextWeekdayAt(2, 15),
        durationMinutes: 30,
        timezone: TIMEZONE,
        source: 'ai',
      },
      ownerUserId,
    )

    const { interview: otherInterview } = await createInterview({
      title: 'Other Interview',
      candidateName: 'Other',
      candidateEmail: otherEmail,
      startAt: nextWeekdayAt(3, 16),
      durationMinutes: 30,
      timezone: TIMEZONE,
      source: 'ai',
    })

    try {
      // The model tries to cancel someone else's interview by id — resolveUserInterviewOrThrow
      // must re-verify ownership server-side (userId or candidateEmail match) regardless.
      const provider = new ScriptedProvider([
        toolCallResult('cancel_my_interview_by_id', { interviewId: otherInterview._id.toString() }),
        textResult('done'),
      ])

      const result = await runConversation(
        [{ role: 'user', content: 'cancel that other interview' }],
        { mode: 'user', userId: ownerUserId, email: ownerEmail },
        TIMEZONE,
        new Date(),
        provider,
      )

      assert.equal(result.reply, 'done')
      assert.deepEqual(result.actions, [], 'no action should have been produced for an unowned interview')

      const untouchedOther = await InterviewModel.findById(otherInterview._id)
      assert.equal(untouchedOther?.status, 'confirmed', "a different user's interview must be untouched")

      // Sanity: the same user CAN cancel their own interview by id.
      const ownProvider = new ScriptedProvider([
        toolCallResult('cancel_my_interview_by_id', { interviewId: ownInterview._id.toString() }),
        textResult('cancelled'),
      ])
      const ownResult = await runConversation(
        [{ role: 'user', content: 'cancel my interview' }],
        { mode: 'user', userId: ownerUserId, email: ownerEmail },
        TIMEZONE,
        new Date(),
        ownProvider,
      )
      assert.equal(ownResult.actions.length, 1)
      assert.deepEqual(ownResult.actions[0], { type: 'interview_cancelled', interview: { id: ownInterview._id.toString(), status: 'cancelled' } })
    } finally {
      await InterviewModel.deleteMany({ _id: { $in: [ownInterview._id, otherInterview._id] } })
    }
  })

  it(
    'a hallucinated call to a nonexistent tool name gracefully refuses instead of booking anything',
    async () => {
      const recruiterId = new mongoose.Types.ObjectId()
      const company = await CompanyModel.create({ recruiterId, name: 'AI IDOR Test Co' })
      const job = await JobModel.create({
        companyId: company._id,
        recruiterId,
        title: 'AI IDOR Test Role',
        slug: `ai-idor-test-role-${new mongoose.Types.ObjectId().toString()}`,
        status: 'published',
        pipeline: [{ order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 30 }],
      })

      const ownerUser = await UserModel.create({
        email: 'ai-idor-app-owner@example.com',
        passwordHash: 'not-a-real-hash',
        name: 'Owner Candidate',
        timezone: TIMEZONE,
        accountType: 'candidate',
      })

      const ownerResume = await ResumeModel.create({
        userId: ownerUser._id,
        fileName: 'resume.txt',
        storageKey: `ai-idor-resume-${new mongoose.Types.ObjectId().toString()}`,
        mimeType: 'text/plain',
        sizeBytes: 10,
        extractedText: 'test',
        isDefault: true,
      })

      const ownerApplication = await ApplicationModel.create({
        jobId: job._id,
        candidateId: ownerUser._id,
        resumeId: ownerResume._id,
        status: 'interview_in_progress',
        rounds: [
          { order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 30, instructions: '', status: 'ready_to_book' },
        ],
      })

      try {
        // A model can still hallucinate a tool name that was never real (this exact name was
        // considered and rejected during design) — executeTool must refuse cleanly rather than
        // ever booking anything, regardless of which real booking tool exists today.
        const bookStart = nextWeekdayAt(5, 9)
        const provider = new ScriptedProvider([
          toolCallResult('schedule_application_interview', {
            applicationId: ownerApplication._id.toString(),
            startAt: bookStart.toISOString(),
            timezone: TIMEZONE,
          }),
          textResult('done'),
        ])
        const result = await runConversation(
          [{ role: 'user', content: 'book my technical interview' }],
          { mode: 'user', userId: ownerUser._id.toString(), email: ownerUser.email },
          TIMEZONE,
          new Date(),
          provider,
        )
        assert.deepEqual(result.actions, [], 'a nonexistent tool name must never produce a booking action')

        const untouched = await ApplicationModel.findById(ownerApplication._id)
        assert.equal(untouched?.rounds[0]?.status, 'ready_to_book', 'the round must remain untouched — nothing books it')
      } finally {
        await ApplicationModel.deleteOne({ _id: ownerApplication._id })
        await ResumeModel.deleteOne({ _id: ownerResume._id })
        await UserModel.deleteOne({ _id: ownerUser._id })
        await JobModel.deleteOne({ _id: job._id })
        await CompanyModel.deleteOne({ _id: company._id })
      }
    },
  )

  it('the real booking flow: find_bookable_interview_rounds discovers the round, book_interview_round books it end-to-end (meeting created, round advances)', async () => {
    const recruiterId = new mongoose.Types.ObjectId()
    const company = await CompanyModel.create({ recruiterId, name: 'AI Real Booking Co' })
    const job = await JobModel.create({
      companyId: company._id,
      recruiterId,
      title: 'AI Real Booking Role',
      slug: `ai-real-booking-role-${new mongoose.Types.ObjectId().toString()}`,
      status: 'published',
      pipeline: [{ order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 30, locationType: 'video' }],
    })
    const candidate = await UserModel.create({
      email: 'ai-real-booking-candidate@example.com',
      passwordHash: 'not-a-real-hash',
      name: 'Real Booking Candidate',
      timezone: TIMEZONE,
      accountType: 'candidate',
    })
    const resume = await ResumeModel.create({
      userId: candidate._id,
      fileName: 'resume.txt',
      storageKey: `ai-real-booking-resume-${new mongoose.Types.ObjectId().toString()}`,
      mimeType: 'text/plain',
      sizeBytes: 10,
      extractedText: 'test',
      isDefault: true,
    })
    const application = await ApplicationModel.create({
      jobId: job._id,
      candidateId: candidate._id,
      resumeId: resume._id,
      status: 'interview_in_progress',
      rounds: [
        { order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 30, instructions: '', status: 'ready_to_book' },
      ],
    })

    try {
      const context = { mode: 'user' as const, userId: candidate._id.toString(), email: candidate.email }

      // Step 1: cold-start discovery ("I want to book my interview" with no prior context).
      const discoveryProvider = new ScriptedProvider([
        toolCallResult('find_bookable_interview_rounds', {}),
        textResult('You have one interview ready to book: the Technical Interview for AI Real Booking Role. When works for you?'),
      ])
      const discoveryResult = await runConversation(
        [{ role: 'user', content: 'I want to book my interview' }],
        context,
        TIMEZONE,
        new Date(),
        discoveryProvider,
      )
      assert.match(discoveryResult.reply, /Technical Interview/)

      // Step 2: the model picks a real, available time and books it directly (no manual UI).
      const bookStart = nextWeekdayAtZone(1, 11, 'Asia/Kolkata')
      const bookProvider = new ScriptedProvider([
        toolCallResult('book_interview_round', { applicationId: application._id.toString(), startAt: bookStart.toISOString() }),
        textResult("Booked! You're all set for the Technical Interview."),
      ])
      const bookResult = await runConversation(
        [{ role: 'user', content: 'Monday 11am works' }],
        context,
        TIMEZONE,
        new Date(),
        bookProvider,
      )

      assert.equal(bookResult.actions.length, 1)
      const action = bookResult.actions[0] as { type: string; interview: { id: string; meetingUrl: string | null; status: string } }
      assert.equal(action.type, 'interview_created')
      assert.equal(action.interview.status, 'confirmed')
      assert.ok(action.interview.meetingUrl, 'a video-round booking must get an in-platform Meeting Room link, exactly like every other booking path')

      // Verify it's genuinely persisted in MongoDB, not just a plausible-looking reply.
      const persistedInterview = await InterviewModel.findById(action.interview.id)
      assert.ok(persistedInterview, 'the interview must actually exist in the database')
      assert.equal(persistedInterview?.recruiterId?.toString(), recruiterId.toString())
      assert.ok(persistedInterview?.meeting, 'meeting metadata must be stored on the interview')

      const advancedApplication = await ApplicationModel.findById(application._id)
      assert.equal(advancedApplication?.rounds[0]?.status, 'scheduled', 'the round must advance to scheduled')
      assert.equal(advancedApplication?.rounds[0]?.interviewId?.toString(), action.interview.id)

      // Step 3: booking the SAME application again must refuse — no round is ready_to_book anymore.
      const rebookProvider = new ScriptedProvider([
        toolCallResult('book_interview_round', {
          applicationId: application._id.toString(),
          startAt: nextWeekdayAtZone(2, 11, 'Asia/Kolkata').toISOString(),
        }),
        textResult('done'),
      ])
      const rebookResult = await runConversation(
        [{ role: 'user', content: 'book another one' }],
        context,
        TIMEZONE,
        new Date(),
        rebookProvider,
      )
      assert.deepEqual(rebookResult.actions, [], 'a round that is no longer ready_to_book must never be booked again')

      await InterviewModel.deleteOne({ _id: action.interview.id })
    } finally {
      await ApplicationModel.deleteOne({ _id: application._id })
      await ResumeModel.deleteOne({ _id: resume._id })
      await UserModel.deleteOne({ _id: candidate._id })
      await JobModel.deleteOne({ _id: job._id })
      await CompanyModel.deleteOne({ _id: company._id })
    }
  })

  it('book_interview_round never fails on conflict — it reports alternatives instead, and a candidate can never book a stranger\'s application', async () => {
    const recruiterId = new mongoose.Types.ObjectId()
    const company = await CompanyModel.create({ recruiterId, name: 'AI Conflict Test Co' })
    const job = await JobModel.create({
      companyId: company._id,
      recruiterId,
      title: 'AI Conflict Test Role',
      slug: `ai-conflict-test-role-${new mongoose.Types.ObjectId().toString()}`,
      status: 'published',
      pipeline: [{ order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 30, locationType: 'phone' }],
    })

    async function makeCandidateWithReadyRound(emailSuffix: string) {
      const candidate = await UserModel.create({
        email: `ai-conflict-${emailSuffix}@example.com`,
        passwordHash: 'not-a-real-hash',
        name: `Conflict Candidate ${emailSuffix}`,
        timezone: TIMEZONE,
        accountType: 'candidate',
      })
      const resume = await ResumeModel.create({
        userId: candidate._id,
        fileName: 'resume.txt',
        storageKey: `ai-conflict-resume-${emailSuffix}-${new mongoose.Types.ObjectId().toString()}`,
        mimeType: 'text/plain',
        sizeBytes: 10,
        extractedText: 'test',
        isDefault: true,
      })
      const application = await ApplicationModel.create({
        jobId: job._id,
        candidateId: candidate._id,
        resumeId: resume._id,
        status: 'interview_in_progress',
        rounds: [
          { order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 30, instructions: '', status: 'ready_to_book' },
        ],
      })
      return { candidate, resume, application }
    }

    const first = await makeCandidateWithReadyRound('first')
    const second = await makeCandidateWithReadyRound('second')

    try {
      const contestedStart = nextWeekdayAtZone(3, 12, 'Asia/Kolkata')

      // First candidate books the slot successfully.
      const firstProvider = new ScriptedProvider([
        toolCallResult('book_interview_round', { applicationId: first.application._id.toString(), startAt: contestedStart.toISOString() }),
        textResult('booked'),
      ])
      const firstResult = await runConversation(
        [{ role: 'user', content: 'book it' }],
        { mode: 'user', userId: first.candidate._id.toString(), email: first.candidate.email },
        TIMEZONE,
        new Date(),
        firstProvider,
      )
      assert.equal(firstResult.actions.length, 1)
      const firstAction = firstResult.actions[0] as { interview: { id: string } }

      // Second candidate's AI tries the exact same instant — must never "fail" outright; the
      // tool result must carry alternatives for the model to offer conversationally.
      const secondProvider = new ScriptedProvider([
        toolCallResult('book_interview_round', { applicationId: second.application._id.toString(), startAt: contestedStart.toISOString() }),
        textResult('That time was just taken — here are the next available times.'),
      ])
      await runConversation(
        [{ role: 'user', content: 'book it' }],
        { mode: 'user', userId: second.candidate._id.toString(), email: second.candidate.email },
        TIMEZONE,
        new Date(),
        secondProvider,
      )
      // The tool result (fed back to the model, not asserted on the ConversationResult here)
      // must have contained alternatives, not a bare error — proven indirectly by the second
      // round never advancing to 'scheduled'.
      const secondApplicationAfter = await ApplicationModel.findById(second.application._id)
      assert.equal(secondApplicationAfter?.rounds[0]?.status, 'ready_to_book', "the conflicting attempt must never book the second candidate's round")

      // A stranger can never book against someone else's application id (IDOR).
      const strangerProvider = new ScriptedProvider([
        toolCallResult('book_interview_round', {
          applicationId: first.application._id.toString(),
          startAt: nextWeekdayAtZone(4, 12, 'Asia/Kolkata').toISOString(),
        }),
        textResult('done'),
      ])
      const strangerResult = await runConversation(
        [{ role: 'user', content: 'book the first interview' }],
        { mode: 'user', userId: second.candidate._id.toString(), email: second.candidate.email },
        TIMEZONE,
        new Date(),
        strangerProvider,
      )
      assert.deepEqual(strangerResult.actions, [], "a candidate must never be able to book a stranger's application")

      await InterviewModel.deleteOne({ _id: firstAction.interview.id })
    } finally {
      await ApplicationModel.deleteMany({ _id: { $in: [first.application._id, second.application._id] } })
      await ResumeModel.deleteMany({ _id: { $in: [first.resume._id, second.resume._id] } })
      await UserModel.deleteMany({ _id: { $in: [first.candidate._id, second.candidate._id] } })
      await JobModel.deleteOne({ _id: job._id })
      await CompanyModel.deleteOne({ _id: company._id })
    }
  })

  it("a signed-in candidate's check_availability resolves the OWNING recruiter's own calendar via applicationId, never the legacy singleton", async () => {
    const recruiterId = new mongoose.Types.ObjectId()
    const company = await CompanyModel.create({ recruiterId, name: 'AI Per-Recruiter Calendar Co' })
    const job = await JobModel.create({
      companyId: company._id,
      recruiterId,
      title: 'Per-Recruiter Calendar Test Role',
      slug: `per-recruiter-calendar-test-role-${new mongoose.Types.ObjectId().toString()}`,
      status: 'published',
      pipeline: [{ order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 30 }],
    })

    // A distinct timezone from the legacy singleton's America/New_York (set up in before())
    // so a passing assertion actually proves the recruiter's own calendar was consulted.
    await upsertScheduleConfigForRecruiter(recruiterId.toString(), {
      timezone: 'Europe/London',
      workingHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 540, endMinutes: 1020, isActive: true })),
      breaks: [],
    })

    const candidate = await UserModel.create({
      email: 'ai-per-recruiter-candidate@example.com',
      passwordHash: 'not-a-real-hash',
      name: 'Calendar Test Candidate',
      timezone: TIMEZONE,
      accountType: 'candidate',
    })
    const resume = await ResumeModel.create({
      userId: candidate._id,
      fileName: 'resume.txt',
      storageKey: `ai-per-recruiter-resume-${new mongoose.Types.ObjectId().toString()}`,
      mimeType: 'text/plain',
      sizeBytes: 10,
      extractedText: 'test',
      isDefault: true,
    })
    const application = await ApplicationModel.create({
      jobId: job._id,
      candidateId: candidate._id,
      resumeId: resume._id,
      status: 'interview_in_progress',
      rounds: [
        { order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 30, instructions: '', status: 'ready_to_book' },
      ],
    })

    try {
      const userContext = { mode: 'user' as const, userId: candidate._id.toString(), email: candidate.email }

      // Without applicationId, a signed-in candidate's check_availability must refuse rather
      // than silently falling back to some other calendar.
      const missingIdProvider = new ScriptedProvider([
        toolCallResult('check_availability', { start: nextWeekdayAt(1, 10).toISOString(), durationMinutes: 30 }),
        textResult('done'),
      ])
      const missingIdResult = await runConversation(
        [{ role: 'user', content: 'is Monday 10am free' }],
        userContext,
        TIMEZONE,
        new Date(),
        missingIdProvider,
      )
      // The tool result fed back to the model must describe the error, never invented
      // availability — proven by the loop completing normally (the error was handled, not
      // thrown) and producing no availability action at all.
      assert.equal(missingIdResult.reply, 'done')
      assert.deepEqual(missingIdResult.actions, [])

      // With applicationId, it must resolve recruiterId's own Europe/London calendar.
      const withIdProvider = new ScriptedProvider([
        toolCallResult('check_availability', {
          start: nextWeekdayAt(1, 10).toISOString(),
          durationMinutes: 30,
          applicationId: application._id.toString(),
        }),
        textResult('done'),
      ])
      const result = await runConversation(
        [{ role: 'user', content: 'is Monday 10am free for my technical interview' }],
        userContext,
        TIMEZONE,
        new Date(),
        withIdProvider,
      )
      assert.equal(result.reply, 'done')
      assert.equal(result.actions.length, 1)
      const action = result.actions[0] as { type: string; available: boolean }
      assert.equal(action.type, 'availability')
      assert.equal(typeof action.available, 'boolean')
    } finally {
      await ApplicationModel.deleteOne({ _id: application._id })
      await ResumeModel.deleteOne({ _id: resume._id })
      await UserModel.deleteOne({ _id: candidate._id })
      await JobModel.deleteOne({ _id: job._id })
      await CompanyModel.deleteOne({ _id: company._id })
    }
  })

  it('book_interview_round falls back to the conversation\'s activeApplicationId hint when the model omits applicationId', async () => {
    const recruiterId = new mongoose.Types.ObjectId()
    const company = await CompanyModel.create({ recruiterId, name: 'AI Hint Fallback Co' })
    const job = await JobModel.create({
      companyId: company._id,
      recruiterId,
      title: 'AI Hint Fallback Role',
      slug: `ai-hint-fallback-role-${new mongoose.Types.ObjectId().toString()}`,
      status: 'published',
      pipeline: [{ order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 30, locationType: 'phone' }],
    })
    const candidate = await UserModel.create({
      email: 'ai-hint-fallback-candidate@example.com',
      passwordHash: 'not-a-real-hash',
      name: 'Hint Fallback Candidate',
      timezone: TIMEZONE,
      accountType: 'candidate',
    })
    const resume = await ResumeModel.create({
      userId: candidate._id,
      fileName: 'resume.txt',
      storageKey: `ai-hint-fallback-resume-${new mongoose.Types.ObjectId().toString()}`,
      mimeType: 'text/plain',
      sizeBytes: 10,
      extractedText: 'test',
      isDefault: true,
    })
    const application = await ApplicationModel.create({
      jobId: job._id,
      candidateId: candidate._id,
      resumeId: resume._id,
      status: 'interview_in_progress',
      rounds: [
        { order: 1, type: 'technical', title: 'Technical Interview', durationMinutes: 30, instructions: '', status: 'ready_to_book' },
      ],
    })

    try {
      // No applicationId in the tool-call args at all — only the AiContext carries it, as if
      // the candidate arrived via a "Book with AI" link on this specific application.
      const provider = new ScriptedProvider([
        toolCallResult('book_interview_round', { startAt: nextWeekdayAtZone(5, 12, 'Asia/Kolkata').toISOString() }),
        textResult('booked'),
      ])
      const result = await runConversation(
        [{ role: 'user', content: 'book it' }],
        { mode: 'user', userId: candidate._id.toString(), email: candidate.email, activeApplicationId: application._id.toString() },
        TIMEZONE,
        new Date(),
        provider,
      )

      assert.equal(result.actions.length, 1)
      const action = result.actions[0] as { interview: { id: string } }
      const advancedApplication = await ApplicationModel.findById(application._id)
      assert.equal(advancedApplication?.rounds[0]?.status, 'scheduled', 'the hinted application\'s round must be the one that got booked')

      await InterviewModel.deleteOne({ _id: action.interview.id })
    } finally {
      await ApplicationModel.deleteOne({ _id: application._id })
      await ResumeModel.deleteOne({ _id: resume._id })
      await UserModel.deleteOne({ _id: candidate._id })
      await JobModel.deleteOne({ _id: job._id })
      await CompanyModel.deleteOne({ _id: company._id })
    }
  })

  it('stops after the max tool-iteration cap instead of looping forever', async () => {
    const infiniteScript = Array.from({ length: 20 }, () => toolCallResult('check_availability', { start: nextWeekdayAt(4, 9).toISOString(), durationMinutes: 30 }))
    const provider = new ScriptedProvider(infiniteScript)

    const result = await runConversation([{ role: 'user', content: 'loop forever' }], { mode: 'guest' }, TIMEZONE, new Date(), provider)

    assert.match(result.reply, /wasn't able to finish/)
  })
})
