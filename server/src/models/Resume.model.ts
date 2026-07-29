import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

/**
 * A candidate-uploaded resume file. `storageKey` is an internal path handle understood only
 * by resume.service.ts's storage abstraction — never a public URL (files are served through
 * an authenticated, ownership-checked route; see routes/resumes.route.ts). `extractedText`
 * is what the ATS analysis pipeline actually reads; it is capped in resume.service.ts before
 * being stored here, so this collection can't grow unbounded from a huge uploaded file.
 */
const resumeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    storageKey: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true, trim: true, maxlength: 100 },
    sizeBytes: { type: Number, required: true, min: 0 },
    extractedText: { type: String, default: '' },
    isDefault: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
)

resumeSchema.index({ userId: 1, createdAt: -1 })

export type ResumeAttrs = InferSchemaType<typeof resumeSchema>
export type ResumeDocument = HydratedDocument<ResumeAttrs>
export const ResumeModel = model('Resume', resumeSchema)
