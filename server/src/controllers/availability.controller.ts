import type { NextFunction, Request, Response } from 'express'
import { availabilityQuerySchema } from '../validators/availability.validators.js'
import { findAvailableSlots } from '../services/availability.service.js'

export async function getAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, durationMinutes } = availabilityQuerySchema.parse(req.query)
    const slots = await findAvailableSlots({ rangeStart: from, rangeEnd: to, durationMinutes })
    res.status(200).json({ slots })
  } catch (error) {
    next(error)
  }
}
