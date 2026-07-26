import { Router } from 'express'
import { isDbConnected } from '../config/db.js'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  const dbConnected = isDbConnected()
  // A deployment orchestrator/load balancer reads the status code, not the JSON body — this
  // must actually be non-2xx when the app can't serve most of its functionality, or health
  // checks never catch a real outage.
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    db: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  })
})
