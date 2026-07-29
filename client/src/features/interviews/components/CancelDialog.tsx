import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { OwnerInterview } from '@/features/booking/api/bookingApi'
import { cancelMyInterview } from '@/features/interviews/api/myInterviewsApi'
import { ApiError } from '@/lib/apiClient'
import { Button } from '@/components/ui/Button'

function formatDateHeading(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

interface CancelDialogProps {
  interview: OwnerInterview
  onClose: () => void
}

/** Shared by InterviewsPage and ApplicationsPage — see RescheduleDialog.tsx for the same
 * reasoning: one candidate-facing cancel flow, not duplicated per page. */
export function CancelDialog({ interview, onClose }: CancelDialogProps) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => cancelMyInterview(interview.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-interviews'] })
      queryClient.invalidateQueries({ queryKey: ['my-applications'] })
      onClose()
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/30 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-t-lg border border-hairline bg-paper-50 p-5 shadow-sheet sm:rounded-lg sm:shadow-panel">
        <h2 className="text-md font-medium text-ink-900">Cancel this interview?</h2>
        <p className="mt-2 text-sm text-ink-700">
          "{interview.title}" on {formatDateHeading(new Date(interview.startAt))} will be cancelled. This can't be undone.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-conflict">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Keep interview
          </Button>
          <Button
            variant="danger"
            isLoading={mutation.isPending}
            onClick={() => {
              setError(null)
              mutation.mutate()
            }}
            className="flex-1"
          >
            {mutation.isPending ? 'Cancelling…' : 'Cancel interview'}
          </Button>
        </div>
      </div>
    </div>
  )
}
