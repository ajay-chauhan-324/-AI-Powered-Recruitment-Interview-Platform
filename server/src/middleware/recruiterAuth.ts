import type { NextFunction, Request, Response } from 'express'
import { AppError } from './errorHandler.js'
import { requireUserAuth } from './userAuth.js'
import { UserModel } from '../models/User.model.js'

export interface RecruiterAuthContext {
  userId: string
  email: string
  companyId: string
}

declare module 'express-serve-static-core' {
  interface Request {
    recruiter?: RecruiterAuthContext
  }
}

/**
 * Layers on top of requireUserAuth (same session/cookie — recruiters and candidates share
 * one auth system, see User.model.ts's `accountType`). Deliberately re-checks accountType
 * fresh from the database rather than trusting a claim baked into the 7-day session JWT —
 * authorization must never rest on client-held, long-lived token state (CLAUDE.md's
 * security principle).
 */
export function requireRecruiterAuth(req: Request, res: Response, next: NextFunction) {
  requireUserAuth(req, res, async (error?: unknown) => {
    if (error) {
      next(error)
      return
    }
    try {
      const user = await UserModel.findById(req.user!.userId)
      if (!user || user.accountType !== 'recruiter' || !user.companyId) {
        next(new AppError('FORBIDDEN', 'Recruiter access required.', 403))
        return
      }
      req.recruiter = { userId: user._id.toString(), email: user.email, companyId: user.companyId.toString() }
      next()
    } catch (dbError) {
      next(dbError)
    }
  })
}
