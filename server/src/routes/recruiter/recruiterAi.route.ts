import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireRecruiterAuth } from '../../middleware/recruiterAuth.js'
import { postRecruiterAiChat } from '../../controllers/recruiter/recruiterAi.controller.js'

export const recruiterAiRouter = Router()

const aiChatRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
})

recruiterAiRouter.use(requireRecruiterAuth)
recruiterAiRouter.post('/chat', aiChatRateLimit, postRecruiterAiChat)
