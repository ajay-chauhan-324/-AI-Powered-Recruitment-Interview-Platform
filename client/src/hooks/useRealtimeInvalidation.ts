import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { API_ORIGIN } from '@/lib/apiClient'

const EVENT_NAMES = ['interview.created', 'interview.updated', 'interview.cancelled', 'availability.changed'] as const

/**
 * Generic real-time cache invalidation for any page showing interview/availability data —
 * subscribes to the server's public `/calendar` Socket.IO namespace (unauthenticated by
 * design, server/src/sockets/socketServer.ts — every payload is minimal/public-safe, see
 * events/interviewEvents.ts) and invalidates whichever TanStack Query keys the caller passes
 * whenever any interview changes anywhere. Every event is treated purely as an invalidation
 * signal, never trusted state (CLAUDE.md §21) — a normal REST refetch remains the source of
 * truth, so a duplicate or out-of-order event is harmless (just one extra refetch), and a
 * missed event only means slightly stale data until the next one.
 *
 * A partial query key (e.g. `['admin-interviews']`) invalidates every query whose key starts
 * with it, including ones with extra params (date range, filters, etc.) — you don't need the
 * exact full key, just the same prefix the page's own `useQuery` calls use.
 *
 * Replaces the old single-purpose, TimeCanvas-only `useCalendarRealtime` hook (which only
 * ever invalidated one hardcoded `['calendar']` key) — this version works for any page.
 */
export function useRealtimeInvalidation(queryKeys: QueryKey[]): void {
  const queryClient = useQueryClient()
  // Effect re-subscribes only when the actual set of keys changes content, not merely
  // reference — most callers pass a fresh array literal every render.
  const keysDependency = JSON.stringify(queryKeys)

  useEffect(() => {
    const socket = io(`${API_ORIGIN}/calendar`, { path: '/socket.io' })

    function invalidateAll() {
      for (const key of queryKeys) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    }

    for (const eventName of EVENT_NAMES) {
      socket.on(eventName, invalidateAll)
    }

    return () => {
      socket.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysDependency, queryClient])
}
