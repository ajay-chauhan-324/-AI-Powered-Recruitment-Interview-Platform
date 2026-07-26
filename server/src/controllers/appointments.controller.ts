import type { NextFunction, Request, Response } from 'express'
import {
  publicCreateAppointmentInputSchema,
  rescheduleAppointmentInputSchema,
} from '../validators/appointment.validators.js'
import {
  cancelAppointment,
  createAppointment,
  getAppointmentByToken,
  rescheduleAppointment,
} from '../services/appointment.service.js'
import { AppointmentNotFoundError } from '../services/booking.errors.js'
import type { AppointmentDocument } from '../models/Appointment.model.js'

function toPublicJson(appointment: AppointmentDocument) {
  return {
    id: appointment._id.toString(),
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: appointment.status,
  }
}

/** Only reachable by whoever holds the raw manage token (proof of ownership) — safe to
 * include full detail here, unlike the anonymous public calendar view (Phase 5). */
function toOwnerJson(appointment: AppointmentDocument) {
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
  }
}

export async function postAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const input = publicCreateAppointmentInputSchema.parse(req.body)
    const { appointment, manageToken } = await createAppointment({ ...input, source: 'public' })
    res.status(201).json({ appointment: toPublicJson(appointment), manageToken })
  } catch (error) {
    next(error)
  }
}

/** Express 5 types a route param as string | string[] | undefined (repeated-param patterns
 * aren't possible for this route, but the type doesn't know that). */
function requireStringParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new AppointmentNotFoundError()
  return value
}

async function findOwnedAppointmentOrThrow(token: string | string[] | undefined) {
  const appointment = await getAppointmentByToken(requireStringParam(token))
  if (!appointment) throw new AppointmentNotFoundError()
  return appointment
}

export async function getAppointmentByManageToken(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await findOwnedAppointmentOrThrow(req.params.token)
    res.status(200).json({ appointment: toOwnerJson(appointment) })
  } catch (error) {
    next(error)
  }
}

export async function patchAppointmentByManageToken(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await findOwnedAppointmentOrThrow(req.params.token)
    const { newStart } = rescheduleAppointmentInputSchema.parse(req.body)
    const updated = await rescheduleAppointment(existing._id.toString(), newStart)
    res.status(200).json({ appointment: toOwnerJson(updated) })
  } catch (error) {
    next(error)
  }
}

export async function deleteAppointmentByManageToken(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await findOwnedAppointmentOrThrow(req.params.token)
    const cancelled = await cancelAppointment(existing._id.toString())
    res.status(200).json({ appointment: toOwnerJson(cancelled) })
  } catch (error) {
    next(error)
  }
}
