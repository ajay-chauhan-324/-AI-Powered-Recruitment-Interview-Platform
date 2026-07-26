import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'

/**
 * Real-time sync (CLAUDE.md §21). Every event is treated purely as an
 * invalidation signal, never as trusted state — the database (via a normal
 * REST refetch) is always the source of truth. This makes duplicate and
 * out-of-order events safe by construction: invalidating twice just causes
 * an extra (harmless) refetch, and a missed event just means slightly
 * stale data until the next normal refetch, never wrong data. Socket.IO's
 * client reconnects automatically by default, so no custom reconnection
 * logic is needed here.
 *
 * Returns the set of appointment ids that changed in roughly the last
 * second, so the calendar can apply a brief visual highlight pulse
 * (CLAUDE.md §21 "brief visual highlight on the affected region") without
 * ever forcing a page refresh.
 */

interface AppointmentEventPayload {
  id: string
  startAt: string
  endAt: string
  status: 'pending' | 'confirmed' | 'cancelled'
}

const HIGHLIGHT_DURATION_MS = 900
const EVENT_NAMES = ['appointment.created', 'appointment.updated', 'appointment.cancelled'] as const

export function useCalendarRealtime() {
  const queryClient = useQueryClient()
  const [recentlyChangedIds, setRecentlyChangedIds] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const socket = io('/calendar', { path: '/socket.io' })

    function handleChange(payload: AppointmentEventPayload) {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })

      setRecentlyChangedIds((prev) => new Set(prev).add(payload.id))
      setTimeout(() => {
        setRecentlyChangedIds((prev) => {
          const next = new Set(prev)
          next.delete(payload.id)
          return next
        })
      }, HIGHLIGHT_DURATION_MS)
    }

    for (const eventName of EVENT_NAMES) {
      socket.on(eventName, handleChange)
    }

    return () => {
      socket.disconnect()
    }
  }, [queryClient])

  return { recentlyChangedIds }
}
