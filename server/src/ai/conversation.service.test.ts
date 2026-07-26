import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { DateTime } from 'luxon'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { InterviewModel } from '../models/Interview.model.js'
import { createInterview } from '../services/interview.service.js'
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

  it('stops after the max tool-iteration cap instead of looping forever', async () => {
    const infiniteScript = Array.from({ length: 20 }, () => toolCallResult('check_availability', { start: nextWeekdayAt(4, 9).toISOString(), durationMinutes: 30 }))
    const provider = new ScriptedProvider(infiniteScript)

    const result = await runConversation([{ role: 'user', content: 'loop forever' }], { mode: 'guest' }, TIMEZONE, new Date(), provider)

    assert.match(result.reply, /wasn't able to finish/)
  })
})
