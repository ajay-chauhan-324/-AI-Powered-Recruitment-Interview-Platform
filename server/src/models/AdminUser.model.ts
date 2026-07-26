import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

/** Only the password hash is ever stored — see server/scripts/create-admin.ts, the only
 * code path that creates one. No self-service admin signup exists (deliberately). */
const adminUserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
)

export type AdminUserAttrs = InferSchemaType<typeof adminUserSchema>
export type AdminUserDocument = HydratedDocument<AdminUserAttrs>
export const AdminUserModel = model('AdminUser', adminUserSchema)
