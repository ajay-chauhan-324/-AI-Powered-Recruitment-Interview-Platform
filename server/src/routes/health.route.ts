import { Router } from 'express'
import { isDbConnected } from '../config/db.js'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    db: isDbConnected() ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  })
})
