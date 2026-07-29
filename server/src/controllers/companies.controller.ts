import type { NextFunction, Request, Response } from 'express'
import { getCompanyById } from '../services/company.service.js'
import { listPublicJobs } from '../services/job.service.js'
import { countApplicationsByJob } from '../services/application.service.js'
import { AppError } from '../middleware/errorHandler.js'
import type { CompanyDocument } from '../models/Company.model.js'
import type { JobDocument } from '../models/Job.model.js'

function toPublicCompanyJson(company: CompanyDocument) {
  return {
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
}

function toPublicJobSummary(job: JobDocument, applicantCount: number) {
  return {
    id: job._id.toString(),
    slug: job.slug,
    title: job.title,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    location: job.location,
    experienceLevel: job.experienceLevel,
    requiredSkills: job.requiredSkills,
    publishedAt: job.publishedAt,
    applicantCount,
  }
}

/** The public company profile (CLAUDE.md pivot: candidates can view a company's open jobs,
 * tech stack, and social links). No authentication required — same visibility rule as the
 * public job listing this reuses (listPublicJobs), just pre-filtered to one company. */
export async function getCompanyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.params.id
    if (typeof companyId !== 'string' || companyId.length === 0) {
      throw new AppError('NOT_FOUND', 'Company not found.', 404)
    }
    const company = await getCompanyById(companyId)
    if (!company) throw new AppError('NOT_FOUND', 'Company not found.', 404)

    const { jobs } = await listPublicJobs({ page: 1, limit: 50 }, company._id.toString())
    const counts = await countApplicationsByJob(jobs.map((job) => job._id.toString()))

    res.status(200).json({
      company: toPublicCompanyJson(company),
      jobs: jobs.map((job) => toPublicJobSummary(job, counts.get(job._id.toString()) ?? 0)),
    })
  } catch (error) {
    next(error)
  }
}
