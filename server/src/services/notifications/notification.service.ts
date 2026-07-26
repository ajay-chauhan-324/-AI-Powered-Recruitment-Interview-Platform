import { DateTime } from 'luxon'
import { getNotificationTransport, type NotificationTransport } from './notificationTransport.js'

export interface AppointmentNotificationContext {
  name: string
  email: string
  purpose: string
  startAt: Date
  endAt: Date
  timezone: string
}

export function formatRange(startAt: Date, endAt: Date, timezone: string): string {
  const start = DateTime.fromJSDate(startAt, { zone: timezone })
  const end = DateTime.fromJSDate(endAt, { zone: timezone })
  return `${start.toFormat('cccc, LLLL d, yyyy')}, ${start.toFormat('h:mm a')}–${end.toFormat('h:mm a')} (${start.toFormat('ZZZZ')})`
}

export async function sendConfirmationEmail(
  ctx: AppointmentNotificationContext & { manageUrl: string },
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.email,
    subject: 'Your appointment is confirmed',
    body: [
      `Hi ${ctx.name},`,
      '',
      `Your appointment is confirmed for ${formatRange(ctx.startAt, ctx.endAt, ctx.timezone)}.`,
      `Purpose: ${ctx.purpose}`,
      '',
      `Manage this appointment (reschedule or cancel): ${ctx.manageUrl}`,
    ].join('\n'),
  })
}

export async function sendRescheduleEmail(
  ctx: AppointmentNotificationContext,
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.email,
    subject: 'Your appointment has been rescheduled',
    body: [
      `Hi ${ctx.name},`,
      '',
      `Your appointment has been moved to ${formatRange(ctx.startAt, ctx.endAt, ctx.timezone)}.`,
      `Purpose: ${ctx.purpose}`,
    ].join('\n'),
  })
}

export async function sendCancellationEmail(
  ctx: AppointmentNotificationContext,
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.email,
    subject: 'Your appointment has been cancelled',
    body: [
      `Hi ${ctx.name},`,
      '',
      `Your appointment for ${formatRange(ctx.startAt, ctx.endAt, ctx.timezone)} has been cancelled.`,
    ].join('\n'),
  })
}

/**
 * Reminder ABSTRACTION only (CLAUDE.md §23 lists "Reminder abstraction", not a full
 * reminder system). This function is real and independently testable, but nothing calls
 * it automatically yet — a scheduler that scans for upcoming appointments and calls this,
 * with idempotent send-tracking so a server restart can't double-send, is future work.
 * Deliberately out of scope now per "do not over-engineer queues... keep future queue
 * integration possible" rather than built as a half-working cron job.
 */
export async function sendReminderEmail(
  ctx: AppointmentNotificationContext,
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.email,
    subject: 'Reminder: upcoming appointment',
    body: [
      `Hi ${ctx.name},`,
      '',
      `This is a reminder that you have an appointment on ${formatRange(ctx.startAt, ctx.endAt, ctx.timezone)}.`,
      `Purpose: ${ctx.purpose}`,
    ].join('\n'),
  })
}
