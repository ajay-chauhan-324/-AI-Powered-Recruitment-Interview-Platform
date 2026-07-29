import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireCandidateAuth } from '../middleware/candidateAuth.js'
import {
  getMyApplication,
  getMyApplications,
  getScheduleApplicationAvailability,
  postApplication,
  postScheduleApplicationInterview,
} from '../controllers/applications.controller.js'

export const applicationsRouter = Router()

// Each submission triggers an AI analysis call — worth its own limiter, mirroring the AI
// chat endpoints' reasoning.
const applyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

applicationsRouter.use(requireCandidateAuth)
applicationsRouter.get('/', getMyApplications)
applicationsRouter.post('/', applyRateLimit, postApplication)
applicationsRouter.get('/:id', getMyApplication)
applicationsRouter.get('/:id/availability', getScheduleApplicationAvailability)
applicationsRouter.post('/:id/schedule', postScheduleApplicationInterview)
