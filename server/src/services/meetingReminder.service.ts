import { InterviewModel } from '../models/Interview.model.js'
import { toNotificationContext } from './interview.service.js'
import { sendInterviewerReminderEmail, sendReminderEmail } from './notifications/notification.service.js'

/**
 * The scheduler `sendReminderEmail`'s own doc comment (notification.service.ts) said was
 * deliberately deferred — this is that scheduler. No cron/queue dependency: a plain interval
 * scan is enough at this project's scale (CLAUDE.md §23, "do not over-engineer queues"), and
 * every send is idempotent via the meeting's own reminder30Sent/reminder5Sent flags, so a
 * server restart mid-window can never double-send.
 *
 * Scoped to interviews with an in-platform Meeting (meeting !== null, i.e. video-format,
 * online interviews) — "Meeting starts in N minutes" is specifically about the Meeting Room,
 * not a generic interview reminder for phone/onsite interviews.
 */
const REMINDER_THRESHOLDS_MINUTES = [30, 5] as const

async function sendRemindersForThreshold(now: Date, minutesBefore: 30 | 5): Promise<void> {
  const flagField = minutesBefore === 30 ? 'reminder30Sent' : 'reminder5Sent'
  const cutoff = new Date(now.getTime() + minutesBefore * 60_000)

  const interviews = await InterviewModel.find({
    status: 'confirmed',
    meeting: { $ne: null },
    startAt: { $gt: now, $lte: cutoff },
    [`meeting.${flagField}`]: { $ne: true },
  })

  for (const interview of interviews) {
    try {
      const ctx = toNotificationContext(interview)
      await sendReminderEmail(ctx, minutesBefore)
      if (interview.interviewerEmail) {
        await sendInterviewerReminderEmail({ ...ctx, interviewerEmail: interview.interviewerEmail }, minutesBefore)
      }
      if (interview.meeting) {
        interview.meeting[flagField] = true
        await interview.save()
      }
    } catch (error) {
      console.error(`[reminder] failed to send ${minutesBefore}-minute reminder for interview ${interview._id.toString()}:`, error)
    }
  }
}

export async function checkAndSendMeetingReminders(now: Date = new Date()): Promise<void> {
  for (const minutesBefore of REMINDER_THRESHOLDS_MINUTES) {
    await sendRemindersForThreshold(now, minutesBefore)
  }
}

const SCAN_INTERVAL_MS = 60_000

/** Started once from server.ts after the DB connects. Returns the interval handle so the
 * caller can clear it during graceful shutdown. */
export function startMeetingReminderScheduler(): NodeJS.Timeout {
  return setInterval(() => {
    void checkAndSendMeetingReminders().catch((error) => console.error('[reminder] scan failed:', error))
  }, SCAN_INTERVAL_MS)
}
