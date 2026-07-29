import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/apiClient'

export interface ResumeSummary {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  isDefault: boolean
  createdAt: string
}

export function fetchResumes(): Promise<{ resumes: ResumeSummary[] }> {
  return apiGet('/resumes')
}

export function uploadResume(file: File): Promise<{ resume: ResumeSummary }> {
  const formData = new FormData()
  formData.append('resume', file)
  return apiPost('/resumes', formData)
}

export function setDefaultResume(id: string): Promise<{ resume: ResumeSummary }> {
  return apiPatch(`/resumes/${id}/default`, undefined)
}

export function deleteResume(id: string): Promise<{ ok: boolean }> {
  return apiDelete(`/resumes/${id}`)
}

export function resumeDownloadUrl(id: string): string {
  return `/api/v1/resumes/${id}/file`
}
