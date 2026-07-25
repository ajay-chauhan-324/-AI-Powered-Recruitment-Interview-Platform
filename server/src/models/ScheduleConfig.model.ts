import { Schema, model, type InferSchemaType } from 'mongoose'

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
  },
  { timestamps: true },
)

export type ScheduleConfigDocument = InferSchemaType<typeof scheduleConfigSchema>
export const ScheduleConfigModel = model('ScheduleConfig', scheduleConfigSchema)
