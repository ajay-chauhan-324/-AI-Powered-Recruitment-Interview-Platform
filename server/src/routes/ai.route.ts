import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { postAiChat } from '../controllers/ai.controller.js'

export const aiRouter = Router()

// Each turn can trigger an upstream LLM call and a booking mutation — rate limited
// independently of the plain booking-creation limiter (Phase 13's abuse-prevention pass).
const aiChatRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
})

aiRouter.post('/chat', aiChatRateLimit, postAiChat)
