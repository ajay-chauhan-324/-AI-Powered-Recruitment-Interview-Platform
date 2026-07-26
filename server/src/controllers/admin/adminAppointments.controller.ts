import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import {
  cancelAppointment,
  createAppointment,
  listAppointmentsInRange,
  rescheduleAppointment,
} from '../../services/appointment.service.js'
import { createAppointmentInputSchema } from '../../validators/appointment.validators.js'
import { dateRangeQuerySchema } from '../../validators/calendar.validators.js'
import type { AppointmentDocument } from '../../models/Appointment.model.js'
import { NotFoundError } from '../../services/booking.errors.js'

/** Express 5 types a route param as string | string[] | undefined even for a plain `/:id`
 * pattern that can never actually match an array. */
function requireIdParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new NotFoundError('Appointment not found.')
  return value
}

/** Full detail, unlike the public calendar view — this route is admin-only (requireAdminAuth). */
function toAdminJson(appointment: AppointmentDocument) {
  return {
    id: appointment._id.toString(),
    name: appointment.name,
    email: appointment.email,
    purpose: appointment.purpose,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    durationMinutes: appointment.durationMinutes,
    timezone: appointment.timezone,
    status: appointment.status,
    source: appointment.source,
  }
}

export async function getAdminAppointments(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = dateRangeQuerySchema.parse(req.query)
    const appointments = await listAppointmentsInRange(from, to)
    res.status(200).json({ appointments: appointments.map(toAdminJson) })
  } catch (error) {
    next(error)
  }
}

const adminCreateInputSchema = createAppointmentInputSchema.omit({ source: true })

export async function postAdminAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const input = adminCreateInputSchema.parse(req.body)
    const { appointment } = await createAppointment({ ...input, source: 'admin' })
    res.status(201).json({ appointment: toAdminJson(appointment) })
  } catch (error) {
    next(error)
  }
}

const patchAppointmentSchema = z.object({
  newStart: z.coerce.date(),
  newDurationMinutes: z.number().int().positive().max(24 * 60).optional(),
})

export async function patchAdminAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const { newStart, newDurationMinutes } = patchAppointmentSchema.parse(req.body)
    const updated = await rescheduleAppointment(requireIdParam(req.params.id), newStart, newDurationMinutes)
    res.status(200).json({ appointment: toAdminJson(updated) })
  } catch (error) {
    next(error)
  }
}

export async function deleteAdminAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const cancelled = await cancelAppointment(requireIdParam(req.params.id))
    res.status(200).json({ appointment: toAdminJson(cancelled) })
  } catch (error) {
    next(error)
  }
}
