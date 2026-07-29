import type { NextFunction, Request, Response } from 'express'
import {
  applicationRoundAvailabilityQuerySchema,
  createApplicationInputSchema,
  scheduleApplicationInterviewInputSchema,
} from '../validators/application.validators.js'
import {
  createApplication,
  getApplicationForCandidate,
  getApplicationRoundAvailability,
  listApplicationsForCandidate,
  scheduleApplicationInterview,
} from '../services/application.service.js'
import { AppError } from '../middleware/errorHandler.js'
import type { ApplicationDocument } from '../models/Application.model.js'
import type { JobDocument } from '../models/Job.model.js'

function requireStringParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new AppError('NOT_FOUND', 'Application not found.', 404)
  return value
}

/** jobId is populated (see application.service.ts's .populate calls) — a plain ObjectId
 * means population didn't happen for some reason, in which case we fall back to just the id.
 * companyId is itself nested-populated to a { name } document via the same call, so it may
 * be either a populated Company doc or a raw ObjectId depending on how this function is
 * reached — every caller here goes through the nested-populate path, but this stays
 * defensive rather than assuming population always succeeded. */
function companyName(company: unknown): string {
  if (company && typeof company === 'object' && 'name' in company) {
    return String((company as { name: unknown }).name)
  }
  return ''
}

function jobSummary(job: unknown) {
  if (job && typeof job === 'object' && 'title' in job) {
    const populated = job as JobDocument
    const rawCompanyId: unknown = populated.companyId
    const companyIdString =
      rawCompanyId && typeof rawCompanyId === 'object' && '_id' in rawCompanyId
        ? String((rawCompanyId as { _id: unknown })._id)
        : String(rawCompanyId)
    return {
      id: populated._id.toString(),
      title: populated.title,
      companyId: companyIdString,
      companyName: companyName(populated.companyId),
      location: populated.location,
      employmentType: populated.employmentType,
      workplaceType: populated.workplaceType,
    }
  }
  return { id: String(job), title: '', companyId: '', companyName: '', location: '', employmentType: '', workplaceType: '' }
}

// ATS analysis is a recruiter-only tool (CLAUDE.md's recruitment pivot: it's still computed
// at apply-time — see application.service.ts's createApplication — and returned in full to the
// owning recruiter via recruiterApplications.controller.ts, but deliberately never included
// here. A candidate never sees their own AI match score, only that they applied.
function toCandidateJson(application: ApplicationDocument) {
  return {
    id: application._id.toString(),
    job: jobSummary(application.jobId),
    resumeId: application.resumeId.toString(),
    status: application.status,
    rounds: application.rounds.map((round) => ({
      order: round.order,
      type: round.type,
      title: round.title,
      durationMinutes: round.durationMinutes,
      instructions: round.instructions,
      status: round.status,
      locationType: round.locationType,
      meetingUrl: round.meetingUrl,
      address: round.address,
      interviewerName: round.interviewerName,
      interviewId: round.interviewId ? round.interviewId.toString() : null,
    })),
    createdAt: application.createdAt,
  }
}

export async function postApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId, resumeId } = createApplicationInputSchema.parse(req.body)
    const application = await createApplication(req.user!.userId, jobId, resumeId)
    await application.populate({ path: 'jobId', select: 'title companyId location employmentType workplaceType' })
    res.status(201).json({ application: toCandidateJson(application) })
  } catch (error) {
    next(error)
  }
}

export async function getMyApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const applications = await listApplicationsForCandidate(req.user!.userId)
    res.status(200).json({ applications: applications.map(toCandidateJson) })
  } catch (error) {
    next(error)
  }
}

export async function getMyApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const application = await getApplicationForCandidate(req.user!.userId, requireStringParam(req.params.id))
    res.status(200).json({ application: toCandidateJson(application) })
  } catch (error) {
    next(error)
  }
}

/** Real, live slots on the owning recruiter's own calendar for whichever round is currently
 * ready to book — powers the candidate-facing Interview Scheduler dialog. Returns the
 * recruiter's effective timezone too, so the client never has to assume one. */
export async function getScheduleApplicationAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = applicationRoundAvailabilityQuerySchema.parse(req.query)
    const { slots, timezone, durationMinutes } = await getApplicationRoundAvailability(
      req.user!.userId,
      requireStringParam(req.params.id),
      from,
      to,
    )
    res.status(200).json({ slots, timezone, durationMinutes })
  } catch (error) {
    next(error)
  }
}

export async function postScheduleApplicationInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const { startAt, timezone } = scheduleApplicationInterviewInputSchema.parse(req.body)
    const { application, manageToken } = await scheduleApplicationInterview(
      req.user!.userId,
      requireStringParam(req.params.id),
      startAt,
      timezone,
    )
    res.status(200).json({ application: toCandidateJson(application), manageToken })
  } catch (error) {
    next(error)
  }
}
