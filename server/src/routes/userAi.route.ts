import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { postUserAiChat } from '../controllers/userAi.controller.js'
import { requireCandidateAuth } from '../middleware/candidateAuth.js'

export const userAiRouter = Router()

// Mirrors the guest chat limiter (ai.route.ts) — same upstream-LLM-call-plus-mutation cost.
const aiChatRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
})

userAiRouter.use(requireCandidateAuth)
userAiRouter.post('/chat', aiChatRateLimit, postUserAiChat)
