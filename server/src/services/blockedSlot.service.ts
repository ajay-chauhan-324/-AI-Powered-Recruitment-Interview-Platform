import { isValidObjectId } from 'mongoose'
import { BlockedSlotModel, type BlockedSlotDocument } from '../models/BlockedSlot.model.js'
import type { BlockedSlotInput } from '../validators/schedule.validators.js'
import { appointmentEvents } from '../events/appointmentEvents.js'
import { NotFoundError } from './booking.errors.js'

export async function listBlockedSlots(from: Date, to: Date): Promise<BlockedSlotDocument[]> {
  return BlockedSlotModel.find({ startAt: { $lt: to }, endAt: { $gt: from } }).sort({ startAt: 1 })
}

export async function createBlockedSlot(input: BlockedSlotInput): Promise<BlockedSlotDocument> {
  const created = await BlockedSlotModel.create(input)
  appointmentEvents.emitAvailabilityChanged({ reason: 'blocked_slot' })
  return created
}

export async function deleteBlockedSlot(id: string): Promise<void> {
  if (!isValidObjectId(id)) throw new NotFoundError('Blocked slot not found.')
  const result = await BlockedSlotModel.deleteOne({ _id: id })
  if (result.deletedCount === 0) throw new NotFoundError('Blocked slot not found.')
  appointmentEvents.emitAvailabilityChanged({ reason: 'blocked_slot' })
}
