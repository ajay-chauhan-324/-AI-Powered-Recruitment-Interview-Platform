import type { NextFunction, Request, Response } from 'express'
import {
  publicCreateInterviewInputSchema,
  rescheduleInterviewInputSchema,
} from '../validators/interview.validators.js'
import {
  cancelInterview,
  createInterview,
  getInterviewByToken,
  rescheduleInterview,
} from '../services/interview.service.js'
import { InterviewNotFoundError } from '../services/booking.errors.js'
import type { InterviewDocument } from '../models/Interview.model.js'

function toPublicJson(interview: InterviewDocument) {
  return {
    id: interview._id.toString(),
    startAt: interview.startAt,
    endAt: interview.endAt,
    status: interview.status,
  }
}

/** Only reachable by whoever holds the raw manage token (proof of ownership) — safe to
 * include full detail here, unlike the anonymous public calendar view. */
function toOwnerJson(interview: InterviewDocument) {
  return {
    id: interview._id.toString(),
    title: interview.title,
    description: interview.description,
    interviewType: interview.interviewType,
    round: interview.round,
    locationType: interview.locationType,
    meetingUrl: interview.meetingUrl,
    address: interview.address,
    interviewerName: interview.interviewerName,
    candidateName: interview.candidateName,
    candidateEmail: interview.candidateEmail,
    candidatePhone: interview.candidatePhone,
    candidateLinkedIn: interview.candidateLinkedIn,
    candidateGithub: interview.candidateGithub,
    candidatePortfolioUrl: interview.candidatePortfolioUrl,
    candidateResumeUrl: interview.candidateResumeUrl,
    candidateNotes: interview.candidateNotes,
    startAt: interview.startAt,
    endAt: interview.endAt,
    durationMinutes: interview.durationMinutes,
    timezone: interview.timezone,
    status: interview.status,
  }
}

export async function postInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const input = publicCreateInterviewInputSchema.parse(req.body)
    const { interview, manageToken } = await createInterview({ ...input, source: 'public' })
    res.status(201).json({ interview: toPublicJson(interview), manageToken })
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

async function findOwnedInterviewOrThrow(token: string | string[] | undefined) {
  const interview = await getInterviewByToken(requireStringParam(token))
  if (!interview) throw new InterviewNotFoundError()
  return interview
}

export async function getInterviewByManageToken(req: Request, res: Response, next: NextFunction) {
  try {
    const interview = await findOwnedInterviewOrThrow(req.params.token)
    res.status(200).json({ interview: toOwnerJson(interview) })
  } catch (error) {
    next(error)
  }
}

export async function patchInterviewByManageToken(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await findOwnedInterviewOrThrow(req.params.token)
    const { newStart } = rescheduleInterviewInputSchema.parse(req.body)
    const updated = await rescheduleInterview(existing._id.toString(), newStart)
    res.status(200).json({ interview: toOwnerJson(updated) })
  } catch (error) {
    next(error)
  }
}

export async function deleteInterviewByManageToken(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await findOwnedInterviewOrThrow(req.params.token)
    const cancelled = await cancelInterview(existing._id.toString())
    res.status(200).json({ interview: toOwnerJson(cancelled) })
  } catch (error) {
    next(error)
  }
}
