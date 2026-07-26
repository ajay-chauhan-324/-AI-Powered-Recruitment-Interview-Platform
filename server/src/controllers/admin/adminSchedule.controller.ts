import type { NextFunction, Request, Response } from 'express'
import { getScheduleConfig, upsertScheduleConfig } from '../../services/scheduleConfig.service.js'
import { scheduleConfigInputSchema } from '../../validators/schedule.validators.js'

export async function getAdminSchedule(_req: Request, res: Response, next: NextFunction) {
  try {
    const config = await getScheduleConfig()
    res.status(200).json({
      schedule: config
        ? { timezone: config.timezone, workingHours: config.workingHours, breaks: config.breaks }
        : null,
    })
  } catch (error) {
    next(error)
  }
}

export async function putAdminSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const input = scheduleConfigInputSchema.parse(req.body)
    const config = await upsertScheduleConfig(input)
    res.status(200).json({
      schedule: { timezone: config.timezone, workingHours: config.workingHours, breaks: config.breaks },
    })
  } catch (error) {
    next(error)
  }
}
