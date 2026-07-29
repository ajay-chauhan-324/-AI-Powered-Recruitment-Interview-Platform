import { DateTime } from 'luxon'
import { getNotificationTransport, type NotificationTransport } from './notificationTransport.js'
import type { InterviewLocationType, InterviewType } from '../../models/Interview.model.js'

export interface InterviewNotificationContext {
  candidateName: string
  candidateEmail: string
  title: string
  interviewType: InterviewType
  round: number
  locationType: InterviewLocationType
  meetingUrl: string
  address: string
  interviewerName: string
  startAt: Date
  endAt: Date
  timezone: string
}

const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  hr_screening: 'HR Screening',
  technical: 'Technical Interview',
  coding: 'Coding Interview',
  system_design: 'System Design Interview',
  behavioral: 'Behavioral Interview',
  managerial: 'Managerial Interview',
  final: 'Final Interview',
  panel: 'Panel Interview',
  custom: 'Interview',
}

export function formatRange(startAt: Date, endAt: Date, timezone: string): string {
  const start = DateTime.fromJSDate(startAt, { zone: timezone })
  const end = DateTime.fromJSDate(endAt, { zone: timezone })
  return `${start.toFormat('cccc, LLLL d, yyyy')}, ${start.toFormat('h:mm a')}–${end.toFormat('h:mm a')} (${start.toFormat('ZZZZ')})`
}

function describeInterview(ctx: InterviewNotificationContext): string[] {
  const lines = [
    `${ctx.title} — ${INTERVIEW_TYPE_LABELS[ctx.interviewType]}, Round ${ctx.round}`,
    formatRange(ctx.startAt, ctx.endAt, ctx.timezone),
  ]
  if (ctx.locationType === 'video' && ctx.meetingUrl) lines.push(`Meeting link: ${ctx.meetingUrl}`)
  else if (ctx.locationType === 'phone') lines.push('Format: Phone call')
  else if (ctx.locationType === 'onsite' && ctx.address) lines.push(`Location: ${ctx.address}`)
  if (ctx.interviewerName) lines.push(`Interviewer: ${ctx.interviewerName}`)
  return lines
}

export async function sendConfirmationEmail(
  ctx: InterviewNotificationContext & { manageUrl: string },
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.candidateEmail,
    subject: `Interview confirmed: ${ctx.title}`,
    body: [
      `Hi ${ctx.candidateName},`,
      '',
      'Your interview is confirmed:',
      ...describeInterview(ctx),
      '',
      `Manage this interview (reschedule or cancel): ${ctx.manageUrl}`,
    ].join('\n'),
  })
}

export async function sendInterviewerConfirmationEmail(
  ctx: InterviewNotificationContext & { interviewerEmail: string },
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.interviewerEmail,
    subject: `New interview scheduled: ${ctx.title}`,
    body: [
      `Hi ${ctx.interviewerName || 'there'},`,
      '',
      `A candidate has booked an interview with you:`,
      `Candidate: ${ctx.candidateName} (${ctx.candidateEmail})`,
      ...describeInterview(ctx),
    ].join('\n'),
  })
}

export async function sendRescheduleEmail(
  ctx: InterviewNotificationContext,
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.candidateEmail,
    subject: `Interview rescheduled: ${ctx.title}`,
    body: [`Hi ${ctx.candidateName},`, '', 'Your interview has been moved to:', ...describeInterview(ctx)].join('\n'),
  })
}

export async function sendInterviewerRescheduleEmail(
  ctx: InterviewNotificationContext & { interviewerEmail: string },
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.interviewerEmail,
    subject: `Interview rescheduled: ${ctx.title}`,
    body: [
      `Hi ${ctx.interviewerName || 'there'},`,
      '',
      `The interview with ${ctx.candidateName} has been moved to:`,
      ...describeInterview(ctx),
    ].join('\n'),
  })
}

export async function sendCancellationEmail(
  ctx: InterviewNotificationContext,
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.candidateEmail,
    subject: `Interview cancelled: ${ctx.title}`,
    body: [
      `Hi ${ctx.candidateName},`,
      '',
      `Your interview scheduled for ${formatRange(ctx.startAt, ctx.endAt, ctx.timezone)} has been cancelled.`,
    ].join('\n'),
  })
}

export async function sendInterviewerCancellationEmail(
  ctx: InterviewNotificationContext & { interviewerEmail: string },
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.interviewerEmail,
    subject: `Interview cancelled: ${ctx.title}`,
    body: [
      `Hi ${ctx.interviewerName || 'there'},`,
      '',
      `The interview with ${ctx.candidateName} scheduled for ${formatRange(ctx.startAt, ctx.endAt, ctx.timezone)} has been cancelled.`,
    ].join('\n'),
  })
}

/**
 * Reminder notification — 30/5-minutes-before-meeting alerts, fired by the scheduler in
 * server.ts (server/src/services/meetingReminder.service.ts) once each interview crosses each
 * threshold. `minutesBefore` only changes the wording, never the send logic.
 */
export async function sendReminderEmail(
  ctx: InterviewNotificationContext,
  minutesBefore: number,
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.candidateEmail,
    subject: `Reminder: upcoming interview — ${ctx.title}`,
    body: [
      `Hi ${ctx.candidateName},`,
      '',
      `Your interview starts in about ${minutesBefore} minutes:`,
      ...describeInterview(ctx),
    ].join('\n'),
  })
}

export async function sendInterviewerReminderEmail(
  ctx: InterviewNotificationContext & { interviewerEmail: string },
  minutesBefore: number,
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.interviewerEmail,
    subject: `Reminder: upcoming interview — ${ctx.title}`,
    body: [
      `Hi ${ctx.interviewerName || 'there'},`,
      '',
      `Your interview with ${ctx.candidateName} starts in about ${minutesBefore} minutes:`,
      ...describeInterview(ctx),
    ].join('\n'),
  })
}

export interface RoundReadyNotificationContext {
  candidateName: string
  candidateEmail: string
  jobTitle: string
  roundTitle: string
  round: number
}

/** Fired when a recruiter shortlists a candidate or passes a round, automatically unlocking
 * the next one (application.service.ts's unlockNextRound) — replaces the AI as the thing that
 * tells a candidate it's time to book (this project's "AI should not be responsible for
 * booking" product decision). */
export async function sendRoundReadyEmail(
  ctx: RoundReadyNotificationContext,
  transport: NotificationTransport = getNotificationTransport(),
): Promise<void> {
  await transport.send({
    to: ctx.candidateEmail,
    subject: `Interview ready to book: ${ctx.jobTitle}`,
    body: [
      `Hi ${ctx.candidateName},`,
      '',
      `Your ${ctx.roundTitle} (Round ${ctx.round}) for ${ctx.jobTitle} is ready to book.`,
      'Head to My Applications to choose a time.',
    ].join('\n'),
  })
}
