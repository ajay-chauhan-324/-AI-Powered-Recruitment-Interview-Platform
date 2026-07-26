import type { NextFunction, Request, Response } from 'express'
import { DateTime } from 'luxon'
import { getDashboardStats } from '../../services/interview.service.js'
import { getScheduleConfig } from '../../services/scheduleConfig.service.js'
import type { InterviewDocument } from '../../models/Interview.model.js'

function toSummaryJson(interview: InterviewDocument) {
  return {
    id: interview._id.toString(),
    title: interview.title,
    interviewType: interview.interviewType,
    round: interview.round,
    candidateName: interview.candidateName,
    interviewerName: interview.interviewerName,
    startAt: interview.startAt,
    endAt: interview.endAt,
    status: interview.status,
  }
}

export async function getAdminDashboard(_req: Request, res: Response, next: NextFunction) {
  try {
    const config = await getScheduleConfig()
    const zone = config?.timezone ?? 'UTC'
    const now = new Date()
    const nowInZone = DateTime.fromJSDate(now, { zone })
    const todayStart = nowInZone.startOf('day').toJSDate()
    const todayEnd = nowInZone.endOf('day').toJSDate()

    const stats = await getDashboardStats(now, todayStart, todayEnd)
    res.status(200).json({
      todayCount: stats.todayCount,
      upcomingCount: stats.upcomingCount,
      totalScheduled: stats.totalScheduled,
      cancelledCount: stats.cancelledCount,
      rescheduledCount: stats.rescheduledCount,
      upcomingInterviews: stats.upcomingInterviews.map(toSummaryJson),
      scheduleConfigured: config !== null,
    })
  } catch (error) {
    next(error)
  }
}
