import { EventEmitter } from 'node:events'

/**
 * Domain events for real-time sync (CLAUDE.md §21). AppointmentService emits
 * these after a mutation successfully commits — it has no dependency on
 * Socket.IO or any other transport; server/src/sockets/socketServer.ts is
 * the only thing that subscribes and forwards to connected clients. This
 * keeps the booking engine's tests (which never touch sockets) unaffected:
 * emitting with zero listeners is a safe no-op.
 *
 * Payloads are deliberately public-safe (id/startAt/endAt/status only) — the
 * same privacy scoping as the calendar read endpoint (Phase 5). No
 * authentication exists yet, so nothing broadcast here may include name,
 * email, or purpose.
 */

export type AppointmentEventName = 'appointment.created' | 'appointment.updated' | 'appointment.cancelled'

export interface AppointmentEventPayload {
  id: string
  startAt: Date
  endAt: Date
  status: 'pending' | 'confirmed' | 'cancelled'
}

/** Fired when working hours, breaks, or blocked time change (Phase 9 admin config) — no
 * specific appointment is involved, so there's nothing to say beyond "something changed,
 * re-check availability." */
export interface AvailabilityChangedPayload {
  reason: 'schedule' | 'blocked_slot'
}

class AppointmentEventEmitter extends EventEmitter {
  emitAppointmentEvent(name: AppointmentEventName, payload: AppointmentEventPayload): void {
    this.emit(name, payload)
  }

  emitAvailabilityChanged(payload: AvailabilityChangedPayload): void {
    this.emit('availability.changed', payload)
  }
}

export const appointmentEvents = new AppointmentEventEmitter()
