import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { healthRouter } from './routes/health.route.js'
import { calendarRouter } from './routes/calendar.route.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  )
  app.use(express.json())

  app.use('/api/v1/health', healthRouter)
  app.use('/api/v1/calendar', calendarRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
