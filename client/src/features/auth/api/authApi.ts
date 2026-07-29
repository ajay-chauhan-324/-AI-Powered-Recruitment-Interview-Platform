import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/apiClient'

export type AccountType = 'candidate' | 'recruiter'
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'executive'

export interface ExperienceEntry {
  title: string
  company: string
  startDate?: string
  endDate?: string
  description?: string
}

export interface EducationEntry {
  institution: string
  degree?: string
  fieldOfStudy?: string
  endYear?: number
}

export interface ProjectEntry {
  title: string
  description?: string
  url?: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
  timezone: string
  accountType: AccountType
  companyId: string | null
  phone: string
  linkedIn: string
  github: string
  portfolioUrl: string
  photoUrl: string
  headline: string
  about: string
  location: string
  skills: string[]
  experienceLevel: ExperienceLevel | null
  experience: ExperienceEntry[]
  education: EducationEntry[]
  projects: ProjectEntry[]
}

export interface RegisterInput {
  name: string
  email: string
  password: string
  timezone: string
  accountType?: AccountType
  companyName?: string
}

export function registerUser(input: RegisterInput): Promise<{ user: AuthUser }> {
  return apiPost('/auth/register', input)
}

export function loginUser(email: string, password: string): Promise<{ user: AuthUser }> {
  return apiPost('/auth/login', { email, password })
}

export function logoutUser(): Promise<{ ok: boolean }> {
  return apiPost('/auth/logout')
}

export function fetchMe(): Promise<{ user: AuthUser }> {
  return apiGet('/auth/me')
}

export interface UpdateProfileInput {
  name?: string
  timezone?: string
  phone?: string
  linkedIn?: string
  github?: string
  portfolioUrl?: string
  headline?: string
  about?: string
  location?: string
  skills?: string[]
  experienceLevel?: ExperienceLevel
  experience?: ExperienceEntry[]
  education?: EducationEntry[]
  projects?: ProjectEntry[]
}

export function updateProfile(input: UpdateProfileInput): Promise<{ user: AuthUser }> {
  return apiPatch('/auth/me', input)
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return apiPost('/auth/change-password', { currentPassword, newPassword })
}

export function uploadPhoto(file: File): Promise<{ ok: boolean }> {
  const formData = new FormData()
  formData.append('photo', file)
  return apiPost('/me/photo', formData)
}

export function deletePhoto(): Promise<{ ok: boolean }> {
  return apiDelete('/me/photo')
}
