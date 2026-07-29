import type { NextFunction, Request, Response } from 'express'
import { AppError } from './errorHandler.js'
import { requireUserAuth } from './userAuth.js'
import { UserModel } from '../models/User.model.js'

/**
 * Layers on top of requireUserAuth (same session/cookie — recruiters and candidates share
 * one auth system, see User.model.ts's `accountType`), mirroring requireRecruiterAuth's
 * shape exactly. Candidate-only endpoints (applying to jobs, managing resumes, the
 * candidate's own booked interviews, the candidate AI assistant) must not be reachable by a
 * recruiter account just because it shares the same session cookie/JWT — accountType is
 * re-verified fresh from the database on every request, never trusted from the JWT claim.
 */
export function requireCandidateAuth(req: Request, res: Response, next: NextFunction) {
  requireUserAuth(req, res, async (error?: unknown) => {
    if (error) {
      next(error)
      return
    }
    try {
      const user = await UserModel.findById(req.user!.userId)
      if (!user || user.accountType !== 'candidate') {
        next(new AppError('FORBIDDEN', 'Candidate access required.', 403))
        return
      }
      next()
    } catch (dbError) {
      next(dbError)
    }
  })
}
