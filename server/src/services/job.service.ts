import crypto from 'node:crypto'
import { isValidObjectId } from 'mongoose'
import { JobModel, type JobDocument } from '../models/Job.model.js'
import { AppError } from '../middleware/errorHandler.js'
import type { z } from 'zod'
import type { jobInputSchema, publicJobQuerySchema } from '../validators/job.validators.js'

export type JobInput = z.infer<typeof jobInputSchema>
export type PublicJobQuery = z.infer<typeof publicJobQuerySchema>

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${base || 'job'}-${crypto.randomBytes(3).toString('hex')}`
}

export async function createJob(recruiterId: string, companyId: string, input: JobInput): Promise<JobDocument> {
  return JobModel.create({
    ...input,
    companyId,
    recruiterId,
    slug: slugify(input.title),
    status: 'draft',
  })
}

async function getJobOwnedByRecruiterOrThrow(recruiterId: string, jobId: string): Promise<JobDocument> {
  if (!isValidObjectId(jobId)) throw new AppError('NOT_FOUND', 'Job not found.', 404)
  const job = await JobModel.findOne({ _id: jobId, recruiterId })
  if (!job) throw new AppError('NOT_FOUND', 'Job not found.', 404)
  return job
}

export async function getJobForRecruiter(recruiterId: string, jobId: string): Promise<JobDocument> {
  return getJobOwnedByRecruiterOrThrow(recruiterId, jobId)
}

export async function listJobsForRecruiter(recruiterId: string): Promise<JobDocument[]> {
  return JobModel.find({ recruiterId }).sort({ createdAt: -1 })
}

export async function updateJob(recruiterId: string, jobId: string, input: Partial<JobInput>): Promise<JobDocument> {
  const job = await getJobOwnedByRecruiterOrThrow(recruiterId, jobId)
  Object.assign(job, input)
  await job.save()
  return job
}

export async function publishJob(recruiterId: string, jobId: string): Promise<JobDocument> {
  const job = await getJobOwnedByRecruiterOrThrow(recruiterId, jobId)
  if (job.pipeline.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Define at least one interview round before publishing this job.', 400)
  }
  job.status = 'published'
  job.publishedAt = job.publishedAt ?? new Date()
  await job.save()
  return job
}

export async function pauseJob(recruiterId: string, jobId: string): Promise<JobDocument> {
  const job = await getJobOwnedByRecruiterOrThrow(recruiterId, jobId)
  job.status = 'paused'
  await job.save()
  return job
}

export async function closeJob(recruiterId: string, jobId: string): Promise<JobDocument> {
  const job = await getJobOwnedByRecruiterOrThrow(recruiterId, jobId)
  job.status = 'closed'
  await job.save()
  return job
}

export async function duplicateJob(recruiterId: string, jobId: string): Promise<JobDocument> {
  const job = await getJobOwnedByRecruiterOrThrow(recruiterId, jobId)
  const copy = job.toObject()
  delete (copy as { _id?: unknown })._id
  return JobModel.create({
    ...copy,
    title: `${job.title} (Copy)`,
    slug: slugify(`${job.title}-copy`),
    status: 'draft',
    publishedAt: null,
  })
}

const MAX_PUBLIC_PAGE_SIZE = 50

export async function listPublicJobs(
  query: PublicJobQuery,
  companyId?: string,
): Promise<{ jobs: JobDocument[]; total: number }> {
  const match: Record<string, unknown> = {
    status: 'published',
    $or: [{ closingDate: null }, { closingDate: { $gt: new Date() } }],
  }
  if (companyId) match.companyId = companyId
  if (query.employmentType) match.employmentType = query.employmentType
  if (query.workplaceType) match.workplaceType = query.workplaceType
  if (query.experienceLevel) match.experienceLevel = query.experienceLevel
  if (query.location) match.location = { $regex: query.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  if (query.search) {
    const pattern = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    match.$and = [
      {
        $or: [
          { title: { $regex: pattern, $options: 'i' } },
          { requiredSkills: { $regex: pattern, $options: 'i' } },
          { preferredSkills: { $regex: pattern, $options: 'i' } },
        ],
      },
    ]
  }

  const limit = Math.min(query.limit, MAX_PUBLIC_PAGE_SIZE)
  const skip = (query.page - 1) * limit

  const [jobs, total] = await Promise.all([
    JobModel.find(match).sort({ publishedAt: -1 }).skip(skip).limit(limit),
    JobModel.countDocuments(match),
  ])

  return { jobs, total }
}

export async function getPublishedJobBySlugOrId(idOrSlug: string): Promise<JobDocument | null> {
  const byId = isValidObjectId(idOrSlug) ? await JobModel.findOne({ _id: idOrSlug, status: 'published' }) : null
  if (byId) return byId
  return JobModel.findOne({ slug: idOrSlug, status: 'published' })
}

export async function getJobById(jobId: string): Promise<JobDocument | null> {
  if (!isValidObjectId(jobId)) return null
  return JobModel.findById(jobId)
}
