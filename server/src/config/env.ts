import 'dotenv/config'
import { z } from 'zod'

/**
 * Fail-fast environment validation. Every later phase (DB connection, AI
 * provider keys, JWT secrets) adds fields here rather than reading
 * process.env directly elsewhere in the codebase.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.url().default('http://localhost:5173'),
  // Must point at a replica set (directly or via Atlas, which is a replica set by
  // default) — conflict-safe booking (CLAUDE.md §13) relies on multi-document
  // transactions, which a standalone mongod does not support.
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  // Signs the admin session cookie (Phase 9). Generate with:
  // node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  // Optional (Phase 10). Without these, notifications log to the console instead of
  // sending real email — a deliberate credential-free default, not a missing feature.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
