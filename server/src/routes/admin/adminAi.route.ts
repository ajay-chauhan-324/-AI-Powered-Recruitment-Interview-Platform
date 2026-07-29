import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { postAdminAiChat } from '../../controllers/admin/adminAi.controller.js'
import { requireAdminAuth } from '../../middleware/adminAuth.js'

export const adminAiRouter = Router()

// Matches every sibling AI chat route (ai.route.ts, userAi.route.ts, recruiterAi.route.ts) —
// this one was missing it, an inconsistent gap against upstream LLM cost abuse.
const aiChatRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
})

adminAiRouter.use(requireAdminAuth)
adminAiRouter.post('/chat', aiChatRateLimit, postAdminAiChat)
