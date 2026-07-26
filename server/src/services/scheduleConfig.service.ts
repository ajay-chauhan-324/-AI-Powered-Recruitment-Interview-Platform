import { ScheduleConfigModel, type ScheduleConfigDocument } from '../models/ScheduleConfig.model.js'
import type { ScheduleConfigInput } from '../validators/schedule.validators.js'
import { interviewEvents } from '../events/interviewEvents.js'

export async function getScheduleConfig(): Promise<ScheduleConfigDocument | null> {
  return ScheduleConfigModel.findOne({ singleton: 'default' })
}

/** Upserts the single schedule config document (CLAUDE.md §20 "Configure working hours").
 * Emits availability.changed so every connected client re-checks availability — working
 * hours changing can make previously-available slots unavailable and vice versa. */
export async function upsertScheduleConfig(input: ScheduleConfigInput): Promise<ScheduleConfigDocument> {
  const updated = await ScheduleConfigModel.findOneAndUpdate(
    { singleton: 'default' },
    { $set: input },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  interviewEvents.emitAvailabilityChanged({ reason: 'schedule' })
  return updated
}
