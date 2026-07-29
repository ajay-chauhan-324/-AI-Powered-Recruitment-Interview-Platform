import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { AppError } from './errorHandler.js'

// Deliberately distinct from ADMIN_SESSION_COOKIE (adminAuth.ts) so the two auth systems
// can never collide or be confused for one another, even though they share a cookie jar.
export const USER_SESSION_COOKIE = 'user_session'
export const USER_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7d — self-service accounts, longer-lived than admin

export interface UserAuthPayload {
  role: 'user'
  userId: string
  email: string
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserAuthPayload
  }
}

export function requireUserAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[USER_SESSION_COOKIE] as string | undefined
  if (!token) {
    next(new AppError('UNAUTHORIZED', 'Sign in required.', 401))
    return
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as UserAuthPayload
    if (payload.role !== 'user') {
      throw new Error('wrong role')
    }
    req.user = payload
    next()
  } catch {
    next(new AppError('UNAUTHORIZED', 'Invalid or expired session.', 401))
  }
}

/** Non-throwing variant for routes that behave differently when signed in vs anonymous
 * (e.g. public interview creation auto-attaching userId) without requiring a session. */
export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[USER_SESSION_COOKIE] as string | undefined
  if (!token) {
    next()
    return
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as UserAuthPayload
    if (payload.role === 'user') {
      req.user = payload
    }
  } catch {
    // Invalid/expired token on an optional-auth route: proceed anonymously rather than erroring.
  }
  next()
}
