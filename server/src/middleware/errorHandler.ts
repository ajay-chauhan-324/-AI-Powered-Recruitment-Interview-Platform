import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { env } from '../config/env.js'
import { BookingValidationError, NotFoundError, SlotConflictError } from '../services/booking.errors.js'
import { ScheduleNotConfiguredError } from '../services/availability.service.js'

export class AppError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(code: string, message: string, statusCode = 400) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` },
  })
}

// Express identifies error-handling middleware by arity (4 params) — all four must stay declared.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } })
    return
  }

  if (err instanceof ZodError) {
    const message = err.issues.map((issue) => issue.message).join('; ')
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
    return
  }

  if (err instanceof BookingValidationError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message } })
    return
  }

  if (err instanceof SlotConflictError) {
    res
      .status(409)
      .json({ error: { code: 'SLOT_CONFLICT', message: err.message }, alternatives: err.alternatives })
    return
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } })
    return
  }

  if (err instanceof ScheduleNotConfiguredError) {
    res.status(503).json({ error: { code: 'SCHEDULE_NOT_CONFIGURED', message: err.message } })
    return
  }

  console.error(err)

  const message =
    env.NODE_ENV === 'production' ? 'Something went wrong. Please try again.' : (err as Error)?.message

  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } })
}
