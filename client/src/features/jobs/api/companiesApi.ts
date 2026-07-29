import { apiGet } from '@/lib/apiClient'
import type { PublicCompany, PublicJobSummary } from '@/features/jobs/api/jobsApi'

export function fetchCompanyProfile(id: string): Promise<{ company: PublicCompany; jobs: PublicJobSummary[] }> {
  return apiGet(`/companies/${id}`)
}
