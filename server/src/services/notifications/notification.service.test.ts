import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { NotificationMessage, NotificationTransport } from './notificationTransport.js'
import {
  formatRange,
  sendCancellationEmail,
  sendConfirmationEmail,
  sendReminderEmail,
  sendRescheduleEmail,
  type AppointmentNotificationContext,
} from './notification.service.js'

/** Captures messages instead of sending them — notifySafely in appointment.service.ts
 * swallows all errors from the default transport, so a content bug there would never fail
 * a test; asserting against a real captured message here closes that gap. */
class CapturingTransport implements NotificationTransport {
  sent: NotificationMessage[] = []
  async send(message: NotificationMessage): Promise<void> {
    this.sent.push(message)
  }
}

const baseContext: AppointmentNotificationContext = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  purpose: 'Consultation',
  startAt: new Date('2026-08-03T14:00:00.000Z'),
  endAt: new Date('2026-08-03T14:30:00.000Z'),
  timezone: 'America/New_York',
}

describe('notification.service', () => {
  it('formatRange renders the date, time range, and timezone abbreviation', () => {
    const label = formatRange(baseContext.startAt, baseContext.endAt, baseContext.timezone)
    assert.equal(label, 'Monday, August 3, 2026, 10:00 AM–10:30 AM (EDT)')
  })

  it('sendConfirmationEmail includes the purpose and manage link, addressed by name', async () => {
    const transport = new CapturingTransport()
    await sendConfirmationEmail({ ...baseContext, manageUrl: 'https://example.com/manage/abc123' }, transport)

    assert.equal(transport.sent.length, 1)
    const message = transport.sent[0]
    assert.ok(message)
    assert.equal(message.to, 'ada@example.com')
    assert.match(message.subject, /confirmed/i)
    assert.match(message.body, /Hi Ada Lovelace,/)
    assert.match(message.body, /Consultation/)
    assert.match(message.body, /https:\/\/example\.com\/manage\/abc123/)
  })

  it('sendRescheduleEmail mentions the new time and never includes a manage link', async () => {
    const transport = new CapturingTransport()
    await sendRescheduleEmail(baseContext, transport)

    const message = transport.sent[0]
    assert.ok(message)
    assert.match(message.subject, /rescheduled/i)
    assert.match(message.body, /moved to/i)
    assert.ok(!message.body.includes('http'), 'reschedule email should not contain a link')
  })

  it('sendCancellationEmail states the cancelled time', async () => {
    const transport = new CapturingTransport()
    await sendCancellationEmail(baseContext, transport)

    const message = transport.sent[0]
    assert.ok(message)
    assert.match(message.subject, /cancelled/i)
    assert.match(message.body, /has been cancelled/i)
  })

  it('sendReminderEmail identifies itself as a reminder', async () => {
    const transport = new CapturingTransport()
    await sendReminderEmail(baseContext, transport)

    const message = transport.sent[0]
    assert.ok(message)
    assert.match(message.subject, /reminder/i)
    assert.match(message.body, /reminder that you have an appointment/i)
  })
})
