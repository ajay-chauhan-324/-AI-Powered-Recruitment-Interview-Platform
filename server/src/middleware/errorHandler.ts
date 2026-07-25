import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.js'

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

  console.error(err)

  const message =
    env.NODE_ENV === 'production' ? 'Something went wrong. Please try again.' : (err as Error)?.message

  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } })
}
