import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { AppError } from './errorHandler.js'

export const ADMIN_SESSION_COOKIE = 'admin_session'
export const ADMIN_SESSION_DURATION_MS = 12 * 60 * 60 * 1000 // 12h — short-lived on purpose

export interface AdminAuthPayload {
  adminId: string
  email: string
}

declare module 'express-serve-static-core' {
  interface Request {
    admin?: AdminAuthPayload
  }
}

/** Authorization belongs to backend code (CLAUDE.md §17) — every admin-only route uses
 * this, never trusting anything the client claims about its own privileges. */
export function requireAdminAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[ADMIN_SESSION_COOKIE] as string | undefined
  if (!token) {
    next(new AppError('UNAUTHORIZED', 'Admin authentication required.', 401))
    return
  }

  try {
    req.admin = jwt.verify(token, env.JWT_SECRET) as AdminAuthPayload
    next()
  } catch {
    next(new AppError('UNAUTHORIZED', 'Invalid or expired session.', 401))
  }
}
