/**
 * DEMO / MOCK FIXTURE DATA — Phase 1 visual-foundation only.
 *
 * Nothing in this file is fetched, computed, persisted, or validated — it
 * exists solely to demonstrate the approved Ledger visual language
 * (appointment tags, availability ticks, blocked time, density) before any
 * real domain data exists. All values are static and deterministic.
 *
 * Replace: Phase 2 introduces the real Appointment/WorkingHours/BlockedSlot
 * models; Phase 3 computes real availability; Phase 5 wires real calendar
 * data into these same visual components. This file should be deleted once
 * those land.
 */

export type DemoSource = 'ai' | 'admin' | 'public'
export type DemoStatus = 'confirmed' | 'cancelled'

export interface DemoAppointment {
  id: string
  title: string
  attendee: string
  hour: number
  minute: number
  durationMinutes: number
  source: DemoSource
  status: DemoStatus
}

export interface DemoBlock {
  id: string
  label: string
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
}

export interface DemoAvailabilityTick {
  id: string
  hour: number
  minute: number
  durationMinutes: number
}

export const DEMO_DAY_APPOINTMENTS: DemoAppointment[] = [
  {
    id: 'demo-day-appt-1',
    title: 'Intro call',
    attendee: 'J. Alvarez · j.alvarez@example.com',
    hour: 9,
    minute: 0,
    durationMinutes: 30,
    source: 'admin',
    status: 'confirmed',
  },
  {
    id: 'demo-day-appt-2',
    title: 'Consultation',
    attendee: 'M. Chen · m.chen@example.com',
    hour: 11,
    minute: 0,
    durationMinutes: 60,
    source: 'ai',
    status: 'confirmed',
  },
  {
    id: 'demo-day-appt-3',
    title: 'Follow-up',
    attendee: 'R. Singh · r.singh@example.com',
    hour: 15,
    minute: 30,
    durationMinutes: 30,
    source: 'public',
    status: 'cancelled',
  },
]

export const DEMO_DAY_BLOCKS: DemoBlock[] = [
  { id: 'demo-day-block-1', label: 'Lunch', startHour: 13, startMinute: 0, endHour: 14, endMinute: 0 },
]

export const DEMO_DAY_AVAILABILITY: DemoAvailabilityTick[] = [
  { id: 'demo-day-avail-1', hour: 9, minute: 30, durationMinutes: 30 },
  { id: 'demo-day-avail-2', hour: 14, minute: 0, durationMinutes: 60 },
  { id: 'demo-day-avail-3', hour: 16, minute: 30, durationMinutes: 60 },
]

/** dayIndex is 0 = Mon .. 6 = Sun, matching the week view's column order. */
export interface DemoWeekAppointment extends DemoAppointment {
  dayIndex: number
}
export interface DemoWeekBlock extends DemoBlock {
  dayIndex: number
}
export interface DemoWeekAvailability extends DemoAvailabilityTick {
  dayIndex: number
}

export const DEMO_WEEK_APPOINTMENTS: DemoWeekAppointment[] = [
  {
    id: 'demo-week-appt-1',
    dayIndex: 1,
    title: 'Consultation',
    attendee: 'M. Chen',
    hour: 10,
    minute: 0,
    durationMinutes: 60,
    source: 'ai',
    status: 'confirmed',
  },
  {
    id: 'demo-week-appt-2',
    dayIndex: 3,
    title: 'Intro call',
    attendee: 'J. Alvarez',
    hour: 9,
    minute: 30,
    durationMinutes: 30,
    source: 'admin',
    status: 'confirmed',
  },
]

export const DEMO_WEEK_BLOCKS: DemoWeekBlock[] = [
  { id: 'demo-week-block-1', dayIndex: 4, label: 'Blocked', startHour: 13, startMinute: 0, endHour: 15, endMinute: 0 },
]

export const DEMO_WEEK_AVAILABILITY: DemoWeekAvailability[] = [
  { id: 'demo-week-avail-1', dayIndex: 1, hour: 14, minute: 0, durationMinutes: 60 },
  { id: 'demo-week-avail-2', dayIndex: 2, hour: 9, minute: 0, durationMinutes: 60 },
]

/** Day-of-month targets for the Month view density demo (skipped if the current month is shorter). */
export const DEMO_MONTH_DENSITY: Array<{ dayOfMonth: number; tickCount: 1 | 2 | 3; overflow?: number }> = [
  { dayOfMonth: 3, tickCount: 1 },
  { dayOfMonth: 9, tickCount: 2 },
  { dayOfMonth: 16, tickCount: 3, overflow: 2 },
  { dayOfMonth: 22, tickCount: 2 },
]
