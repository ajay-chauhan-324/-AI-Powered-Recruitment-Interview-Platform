import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/apiClient'

export interface PublicAppointment {
  id: string
  startAt: string
  endAt: string
  status: 'pending' | 'confirmed' | 'cancelled'
}

export interface OwnerAppointment extends PublicAppointment {
  name: string
  email: string
  purpose: string
  durationMinutes: number
  timezone: string
}

export interface CreateAppointmentInput {
  name: string
  email: string
  purpose: string
  startAt: string
  durationMinutes: number
  timezone: string
}

export interface AvailableSlot {
  start: string
  end: string
}

export function createAppointment(
  input: CreateAppointmentInput,
): Promise<{ appointment: PublicAppointment; manageToken: string }> {
  return apiPost('/appointments', input)
}

export function fetchAppointmentByToken(token: string): Promise<{ appointment: OwnerAppointment }> {
  return apiGet(`/appointments/manage/${token}`)
}

export function rescheduleAppointmentByToken(
  token: string,
  newStart: string,
): Promise<{ appointment: OwnerAppointment }> {
  return apiPatch(`/appointments/manage/${token}`, { newStart })
}

export function cancelAppointmentByToken(token: string): Promise<{ appointment: OwnerAppointment }> {
  return apiDelete(`/appointments/manage/${token}`)
}

export function fetchAvailability(from: Date, to: Date, durationMinutes: number): Promise<{ slots: AvailableSlot[] }> {
  return apiGet('/availability', {
    from: from.toISOString(),
    to: to.toISOString(),
    durationMinutes: String(durationMinutes),
  })
}
