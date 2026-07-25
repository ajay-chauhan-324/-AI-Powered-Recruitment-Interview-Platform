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
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
