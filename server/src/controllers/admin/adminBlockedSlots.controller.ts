import type { NextFunction, Request, Response } from 'express'
import { createBlockedSlot, deleteBlockedSlot, listBlockedSlots } from '../../services/blockedSlot.service.js'
import { blockedSlotInputSchema } from '../../validators/schedule.validators.js'
import { dateRangeQuerySchema } from '../../validators/calendar.validators.js'
import { NotFoundError } from '../../services/booking.errors.js'

function requireIdParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new NotFoundError('Blocked slot not found.')
  return value
}

export async function getAdminBlockedSlots(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = dateRangeQuerySchema.parse(req.query)
    const slots = await listBlockedSlots(from, to)
    res.status(200).json({
      blockedSlots: slots.map((slot) => ({
        id: slot._id.toString(),
        label: slot.label,
        startAt: slot.startAt,
        endAt: slot.endAt,
      })),
    })
  } catch (error) {
    next(error)
  }
}

export async function postAdminBlockedSlot(req: Request, res: Response, next: NextFunction) {
  try {
    const input = blockedSlotInputSchema.parse(req.body)
    const created = await createBlockedSlot(input)
    res
      .status(201)
      .json({ blockedSlot: { id: created._id.toString(), label: created.label, startAt: created.startAt, endAt: created.endAt } })
  } catch (error) {
    next(error)
  }
}

export async function deleteAdminBlockedSlot(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteBlockedSlot(requireIdParam(req.params.id))
    res.status(200).json({ ok: true })
  } catch (error) {
    next(error)
  }
}
