import type { NextFunction, Request, Response } from 'express'
import {
  cancelInterview,
  getInterviewOwnedByRecruiter,
  listInterviewsForRecruiter,
  rescheduleInterview,
} from '../../services/interview.service.js'
import { rescheduleInterviewInputSchema } from '../../validators/interview.validators.js'
import { AppError } from '../../middleware/errorHandler.js'
import type { InterviewDocument } from '../../models/Interview.model.js'
import type { JobDocument } from '../../models/Job.model.js'

function requireStringParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new AppError('NOT_FOUND', 'Interview not found.', 404)
  return value
}

/** jobId is populated (see interview.service.ts's listInterviewsForRecruiter) with a nested
 * companyId populate — every interview reaching this endpoint was created through the
 * recruitment pipeline (application.service.ts's scheduleApplicationInterview), so jobId is
 * always present, never null, here. */
function jobSummary(job: unknown) {
  if (job && typeof job === 'object' && 'title' in job) {
    const populated = job as JobDocument
    const rawCompanyId: unknown = populated.companyId
    const companyName =
      rawCompanyId && typeof rawCompanyId === 'object' && 'name' in rawCompanyId
        ? String((rawCompanyId as { name: unknown }).name)
        : ''
    return { id: populated._id.toString(), title: populated.title, companyName }
  }
  return { id: String(job), title: '', companyName: '' }
}

function toJson(interview: InterviewDocument) {
  return {
    id: interview._id.toString(),
    job: jobSummary(interview.jobId),
    applicationId: interview.applicationId ? interview.applicationId.toString() : null,
    title: interview.title,
    interviewType: interview.interviewType,
    round: interview.round,
    locationType: interview.locationType,
    meetingType: interview.meetingType,
    meetingUrl: interview.meetingUrl,
    meeting: interview.meeting
      ? { status: interview.meeting.status, startedAt: interview.meeting.startedAt, endedAt: interview.meeting.endedAt }
      : null,
    address: interview.address,
    candidateName: interview.candidateName,
    candidateEmail: interview.candidateEmail,
    startAt: interview.startAt,
    endAt: interview.endAt,
    durationMinutes: interview.durationMinutes,
    timezone: interview.timezone,
    status: interview.status,
  }
}

export async function getRecruiterInterviews(req: Request, res: Response, next: NextFunction) {
  try {
    const interviews = await listInterviewsForRecruiter(req.recruiter!.userId)
    res.status(200).json({ interviews: interviews.map(toJson) })
  } catch (error) {
    next(error)
  }
}

export async function patchRecruiterInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const interviewId = requireStringParam(req.params.id)
    await getInterviewOwnedByRecruiter(req.recruiter!.userId, interviewId)
    const { newStart } = rescheduleInterviewInputSchema.parse(req.body)
    const updated = await rescheduleInterview(interviewId, newStart)
    res.status(200).json({ interview: toJson(updated) })
  } catch (error) {
    next(error)
  }
}

export async function deleteRecruiterInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const interviewId = requireStringParam(req.params.id)
    await getInterviewOwnedByRecruiter(req.recruiter!.userId, interviewId)
    const cancelled = await cancelInterview(interviewId)
    res.status(200).json({ interview: toJson(cancelled) })
  } catch (error) {
    next(error)
  }
}
