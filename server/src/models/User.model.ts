import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

export const ACCOUNT_TYPES = ['candidate', 'recruiter'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const EXPERIENCE_LEVELS = ['entry', 'mid', 'senior', 'lead', 'executive'] as const
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]

const experienceEntrySchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    company: { type: String, required: true, trim: true, maxlength: 200 },
    startDate: { type: String, trim: true, maxlength: 20 },
    endDate: { type: String, trim: true, maxlength: 20 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { _id: false },
)

const educationEntrySchema = new Schema(
  {
    institution: { type: String, required: true, trim: true, maxlength: 200 },
    degree: { type: String, trim: true, maxlength: 200, default: '' },
    fieldOfStudy: { type: String, trim: true, maxlength: 200, default: '' },
    endYear: { type: Number },
  },
  { _id: false },
)

const projectEntrySchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    url: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false },
)

/**
 * Candidate/user account — fully independent from AdminUser (see AdminUser.model.ts).
 * Unlike admin accounts, registration here is genuinely self-service (see
 * auth.controller.ts postRegister), so this model also carries profile fields the
 * settings page reads and writes.
 *
 * `accountType` distinguishes a candidate from a recruiter WITHIN this same self-service
 * auth system (same cookie/JWT — see userAuth.ts's `role: 'user'` claim, which is a
 * different, unrelated concept: it discriminates this auth system from the admin one, not
 * candidate vs. recruiter). requireRecruiterAuth re-checks accountType fresh from the
 * database rather than trusting a JWT claim, since the JWT lives for 7 days.
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    timezone: { type: String, required: true, trim: true },
    accountType: { type: String, enum: ACCOUNT_TYPES, required: true, default: 'candidate' },
    phone: { type: String, trim: true },
    linkedIn: { type: String, trim: true },
    github: { type: String, trim: true },
    portfolioUrl: { type: String, trim: true },
    // Local-disk storage key (see server/src/services/avatar.service.ts), mirroring
    // Resume.model.ts's storageKey pattern — never a client-supplied URL.
    photoKey: { type: String, trim: true, default: '' },

    // Candidate profile fields (ignored/unused for recruiter accounts).
    headline: { type: String, trim: true, maxlength: 200, default: '' },
    about: { type: String, trim: true, maxlength: 2000, default: '' },
    location: { type: String, trim: true, maxlength: 200, default: '' },
    skills: { type: [String], default: [] },
    experience: { type: [experienceEntrySchema], default: [] },
    education: { type: [educationEntrySchema], default: [] },
    projects: { type: [projectEntrySchema], default: [] },
    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS },

    // Recruiter accounts own exactly one company for v1 — see Company.model.ts.
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
  },
  { timestamps: true },
)

export type UserAttrs = InferSchemaType<typeof userSchema>
export type UserDocument = HydratedDocument<UserAttrs>
export const UserModel = model('User', userSchema)
