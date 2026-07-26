import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export const APPOINTMENT_SOURCES = ['ai', 'admin', 'public'] as const
export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number]

/**
 * startAt/endAt are always stored in UTC; `timezone` records the customer's
 * timezone at booking time for display/notification formatting only — it is
 * never used to reinterpret startAt/endAt. `manageTokenHash` stores a hash
 * of the guest management token, never the raw token (CLAUDE.md §19).
 *
 * This is a schema/model definition only — no service layer exists yet.
 * AppointmentService (Phase 4) is the only code path allowed to write here.
 */
const appointmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    purpose: { type: String, required: true, trim: true, maxlength: 500 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    timezone: { type: String, required: true, trim: true },
    status: { type: String, enum: APPOINTMENT_STATUSES, required: true, default: 'pending' },
    source: { type: String, enum: APPOINTMENT_SOURCES, required: true },
    manageTokenHash: { type: String, required: true, unique: true },
  },
  { timestamps: true },
)

// Supports the overlap query AppointmentService will run inside a transaction
// before every create/reschedule: { status: 'confirmed', startAt: { $lt }, endAt: { $gt } }.
appointmentSchema.index({ status: 1, startAt: 1, endAt: 1 })

/** The plain data shape (used for `.lean()` query results) — no `_id`, no instance methods. */
export type AppointmentAttrs = InferSchemaType<typeof appointmentSchema>
/** A real Mongoose document instance — has `_id`, `.save()`, etc. Use this everywhere a hydrated document is expected. */
export type AppointmentDocument = HydratedDocument<AppointmentAttrs>
export const AppointmentModel = model('Appointment', appointmentSchema)
