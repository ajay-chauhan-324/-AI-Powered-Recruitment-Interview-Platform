import type { NextFunction, Request, Response } from 'express'
import { getScheduleConfigForRecruiter, upsertScheduleConfigForRecruiter } from '../../services/scheduleConfig.service.js'
import { recruiterScheduleConfigInputSchema } from '../../validators/schedule.validators.js'

function toJson(config: Awaited<ReturnType<typeof getScheduleConfigForRecruiter>>) {
  return {
    timezone: config.timezone,
    workingHours: config.workingHours,
    breaks: config.breaks,
    bufferMinutes: config.bufferMinutes,
    minNoticeMinutes: config.minNoticeMinutes,
    maxBookingWindowDays: config.maxBookingWindowDays,
  }
}

export async function getRecruiterSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await getScheduleConfigForRecruiter(req.recruiter!.userId)
    res.status(200).json({ schedule: toJson(config) })
  } catch (error) {
    next(error)
  }
}

export async function putRecruiterSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const input = recruiterScheduleConfigInputSchema.parse(req.body)
    const config = await upsertScheduleConfigForRecruiter(req.recruiter!.userId, input)
    res.status(200).json({ schedule: toJson(config) })
  } catch (error) {
    next(error)
  }
}
