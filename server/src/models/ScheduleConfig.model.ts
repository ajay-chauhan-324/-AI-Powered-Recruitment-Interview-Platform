import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { FIXED_BREAKS, FIXED_SCHEDULE_TIMEZONE, FIXED_WORKING_HOURS } from '../config/scheduleDefaults.js'

/**
 * Working hours and recurring breaks are stored as minutes-since-local-
 * midnight (0-1440), not clock strings or fake dates — this is a plain,
 * DST-agnostic representation of a recurring weekly pattern. dayOfWeek is
 * 0 = Sunday .. 6 = Saturday (JS Date convention).
 */
const workingHoursSchema = new Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startMinutes: { type: Number, required: true, min: 0, max: 1440 },
    endMinutes: { type: Number, required: true, min: 0, max: 1440 },
    isActive: { type: Boolean, required: true, default: true },
  },
  { _id: false },
)

const recurringBreakSchema = new Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startMinutes: { type: Number, required: true, min: 0, max: 1440 },
    endMinutes: { type: Number, required: true, min: 0, max: 1440 },
    label: { type: String, required: true, trim: true, maxlength: 100 },
  },
  { _id: false },
)

/**
 * Two kinds of document live in this collection, distinguished by which key is set:
 *
 * - The legacy singleton (`singleton: 'default'`, `recruiterId` unset) — the one shared
 *   calendar for the original generic/admin booking product (CLAUDE.md's "PRODUCT PIVOT"
 *   notice, §36.9). Its timezone/workingHours/breaks are fixed policy, self-healed at boot
 *   (scheduleConfig.service.ts's ensureFixedScheduleConfig) and validator-locked
 *   (schedule.validators.ts) — untouched by the recruitment platform.
 * - A per-recruiter document (`recruiterId` set, `singleton` unset) — the recruitment
 *   platform's "recruiter calendar is the source of truth" model (CLAUDE.md §36 second
 *   pivot): every recruiter owns exactly one calendar, freely configurable, no fixed-pattern
 *   lock. Neither `singleton` nor `recruiterId` carries a schema `default` — Mongoose applies
 *   defaults even to fields a caller omits, which would otherwise stamp every new recruiter
 *   document with `singleton: 'default'` (colliding on the legacy unique index) or every
 *   legacy upsert with an explicit `recruiterId: null` (colliding on the recruiter sparse
 *   unique index, since Mongo's sparse index only skips documents where the field is
 *   genuinely absent, not merely null). Callers must set exactly one of the two keys
 *   themselves; scheduleConfig.service.ts's two families of functions do this consistently.
 */
const scheduleConfigSchema = new Schema(
  {
    singleton: { type: String, unique: true, sparse: true, immutable: true },
    recruiterId: { type: Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true, immutable: true },
    timezone: { type: String, required: true, default: FIXED_SCHEDULE_TIMEZONE },
    workingHours: { type: [workingHoursSchema], required: true, default: FIXED_WORKING_HOURS },
    breaks: { type: [recurringBreakSchema], required: true, default: FIXED_BREAKS },
    // Interview-scheduling booking rules (owned here, applied by AvailabilityService — never
    // duplicated in the AI layer or the frontend). All default to 0/off so existing behavior
    // is unchanged until an admin explicitly configures them.
    bufferMinutes: { type: Number, required: true, min: 0, max: 1440, default: 0 },
    minNoticeMinutes: { type: Number, required: true, min: 0, max: 10_080, default: 0 },
    maxBookingWindowDays: { type: Number, required: true, min: 1, max: 365, default: 60 },
  },
  { timestamps: true },
)

export type ScheduleConfigAttrs = InferSchemaType<typeof scheduleConfigSchema>
export type ScheduleConfigDocument = HydratedDocument<ScheduleConfigAttrs>
export const ScheduleConfigModel = model('ScheduleConfig', scheduleConfigSchema)
