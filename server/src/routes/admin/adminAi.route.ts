import { Router } from 'express'
import { postAdminAiChat } from '../../controllers/admin/adminAi.controller.js'
import { requireAdminAuth } from '../../middleware/adminAuth.js'

export const adminAiRouter = Router()

adminAiRouter.use(requireAdminAuth)
adminAiRouter.post('/chat', postAdminAiChat)
