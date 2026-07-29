import type { NextFunction, Request, Response } from 'express'
import { rescheduleInterviewInputSchema } from '../validators/interview.validators.js'
import {
  cancelInterview,
  findInterviewOwnedByUser,
  listInterviewsForUser,
  rescheduleInterview,
} from '../services/interview.service.js'
import { InterviewNotFoundError } from '../services/booking.errors.js'
import { toOwnerJson } from './interviews.controller.js'

/** Every handler here is reached only via requireUserAuth (myInterviews.route.ts), so
 * req.user is always populated. Every lookup is additionally scoped to the authenticated
 * user's own records (findInterviewOwnedByUser) — never trust the interview id in the URL
 * alone, or this becomes an IDOR: user A reading/rescheduling/cancelling user B's interview. */

export async function getMyInterviews(req: Request, res: Response, next: NextFunction) {
  try {
    const interviews = await listInterviewsForUser(req.user!.userId, req.user!.email)
    res.status(200).json({ interviews: interviews.map(toOwnerJson) })
  } catch (error) {
    next(error)
  }
}

/** Express 5 types a route param as string | string[] | undefined (repeated-param patterns
 * aren't possible for this route, but the type doesn't know that). */
function requireStringParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new InterviewNotFoundError()
  return value
}

async function findOwnInterviewOrThrow(req: Request) {
  const interview = await findInterviewOwnedByUser(
    requireStringParam(req.params.id),
    req.user!.userId,
    req.user!.email,
  )
  if (!interview) throw new InterviewNotFoundError()
  return interview
}

export async function getMyInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const interview = await findOwnInterviewOrThrow(req)
    res.status(200).json({ interview: toOwnerJson(interview) })
  } catch (error) {
    next(error)
  }
}

export async function patchMyInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await findOwnInterviewOrThrow(req)
    const { newStart } = rescheduleInterviewInputSchema.parse(req.body)
    const updated = await rescheduleInterview(existing._id.toString(), newStart)
    res.status(200).json({ interview: toOwnerJson(updated) })
  } catch (error) {
    next(error)
  }
}

export async function deleteMyInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await findOwnInterviewOrThrow(req)
    const cancelled = await cancelInterview(existing._id.toString())
    res.status(200).json({ interview: toOwnerJson(cancelled) })
  } catch (error) {
    next(error)
  }
}
