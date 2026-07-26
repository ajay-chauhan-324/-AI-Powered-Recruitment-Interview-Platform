import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import { healthRouter } from './routes/health.route.js'
import { calendarRouter } from './routes/calendar.route.js'
import { availabilityRouter } from './routes/availability.route.js'
import { interviewsRouter } from './routes/interviews.route.js'
import { adminAuthRouter } from './routes/admin/adminAuth.route.js'
import { adminInterviewsRouter } from './routes/admin/adminInterviews.route.js'
import { adminScheduleRouter } from './routes/admin/adminSchedule.route.js'
import { adminBlockedSlotsRouter } from './routes/admin/adminBlockedSlots.route.js'
import { adminCandidatesRouter } from './routes/admin/adminCandidates.route.js'
import { adminDashboardRouter } from './routes/admin/adminDashboard.route.js'
import { aiRouter } from './routes/ai.route.js'
import { adminAiRouter } from './routes/admin/adminAi.route.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

/** Minimal, dependency-free request log: method, path, status, and duration. Enough for
 * production observability at this project's scale without pulling in morgan/winston for a
 * handful of routes. */
function requestLogger(req: express.Request, res: express.Response, next: express.NextFunction) {
  const startedAt = process.hrtime.bigint()
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    console.log(`[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`)
  })
  next()
}

export function createApp() {
  const app = express()

  // See TRUST_PROXY_HOPS in config/env.ts — must match the real deployment topology.
  app.set('trust proxy', env.TRUST_PROXY_HOPS)

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  )
  app.use(express.json())
  app.use(cookieParser())
  app.use(requestLogger)

  app.use('/api/v1/health', healthRouter)
  app.use('/api/v1/calendar', calendarRouter)
  app.use('/api/v1/availability', availabilityRouter)
  app.use('/api/v1/interviews', interviewsRouter)
  app.use('/api/v1/admin/auth', adminAuthRouter)
  app.use('/api/v1/admin/interviews', adminInterviewsRouter)
  app.use('/api/v1/admin/schedule', adminScheduleRouter)
  app.use('/api/v1/admin/blocked-slots', adminBlockedSlotsRouter)
  app.use('/api/v1/admin/candidates', adminCandidatesRouter)
  app.use('/api/v1/admin/dashboard', adminDashboardRouter)
  app.use('/api/v1/ai', aiRouter)
  app.use('/api/v1/admin/ai', adminAiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
