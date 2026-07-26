import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { getMe, postLogin, postLogout } from '../../controllers/admin/adminAuth.controller.js'
import { requireAdminAuth } from '../../middleware/adminAuth.js'

export const adminAuthRouter = Router()

// Login is the single most brute-forceable endpoint in the whole app — worth limiting
// now rather than deferring to the Phase 13 security pass.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
})

adminAuthRouter.post('/login', loginRateLimit, postLogin)
adminAuthRouter.post('/logout', postLogout)
adminAuthRouter.get('/me', requireAdminAuth, getMe)
