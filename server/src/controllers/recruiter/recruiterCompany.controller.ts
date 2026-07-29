import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { getCompanyByRecruiterId, updateCompanyForRecruiter } from '../../services/company.service.js'
import { AppError } from '../../middleware/errorHandler.js'
import type { CompanyDocument } from '../../models/Company.model.js'

const updateCompanyInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  logoUrl: z.url().optional().or(z.literal('')),
  website: z.url().optional().or(z.literal('')),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  industry: z.string().trim().max(200).optional().or(z.literal('')),
  size: z.string().trim().max(50).optional().or(z.literal('')),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  linkedIn: z.url().optional().or(z.literal('')),
  foundedYear: z.number().int().min(1800).max(2100).optional(),
  benefits: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  culture: z.string().trim().max(2000).optional().or(z.literal('')),
  techStack: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
})

function toJson(company: CompanyDocument) {
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

export async function getRecruiterCompany(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await getCompanyByRecruiterId(req.recruiter!.userId)
    if (!company) throw new AppError('NOT_FOUND', 'Company not found.', 404)
    res.status(200).json({ company: toJson(company) })
  } catch (error) {
    next(error)
  }
}

export async function patchRecruiterCompany(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateCompanyInputSchema.parse(req.body)
    const company = await updateCompanyForRecruiter(req.recruiter!.userId, input)
    res.status(200).json({ company: toJson(company) })
  } catch (error) {
    next(error)
  }
}
