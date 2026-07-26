import type { NextFunction, Request, Response } from 'express'
import { dateRangeQuerySchema } from '../validators/calendar.validators.js'
import { getPublicCalendarView } from '../services/calendarView.service.js'

export async function getCalendarView(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = dateRangeQuerySchema.parse(req.query)
    const view = await getPublicCalendarView(from, to)
    res.status(200).json(view)
  } catch (error) {
    next(error)
  }
}
