import type { NextFunction, Request, Response } from 'express'
import { publicJobQuerySchema } from '../validators/job.validators.js'
import { getPublishedJobBySlugOrId, listPublicJobs } from '../services/job.service.js'
import { getCompanyById } from '../services/company.service.js'
import { countApplicationsByJob } from '../services/application.service.js'
import { AppError } from '../middleware/errorHandler.js'
import type { JobDocument } from '../models/Job.model.js'

/** The public-safe job shape — no recruiterId, no draft-only internals a candidate has no
 * business seeing. `applicantCount` is a bare number (see application.service.ts's
 * countApplicationsByJob) — it reveals nothing about who applied. */
function toPublicListJson(job: JobDocument, applicantCount: number) {
  return {
    id: job._id.toString(),
    slug: job.slug,
    title: job.title,
    companyId: job.companyId.toString(),
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    location: job.location,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency,
    experienceLevel: job.experienceLevel,
    requiredSkills: job.requiredSkills,
    publishedAt: job.publishedAt,
    applicantCount,
  }
}

function toPublicDetailJson(job: JobDocument, applicantCount: number) {
  return {
    ...toPublicListJson(job, applicantCount),
    description: job.description,
    responsibilities: job.responsibilities,
    preferredSkills: job.preferredSkills,
    minExperienceYears: job.minExperienceYears,
    educationRequirement: job.educationRequirement,
    screeningQuestions: job.screeningQuestions,
    closingDate: job.closingDate,
  }
}

export async function getJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const query = publicJobQuerySchema.parse(req.query)
    const { jobs, total } = await listPublicJobs(query)
    const counts = await countApplicationsByJob(jobs.map((job) => job._id.toString()))
    res.status(200).json({
      jobs: jobs.map((job) => toPublicListJson(job, counts.get(job._id.toString()) ?? 0)),
      total,
      page: query.page,
      limit: query.limit,
    })
  } catch (error) {
    next(error)
  }
}

export async function getJobDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const idOrSlug = req.params.idOrSlug
    if (typeof idOrSlug !== 'string' || idOrSlug.length === 0) {
      throw new AppError('NOT_FOUND', 'Job not found.', 404)
    }
    const job = await getPublishedJobBySlugOrId(idOrSlug)
    if (!job) throw new AppError('NOT_FOUND', 'Job not found.', 404)
    const [company, counts] = await Promise.all([
      getCompanyById(job.companyId.toString()),
      countApplicationsByJob([job._id.toString()]),
    ])
    res.status(200).json({
      job: toPublicDetailJson(job, counts.get(job._id.toString()) ?? 0),
      company: company
        ? {
            id: company._id.toString(),
            name: company.name,
            logoUrl: company.logoUrl,
            website: company.website,
            description: company.description,
            industry: company.industry,
            size: company.size,
            location: company.location,
            linkedIn: company.linkedIn,
            foundedYear: company.foundedYear ?? null,
            benefits: company.benefits,
            culture: company.culture,
            techStack: company.techStack,
          }
        : null,
    })
  } catch (error) {
    next(error)
  }
}
