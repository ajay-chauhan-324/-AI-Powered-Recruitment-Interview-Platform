import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import {
  recruiterNotesInputSchema,
  roundOutcomeInputSchema,
  updateApplicationStatusInputSchema,
} from '../../validators/application.validators.js'
import {
  addRecruiterNotes,
  getApplicationForRecruiter,
  getApplicationResumeForRecruiter,
  listApplicationsForJob,
  listApplicationsForRecruiter,
  recordRoundOutcome,
  updateApplicationStatus,
} from '../../services/application.service.js'
import { readResumeFile } from '../../services/resume.service.js'
import { mimeTypeForAvatarKey, readAvatarFile } from '../../services/avatar.service.js'
import { AppError } from '../../middleware/errorHandler.js'
import type { ApplicationDocument } from '../../models/Application.model.js'
import type { UserDocument } from '../../models/User.model.js'

function requireStringParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new AppError('NOT_FOUND', 'Application not found.', 404)
  return value
}

/** photoUrl is keyed by the APPLICATION id, not the candidate id — recruiter access to a
 * candidate's photo flows through the same application-ownership check as the resume
 * download (getApplicationCandidatePhoto below), never a bare candidate/user id. */
function candidateSummary(candidate: unknown, applicationId: string) {
  if (candidate && typeof candidate === 'object' && 'name' in candidate) {
    const populated = candidate as UserDocument
    return {
      id: populated._id.toString(),
      name: populated.name,
      email: populated.email,
      headline: populated.headline,
      about: populated.about ?? '',
      location: populated.location,
      skills: populated.skills,
      experienceLevel: populated.experienceLevel ?? null,
      linkedIn: populated.linkedIn ?? '',
      github: populated.github ?? '',
      portfolioUrl: populated.portfolioUrl ?? '',
      photoUrl: populated.photoKey ? `/api/v1/recruiter/applications/${applicationId}/photo` : '',
      education: populated.education ?? [],
      experience: populated.experience ?? [],
      projects: populated.projects ?? [],
    }
  }
  return null
}

/** application.resumeId may be a populated document (listApplicationsForJob) or a raw
 * ObjectId (everything else) — calling .toString() on a populated Mongoose document
 * returns its debug inspection string, not a hex id, so the two cases must be handled
 * separately rather than assuming a bare ObjectId. */
function resumeIdString(resume: unknown): string {
  if (resume && typeof resume === 'object' && '_id' in resume) {
    return String((resume as { _id: unknown })._id)
  }
  return String(resume)
}

/** Same reasoning as resumeIdString above — application.jobId is a populated document when
 * this runs against listApplicationsForRecruiter's results (getAllRecruiterApplications
 * below), but a raw ObjectId everywhere else toJson is used. */
function jobIdString(job: unknown): string {
  if (job && typeof job === 'object' && '_id' in job) {
    return String((job as { _id: unknown })._id)
  }
  return String(job)
}

function toJson(application: ApplicationDocument) {
  return {
    id: application._id.toString(),
    jobId: jobIdString(application.jobId),
    candidate: candidateSummary(application.candidateId, application._id.toString()),
    resumeId: resumeIdString(application.resumeId),
    status: application.status,
    atsAnalysis: application.atsAnalysis,
    recruiterNotes: application.recruiterNotes,
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
      interviewerEmail: round.interviewerEmail,
      interviewId: round.interviewId ? round.interviewId.toString() : null,
    })),
    createdAt: application.createdAt,
  }
}

export async function getJobApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const applications = await listApplicationsForJob(req.recruiter!.userId, requireStringParam(req.params.jobId))
    res.status(200).json({ applications: applications.map(toJson) })
  } catch (error) {
    next(error)
  }
}

/** Every application across every one of the recruiter's active jobs, in one request —
 * reuses listApplicationsForRecruiter (already built for the recruiter AI's cross-job
 * ranking questions) instead of the client fanning out one /recruiter/jobs/:id/applications
 * call per job, which is what the dashboard/candidates/AI-insight pages used to do. */
export async function getAllRecruiterApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const applications = await listApplicationsForRecruiter(req.recruiter!.userId)
    res.status(200).json({
      applications: applications.map((application) => {
        const job = application.jobId as unknown as { title?: string } | null
        return { ...toJson(application), jobTitle: job?.title ?? '' }
      }),
    })
  } catch (error) {
    next(error)
  }
}

export async function getRecruiterApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const application = await getApplicationForRecruiter(req.recruiter!.userId, requireStringParam(req.params.id))
    res.status(200).json({ application: toJson(application) })
  } catch (error) {
    next(error)
  }
}

export async function patchApplicationStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateApplicationStatusInputSchema.parse(req.body)
    const application = await updateApplicationStatus(req.recruiter!.userId, requireStringParam(req.params.id), status)
    res.status(200).json({ application: toJson(application) })
  } catch (error) {
    next(error)
  }
}

export async function patchApplicationNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const { notes } = recruiterNotesInputSchema.parse(req.body)
    const application = await addRecruiterNotes(req.recruiter!.userId, requireStringParam(req.params.id), notes)
    res.status(200).json({ application: toJson(application) })
  } catch (error) {
    next(error)
  }
}

function requireOrderParam(value: string | string[] | undefined): number {
  const parsed = z.coerce.number().int().positive().safeParse(value)
  if (!parsed.success) throw new AppError('NOT_FOUND', 'Interview round not found.', 404)
  return parsed.data
}

export async function postRoundOutcome(req: Request, res: Response, next: NextFunction) {
  try {
    const { outcome } = roundOutcomeInputSchema.parse(req.body)
    const application = await recordRoundOutcome(
      req.recruiter!.userId,
      requireStringParam(req.params.id),
      requireOrderParam(req.params.order),
      outcome,
    )
    res.status(200).json({ application: toJson(application) })
  } catch (error) {
    next(error)
  }
}

export async function getApplicationResumeFile(req: Request, res: Response, next: NextFunction) {
  try {
    const resume = await getApplicationResumeForRecruiter(req.recruiter!.userId, requireStringParam(req.params.id))
    const buffer = await readResumeFile(resume.storageKey)
    res.setHeader('Content-Type', resume.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(resume.fileName)}"`)
    res.status(200).send(buffer)
  } catch (error) {
    next(error)
  }
}

/** Ownership flows through the application (same as the resume download above), never a bare
 * candidate/user id — a recruiter can only ever see the photo of a candidate who applied to
 * one of their own jobs. */
export async function getApplicationCandidatePhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const application = await getApplicationForRecruiter(req.recruiter!.userId, requireStringParam(req.params.id))
    const candidate = application.candidateId as unknown as { photoKey?: string } | null
    if (!candidate?.photoKey) throw new AppError('NOT_FOUND', 'No photo uploaded.', 404)
    const buffer = await readAvatarFile(candidate.photoKey)
    res.setHeader('Content-Type', mimeTypeForAvatarKey(candidate.photoKey))
    res.status(200).send(buffer)
  } catch (error) {
    next(error)
  }
}
