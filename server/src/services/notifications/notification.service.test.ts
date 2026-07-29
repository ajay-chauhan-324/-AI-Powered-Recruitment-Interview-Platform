import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { NotificationMessage, NotificationTransport } from './notificationTransport.js'
import {
  formatRange,
  sendCancellationEmail,
  sendConfirmationEmail,
  sendInterviewerConfirmationEmail,
  sendReminderEmail,
  sendRescheduleEmail,
  type InterviewNotificationContext,
} from './notification.service.js'

/** Captures messages instead of sending them — notifySafely in interview.service.ts swallows
 * all errors from the default transport, so a content bug there would never fail a test;
 * asserting against a real captured message here closes that gap. */
class CapturingTransport implements NotificationTransport {
  sent: NotificationMessage[] = []
  async send(message: NotificationMessage): Promise<void> {
    this.sent.push(message)
  }
}

const baseContext: InterviewNotificationContext = {
  candidateName: 'Ada Lovelace',
  candidateEmail: 'ada@example.com',
  title: 'Backend Technical Round',
  interviewType: 'technical',
  round: 1,
  locationType: 'video',
  meetingUrl: 'https://meet.example.com/abc',
  address: '',
  interviewerName: 'Priya Sharma',
  startAt: new Date('2026-08-03T14:00:00.000Z'),
  endAt: new Date('2026-08-03T14:30:00.000Z'),
  timezone: 'America/New_York',
}

describe('notification.service', () => {
  it('formatRange renders the date, time range, and timezone abbreviation', () => {
    const label = formatRange(baseContext.startAt, baseContext.endAt, baseContext.timezone)
    assert.equal(label, 'Monday, August 3, 2026, 10:00 AM–10:30 AM (EDT)')
  })

  it('sendConfirmationEmail includes the interview type, meeting link, and manage link, addressed by name', async () => {
    const transport = new CapturingTransport()
    await sendConfirmationEmail({ ...baseContext, manageUrl: 'https://example.com/manage/abc123' }, transport)

    assert.equal(transport.sent.length, 1)
    const message = transport.sent[0]
    assert.ok(message)
    assert.equal(message.to, 'ada@example.com')
    assert.match(message.subject, /confirmed/i)
    assert.match(message.body, /Hi Ada Lovelace,/)
    assert.match(message.body, /Technical Interview/)
    assert.match(message.body, /meet\.example\.com\/abc/)
    assert.match(message.body, /https:\/\/example\.com\/manage\/abc123/)
  })

  it('sendInterviewerConfirmationEmail is addressed to the interviewer and names the candidate', async () => {
    const transport = new CapturingTransport()
    await sendInterviewerConfirmationEmail({ ...baseContext, interviewerEmail: 'priya@example.com' }, transport)

    const message = transport.sent[0]
    assert.ok(message)
    assert.equal(message.to, 'priya@example.com')
    assert.match(message.body, /Hi Priya Sharma,/)
    assert.match(message.body, /Ada Lovelace \(ada@example\.com\)/)
  })

  it('sendRescheduleEmail mentions the new time and never includes a manage link', async () => {
    const transport = new CapturingTransport()
    await sendRescheduleEmail(baseContext, transport)

    const message = transport.sent[0]
    assert.ok(message)
    assert.match(message.subject, /rescheduled/i)
    assert.match(message.body, /moved to/i)
    assert.ok(!message.body.includes('https://example.com/manage'), 'reschedule email should not contain a manage link')
  })

  it('sendCancellationEmail states the cancelled time', async () => {
    const transport = new CapturingTransport()
    await sendCancellationEmail(baseContext, transport)

    const message = transport.sent[0]
    assert.ok(message)
    assert.match(message.subject, /cancelled/i)
    assert.match(message.body, /has been cancelled/i)
  })

  it('sendReminderEmail identifies itself as a reminder and states the minutes remaining', async () => {
    const transport = new CapturingTransport()
    await sendReminderEmail(baseContext, 30, transport)

    const message = transport.sent[0]
    assert.ok(message)
    assert.match(message.subject, /reminder/i)
    assert.match(message.body, /starts in about 30 minutes/i)
  })
})
