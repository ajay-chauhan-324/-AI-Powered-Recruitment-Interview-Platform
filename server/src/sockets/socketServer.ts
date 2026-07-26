import type { Server as HttpServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import { env } from '../config/env.js'
import {
  appointmentEvents,
  type AppointmentEventPayload,
  type AvailabilityChangedPayload,
} from '../events/appointmentEvents.js'

/**
 * Real-time sync (CLAUDE.md §21). Broadcasts to every connected client on
 * the `/calendar` namespace rather than scoping to per-month rooms — this
 * project targets a single business/calendar context with a small number
 * of concurrent viewers, not a high-traffic multi-tenant platform, so the
 * added complexity of room scoping (and its edge cases, like an appointment
 * rescheduled across a month boundary needing to notify BOTH the old and
 * new room) isn't justified here. Revisit only if real scale demands it.
 *
 * The database remains authoritative: clients treat every event purely as
 * an invalidation signal and re-fetch from the REST API rather than trusting
 * the event payload as final state (see client/src/features/calendar/hooks/
 * useCalendarRealtime.ts) — so duplicate or out-of-order events are safe by
 * construction, and a client that misses an event entirely just shows
 * slightly stale data until its next normal refetch, never wrong data.
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  })

  const calendarNamespace = io.of('/calendar')

  function broadcast(eventName: string, payload: AppointmentEventPayload | AvailabilityChangedPayload) {
    calendarNamespace.emit(eventName, payload)
  }

  appointmentEvents.on('appointment.created', (payload: AppointmentEventPayload) => broadcast('appointment.created', payload))
  appointmentEvents.on('appointment.updated', (payload: AppointmentEventPayload) => broadcast('appointment.updated', payload))
  appointmentEvents.on('appointment.cancelled', (payload: AppointmentEventPayload) => broadcast('appointment.cancelled', payload))
  appointmentEvents.on('availability.changed', (payload: AvailabilityChangedPayload) => broadcast('availability.changed', payload))

  return io
}
