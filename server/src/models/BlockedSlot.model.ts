import { Schema, model, type InferSchemaType } from 'mongoose'

/**
 * One-off blocked periods (holidays, vacation days) — distinct from the
 * recurring weekly breaks in ScheduleConfig. Stored as absolute UTC
 * instants, unlike the minutes-since-midnight recurring pattern.
 */
const blockedSlotSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 100 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
  },
  { timestamps: true },
)

blockedSlotSchema.index({ startAt: 1, endAt: 1 })

export type BlockedSlotDocument = InferSchemaType<typeof blockedSlotSchema>
export const BlockedSlotModel = model('BlockedSlot', blockedSlotSchema)
