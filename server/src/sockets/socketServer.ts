import type { Server as HttpServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import { env } from '../config/env.js'
import {
  interviewEvents,
  type AvailabilityChangedPayload,
  type InterviewEventPayload,
} from '../events/interviewEvents.js'

/**
 * Real-time sync. Broadcasts to every connected client on the `/calendar` namespace rather
 * than scoping to per-month rooms — this project targets a single business/calendar context
 * with a small number of concurrent viewers, not a high-traffic multi-tenant platform, so the
 * added complexity of room scoping isn't justified here.
 *
 * The database remains authoritative: clients treat every event purely as an invalidation
 * signal and re-fetch from the REST API rather than trusting the event payload as final
 * state — so duplicate or out-of-order events are safe by construction.
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  })

  const calendarNamespace = io.of('/calendar')

  function broadcast(eventName: string, payload: InterviewEventPayload | AvailabilityChangedPayload) {
    calendarNamespace.emit(eventName, payload)
  }

  interviewEvents.on('interview.created', (payload: InterviewEventPayload) => broadcast('interview.created', payload))
  interviewEvents.on('interview.updated', (payload: InterviewEventPayload) => broadcast('interview.updated', payload))
  interviewEvents.on('interview.cancelled', (payload: InterviewEventPayload) => broadcast('interview.cancelled', payload))
  interviewEvents.on('availability.changed', (payload: AvailabilityChangedPayload) => broadcast('availability.changed', payload))

  return io
}
