import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import {
  cancelInterview,
  createInterview,
  listInterviewsInRange,
  rescheduleInterview,
} from '../../services/interview.service.js'
import { createInterviewInputSchema } from '../../validators/interview.validators.js'
import { dateRangeQuerySchema } from '../../validators/calendar.validators.js'
import type { InterviewDocument } from '../../models/Interview.model.js'
import { NotFoundError } from '../../services/booking.errors.js'

/** Express 5 types a route param as string | string[] | undefined even for a plain `/:id`
 * pattern that can never actually match an array. */
function requireIdParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new NotFoundError('Interview not found.')
  return value
}

/** Full detail, unlike the public calendar view — this route is admin-only (requireAdminAuth). */
function toAdminJson(interview: InterviewDocument) {
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
    interviewerEmail: interview.interviewerEmail,
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
    source: interview.source,
    rescheduleHistory: interview.rescheduleHistory,
  }
}

export async function getAdminInterviews(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = dateRangeQuerySchema.parse(req.query)
    const interviews = await listInterviewsInRange(from, to)
    res.status(200).json({ interviews: interviews.map(toAdminJson) })
  } catch (error) {
    next(error)
  }
}

const adminCreateInputSchema = createInterviewInputSchema.omit({ source: true })

export async function postAdminInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const input = adminCreateInputSchema.parse(req.body)
    const { interview } = await createInterview({ ...input, source: 'admin' })
    res.status(201).json({ interview: toAdminJson(interview) })
  } catch (error) {
    next(error)
  }
}

const patchInterviewSchema = z.object({
  newStart: z.coerce.date(),
  newDurationMinutes: z.number().int().positive().max(24 * 60).optional(),
})

export async function patchAdminInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const { newStart, newDurationMinutes } = patchInterviewSchema.parse(req.body)
    const updated = await rescheduleInterview(requireIdParam(req.params.id), newStart, newDurationMinutes)
    res.status(200).json({ interview: toAdminJson(updated) })
  } catch (error) {
    next(error)
  }
}

export async function deleteAdminInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const cancelled = await cancelInterview(requireIdParam(req.params.id))
    res.status(200).json({ interview: toAdminJson(cancelled) })
  } catch (error) {
    next(error)
  }
}
