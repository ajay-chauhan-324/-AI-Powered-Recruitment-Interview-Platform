import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  getMe,
  patchMe,
  postChangePassword,
  postLogin,
  postLogout,
  postRegister,
} from '../controllers/auth.controller.js'
import { requireUserAuth } from '../middleware/userAuth.js'

export const authRouter = Router()

// Mirrors adminAuthRouter's login limiter (adminAuth.route.ts) — same brute-force concern.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
})

// Registration is open to the public, unlike admin creation — worth limiting independently
// so it can't be used to enumerate emails or spam-create accounts.
const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
})

// change-password is session-gated (not anonymously brute-forceable), but it's still a
// credential-guessing surface for whoever holds a valid session (e.g. a stolen/XSS'd cookie)
// — every other credential-adjacent endpoint here already has a limiter, so this closes the
// one inconsistent gap rather than leaving currentPassword guessable at unlimited rate.
const changePasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
})

authRouter.post('/register', registerRateLimit, postRegister)
authRouter.post('/login', loginRateLimit, postLogin)
authRouter.post('/logout', postLogout)
authRouter.get('/me', requireUserAuth, getMe)
authRouter.patch('/me', requireUserAuth, patchMe)
authRouter.post('/change-password', requireUserAuth, changePasswordRateLimit, postChangePassword)
