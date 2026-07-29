import { apiGet } from '@/lib/apiClient'
import type { InterviewType } from '@/features/booking/api/bookingApi'

export type MeetingParticipantRole = 'candidate' | 'recruiter'
export type MeetingStatus = 'not_started' | 'waiting' | 'in_progress' | 'ended'

export interface MeetingInfo {
  interviewId: string
  meetingId: string
  title: string
  interviewType: InterviewType
  round: number
  candidateName: string
  interviewerName: string
  startAt: string
  endAt: string
  timezone: string
  interviewStatus: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  meetingStatus: MeetingStatus
  yourRole: MeetingParticipantRole
}

/** Reachable by either role (candidate or recruiter) — see meetings.controller.ts, which tries
 * both ownership checks rather than assuming one. */
export function fetchMeeting(meetingId: string): Promise<{ meeting: MeetingInfo }> {
  return apiGet(`/meetings/${meetingId}`)
}
