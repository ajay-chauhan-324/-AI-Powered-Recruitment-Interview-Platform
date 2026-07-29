import type { NextFunction, Request, Response } from 'express'
import { jobInputSchema, updateJobInputSchema } from '../../validators/job.validators.js'
import {
  closeJob,
  createJob,
  duplicateJob,
  getJobForRecruiter,
  listJobsForRecruiter,
  pauseJob,
  publishJob,
  updateJob,
} from '../../services/job.service.js'
import { AppError } from '../../middleware/errorHandler.js'
import type { JobDocument } from '../../models/Job.model.js'

function toJson(job: JobDocument) {
  return {
    id: job._id.toString(),
    companyId: job.companyId.toString(),
    title: job.title,
    slug: job.slug,
    description: job.description,
    responsibilities: job.responsibilities,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    location: job.location,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency,
    experienceLevel: job.experienceLevel,
    minExperienceYears: job.minExperienceYears,
    requiredSkills: job.requiredSkills,
    preferredSkills: job.preferredSkills,
    educationRequirement: job.educationRequirement,
    screeningQuestions: job.screeningQuestions,
    pipeline: job.pipeline,
    atsThreshold: job.atsThreshold,
    status: job.status,
    publishedAt: job.publishedAt,
    closingDate: job.closingDate,
    createdAt: job.createdAt,
  }
}

function requireStringParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new AppError('NOT_FOUND', 'Job not found.', 404)
  return value
}

export async function getRecruiterJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const jobs = await listJobsForRecruiter(req.recruiter!.userId)
    res.status(200).json({ jobs: jobs.map(toJson) })
  } catch (error) {
    next(error)
  }
}

export async function getRecruiterJob(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await getJobForRecruiter(req.recruiter!.userId, requireStringParam(req.params.id))
    res.status(200).json({ job: toJson(job) })
  } catch (error) {
    next(error)
  }
}

export async function postRecruiterJob(req: Request, res: Response, next: NextFunction) {
  try {
    const input = jobInputSchema.parse(req.body)
    const job = await createJob(req.recruiter!.userId, req.recruiter!.companyId, input)
    res.status(201).json({ job: toJson(job) })
  } catch (error) {
    next(error)
  }
}

export async function patchRecruiterJob(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateJobInputSchema.parse(req.body)
    const job = await updateJob(req.recruiter!.userId, requireStringParam(req.params.id), input)
    res.status(200).json({ job: toJson(job) })
  } catch (error) {
    next(error)
  }
}

export async function postRecruiterJobPublish(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await publishJob(req.recruiter!.userId, requireStringParam(req.params.id))
    res.status(200).json({ job: toJson(job) })
  } catch (error) {
    next(error)
  }
}

export async function postRecruiterJobPause(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await pauseJob(req.recruiter!.userId, requireStringParam(req.params.id))
    res.status(200).json({ job: toJson(job) })
  } catch (error) {
    next(error)
  }
}

export async function postRecruiterJobClose(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await closeJob(req.recruiter!.userId, requireStringParam(req.params.id))
    res.status(200).json({ job: toJson(job) })
  } catch (error) {
    next(error)
  }
}

export async function postRecruiterJobDuplicate(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await duplicateJob(req.recruiter!.userId, requireStringParam(req.params.id))
    res.status(201).json({ job: toJson(job) })
  } catch (error) {
    next(error)
  }
}
