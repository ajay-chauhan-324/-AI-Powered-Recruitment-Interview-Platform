import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  deleteInterviewByManageToken,
  getInterviewByManageToken,
  patchInterviewByManageToken,
  postInterview,
} from '../controllers/interviews.controller.js'
import { attachUserIfPresent } from '../middleware/userAuth.js'

export const interviewsRouter = Router()

// Unauthenticated and reachable by anyone: without a limit, this endpoint can be used to
// spam-fill availability or email-bomb an arbitrary victim's inbox with confirmation emails
// (the notification service sends to whatever address the request supplies).
const createInterviewRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

// Manage-token routes are keyed by a 256-bit random token (brute force is infeasible), but
// still worth limiting against scripted scanning/abuse of an unauthenticated endpoint.
const manageTokenRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
})

interviewsRouter.post('/', createInterviewRateLimit, attachUserIfPresent, postInterview)
interviewsRouter.get('/manage/:token', manageTokenRateLimit, getInterviewByManageToken)
interviewsRouter.patch('/manage/:token', manageTokenRateLimit, patchInterviewByManageToken)
interviewsRouter.delete('/manage/:token', manageTokenRateLimit, deleteInterviewByManageToken)
