import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

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
 * A singleton document — this project targets a single calendar/business
 * context (no multi-provider), so there is exactly one schedule config, not
 * one per provider. The unique `singleton` key enforces that at the
 * database level: a second insert attempt fails uniqueness.
 */
const scheduleConfigSchema = new Schema(
  {
    singleton: { type: String, required: true, unique: true, default: 'default', immutable: true },
    timezone: { type: String, required: true },
    workingHours: { type: [workingHoursSchema], required: true, default: [] },
    breaks: { type: [recurringBreakSchema], required: true, default: [] },
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
