import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

/**
 * One company per recruiter account for v1 (User.model.ts's companyId is a 1:1 link) —
 * multi-recruiter team accounts for a single company are out of scope, mirroring the
 * existing single-interviewer-per-interview simplification documented in CLAUDE.md.
 */
const companySchema = new Schema(
  {
    recruiterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    logoUrl: { type: String, trim: true, maxlength: 500, default: '' },
    website: { type: String, trim: true, maxlength: 500, default: '' },
    description: { type: String, trim: true, maxlength: 4000, default: '' },
    industry: { type: String, trim: true, maxlength: 200, default: '' },
    size: { type: String, trim: true, maxlength: 50, default: '' },
    // Headquarters — this IS the company's location, not a separate concept.
    location: { type: String, trim: true, maxlength: 200, default: '' },
    linkedIn: { type: String, trim: true, maxlength: 500, default: '' },
    foundedYear: { type: Number },
    benefits: { type: [String], default: [] },
    culture: { type: String, trim: true, maxlength: 2000, default: '' },
    techStack: { type: [String], default: [] },
  },
  { timestamps: true },
)

export type CompanyAttrs = InferSchemaType<typeof companySchema>
export type CompanyDocument = HydratedDocument<CompanyAttrs>
export const CompanyModel = model('Company', companySchema)
