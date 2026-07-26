import { EventEmitter } from 'node:events'

/**
 * Domain events for real-time sync (CLAUDE.md §21). InterviewService emits
 * these after a mutation successfully commits — it has no dependency on
 * Socket.IO or any other transport; server/src/sockets/socketServer.ts is
 * the only thing that subscribes and forwards to connected clients. This
 * keeps the booking engine's tests (which never touch sockets) unaffected:
 * emitting with zero listeners is a safe no-op.
 *
 * Payloads are deliberately public-safe (id/startAt/endAt/status only) — the
 * same privacy scoping as the calendar read endpoint. No candidate-identifying
 * detail (name, email, resume, notes) may ever be broadcast here.
 */

export type InterviewEventName = 'interview.created' | 'interview.updated' | 'interview.cancelled'

export interface InterviewEventPayload {
  id: string
  startAt: Date
  endAt: Date
  status: 'pending' | 'confirmed' | 'cancelled'
}

/** Fired when working hours, breaks, or blocked time change (admin config) — no specific
 * interview is involved, so there's nothing to say beyond "something changed, re-check
 * availability." */
export interface AvailabilityChangedPayload {
  reason: 'schedule' | 'blocked_slot'
}

class InterviewEventEmitter extends EventEmitter {
  emitInterviewEvent(name: InterviewEventName, payload: InterviewEventPayload): void {
    this.emit(name, payload)
  }

  emitAvailabilityChanged(payload: AvailabilityChangedPayload): void {
    this.emit('availability.changed', payload)
  }
}

export const interviewEvents = new InterviewEventEmitter()
