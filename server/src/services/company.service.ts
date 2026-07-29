import { isValidObjectId } from 'mongoose'
import { CompanyModel, type CompanyDocument } from '../models/Company.model.js'

export async function createCompany(recruiterId: string, name: string): Promise<CompanyDocument> {
  return CompanyModel.create({ recruiterId, name })
}

export async function getCompanyByRecruiterId(recruiterId: string): Promise<CompanyDocument | null> {
  return CompanyModel.findOne({ recruiterId })
}

export async function getCompanyById(companyId: string): Promise<CompanyDocument | null> {
  if (!isValidObjectId(companyId)) return null
  return CompanyModel.findById(companyId)
}

export interface UpdateCompanyInput {
  name?: string
  logoUrl?: string
  website?: string
  description?: string
  industry?: string
  size?: string
  location?: string
  linkedIn?: string
  foundedYear?: number
  benefits?: string[]
  culture?: string
  techStack?: string[]
}

export async function updateCompanyForRecruiter(recruiterId: string, input: UpdateCompanyInput): Promise<CompanyDocument> {
  const company = await getCompanyByRecruiterId(recruiterId)
  if (!company) throw new Error('Company not found for this recruiter.')
  Object.assign(company, input)
  await company.save()
  return company
}
