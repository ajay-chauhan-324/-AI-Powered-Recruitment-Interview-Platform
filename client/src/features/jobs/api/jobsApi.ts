import { apiGet } from '@/lib/apiClient'

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship'
export type WorkplaceType = 'remote' | 'hybrid' | 'onsite'
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'executive'

export interface PublicJobSummary {
  id: string
  slug: string
  title: string
  companyId: string
  employmentType: EmploymentType
  workplaceType: WorkplaceType
  location: string
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  experienceLevel: ExperienceLevel
  requiredSkills: string[]
  publishedAt: string
  applicantCount: number
}

export interface PublicJobDetail extends PublicJobSummary {
  description: string
  responsibilities: string[]
  preferredSkills: string[]
  minExperienceYears: number
  educationRequirement: string
  screeningQuestions: string[]
  closingDate: string | null
}

export interface PublicCompany {
  id: string
  name: string
  logoUrl: string
  website: string
  description: string
  industry: string
  size: string
  location: string
  linkedIn: string
  foundedYear: number | null
  benefits: string[]
  culture: string
  techStack: string[]
}

export interface JobSearchParams {
  search?: string
  employmentType?: EmploymentType
  workplaceType?: WorkplaceType
  experienceLevel?: ExperienceLevel
  location?: string
  page?: number
  limit?: number
}

export function fetchJobs(params: JobSearchParams = {}): Promise<{ jobs: PublicJobSummary[]; total: number; page: number; limit: number }> {
  const query: Record<string, string> = {}
  if (params.search) query.search = params.search
  if (params.employmentType) query.employmentType = params.employmentType
  if (params.workplaceType) query.workplaceType = params.workplaceType
  if (params.experienceLevel) query.experienceLevel = params.experienceLevel
  if (params.location) query.location = params.location
  if (params.page) query.page = String(params.page)
  if (params.limit) query.limit = String(params.limit)
  return apiGet('/jobs', query)
}

export function fetchJobDetail(idOrSlug: string): Promise<{ job: PublicJobDetail; company: PublicCompany | null }> {
  return apiGet(`/jobs/${idOrSlug}`)
}
