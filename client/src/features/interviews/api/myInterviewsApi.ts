import { apiDelete, apiGet, apiPatch } from '@/lib/apiClient'
import type { OwnerInterview } from '@/features/booking/api/bookingApi'

export function fetchMyInterviews(): Promise<{ interviews: OwnerInterview[] }> {
  return apiGet('/my/interviews')
}

export function fetchMyInterview(id: string): Promise<{ interview: OwnerInterview }> {
  return apiGet(`/my/interviews/${id}`)
}

export function rescheduleMyInterview(id: string, newStart: string): Promise<{ interview: OwnerInterview }> {
  return apiPatch(`/my/interviews/${id}`, { newStart })
}

export function cancelMyInterview(id: string): Promise<{ interview: OwnerInterview }> {
  return apiDelete(`/my/interviews/${id}`)
}
