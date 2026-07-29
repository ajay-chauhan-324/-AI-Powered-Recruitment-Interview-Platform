import { ScheduleConfigModel, type ScheduleConfigDocument } from '../models/ScheduleConfig.model.js'
import { FIXED_BREAKS, FIXED_SCHEDULE_TIMEZONE, FIXED_WORKING_HOURS } from '../config/scheduleDefaults.js'
import type { RecruiterScheduleConfigInput, ScheduleConfigInput } from '../validators/schedule.validators.js'
import { interviewEvents } from '../events/interviewEvents.js'

export async function getScheduleConfig(): Promise<ScheduleConfigDocument | null> {
  return ScheduleConfigModel.findOne({ singleton: 'default' })
}

/**
 * Self-heals the singleton schedule config's timezone/workingHours/breaks to the fixed IST
 * policy every time the server boots — called once from server.ts's startup, never on a
 * request path. Mongoose's schema `default:` only applies to a document at CREATION time; a
 * document already sitting in the database (e.g. one created before this fixed policy
 * existed) keeps its old values forever otherwise, since nothing else ever rewrites it. This
 * is the actual enforcement of "these hours are fixed, not admin-configurable" for data that
 * already exists — the PUT validator (schedule.validators.ts) only blocks a NEW bad write.
 * bufferMinutes/minNoticeMinutes/maxBookingWindowDays are deliberately left untouched — those
 * remain genuinely admin-configurable booking rules, not part of the fixed policy.
 */
export async function ensureFixedScheduleConfig(): Promise<void> {
  const existing = await ScheduleConfigModel.findOne({ singleton: 'default' })
  const isDrifted =
    !existing ||
    existing.timezone !== FIXED_SCHEDULE_TIMEZONE ||
    JSON.stringify(existing.workingHours) !== JSON.stringify(FIXED_WORKING_HOURS) ||
    JSON.stringify(existing.breaks) !== JSON.stringify(FIXED_BREAKS)

  if (!isDrifted) return

  await ScheduleConfigModel.findOneAndUpdate(
    { singleton: 'default' },
    { $set: { timezone: FIXED_SCHEDULE_TIMEZONE, workingHours: FIXED_WORKING_HOURS, breaks: FIXED_BREAKS } },
    { upsert: true, setDefaultsOnInsert: true },
  )
  console.log('[schedule] corrected schedule config to the fixed IST policy (was drifted or missing).')
}

/** Upserts the single schedule config document (CLAUDE.md §20 "Configure working hours").
 * Emits availability.changed so every connected client re-checks availability — working
 * hours changing can make previously-available slots unavailable and vice versa. */
export async function upsertScheduleConfig(input: ScheduleConfigInput): Promise<ScheduleConfigDocument> {
  const updated = await ScheduleConfigModel.findOneAndUpdate(
    { singleton: 'default' },
    { $set: input },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  interviewEvents.emitAvailabilityChanged({ reason: 'schedule' })
  return updated
}

/**
 * The recruitment platform's per-recruiter calendar (CLAUDE.md §36 second pivot: "the
 * recruiter calendar becomes the source of truth"). Unlike the legacy singleton above, this
 * is never self-healed to a fixed pattern and never validator-locked — a recruiter may set
 * any working hours, breaks, or timezone (schedule.validators.ts's
 * recruiterScheduleConfigInputSchema is the only constraint, and it only checks internal
 * consistency, e.g. endMinutes > startMinutes). Auto-created with the same starting values
 * as the legacy default (FIXED_*, reused here purely as a reasonable initial seed, not as an
 * enforced policy) the first time anything asks for this recruiter's calendar — a recruiter
 * who has never visited schedule settings still has candidates able to book against sane
 * default hours, immediately editable thereafter.
 */
export async function getOrCreateScheduleConfigForRecruiter(recruiterId: string): Promise<ScheduleConfigDocument> {
  const existing = await ScheduleConfigModel.findOne({ recruiterId })
  if (existing) return existing
  return ScheduleConfigModel.create({ recruiterId })
}

/** Same "auto-seed on first read" semantics as getOrCreateScheduleConfigForRecruiter — the
 * recruiter-facing schedule settings page always has something to show, never a bare "not
 * configured yet" empty state. */
export async function getScheduleConfigForRecruiter(recruiterId: string): Promise<ScheduleConfigDocument> {
  return getOrCreateScheduleConfigForRecruiter(recruiterId)
}

/** Upserts one recruiter's own calendar. Emits the same availability.changed event as the
 * legacy upsert — a recruiter changing their hours can make previously-bookable candidate
 * slots unavailable (or vice versa) and every connected client (that recruiter's own
 * calendar, and any candidate currently viewing the Interview Scheduler dialog for one of
 * their rounds) must re-check immediately. */
export async function upsertScheduleConfigForRecruiter(
  recruiterId: string,
  input: RecruiterScheduleConfigInput,
): Promise<ScheduleConfigDocument> {
  const updated = await ScheduleConfigModel.findOneAndUpdate(
    { recruiterId },
    { $set: input },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  interviewEvents.emitAvailabilityChanged({ reason: 'schedule' })
  return updated
}
