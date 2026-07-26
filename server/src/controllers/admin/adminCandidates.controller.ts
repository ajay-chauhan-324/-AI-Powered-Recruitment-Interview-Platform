import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { listCandidates, listInterviewsForCandidate } from '../../services/interview.service.js'
import type { InterviewDocument } from '../../models/Interview.model.js'

const searchQuerySchema = z.object({ search: z.string().trim().max(200).optional() })

export async function getAdminCandidates(req: Request, res: Response, next: NextFunction) {
  try {
    const { search } = searchQuerySchema.parse(req.query)
    const candidates = await listCandidates(search)
    res.status(200).json({ candidates })
  } catch (error) {
    next(error)
  }
}

function toAdminJson(interview: InterviewDocument) {
  return {
    id: interview._id.toString(),
    title: interview.title,
    interviewType: interview.interviewType,
    round: interview.round,
    status: interview.status,
    startAt: interview.startAt,
    endAt: interview.endAt,
    source: interview.source,
  }
}

const emailParamSchema = z.email()

export async function getAdminCandidateInterviews(req: Request, res: Response, next: NextFunction) {
  try {
    const email = emailParamSchema.parse(req.params.email)
    const interviews = await listInterviewsForCandidate(email)
    res.status(200).json({ interviews: interviews.map(toAdminJson) })
  } catch (error) {
    next(error)
  }
}
