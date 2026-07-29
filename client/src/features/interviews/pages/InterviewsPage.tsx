import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Calendar, MapPin, Phone, Sparkles, Video } from 'lucide-react'
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { fetchMyInterviews } from '@/features/interviews/api/myInterviewsApi'
import { RescheduleDialog } from '@/features/interviews/components/RescheduleDialog'
import { CancelDialog } from '@/features/interviews/components/CancelDialog'
import type { InterviewLocationType, InterviewType, OwnerInterview } from '@/features/booking/api/bookingApi'
import { buildIcsDataUrl } from '@/features/booking/lib/ics'
import { formatClockInTimeZone } from '@/features/calendar/lib/layout'
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation'

const INTERVIEW_TYPE_LABEL: Record<InterviewType, string> = {
  hr_screening: 'HR Screening',
  technical: 'Technical Interview',
  coding: 'Coding Interview',
  system_design: 'System Design Interview',
  behavioral: 'Behavioral Interview',
  managerial: 'Managerial Interview',
  final: 'Final Interview',
  panel: 'Panel Interview',
  custom: 'Interview',
}

const STATUS_LABEL: Record<OwnerInterview['status'], string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
}

const STATUS_TONE: Record<OwnerInterview['status'], BadgeTone> = {
  pending: 'warning',
  confirmed: 'success',
  cancelled: 'neutral',
}

const LOCATION_ICON: Record<InterviewLocationType, typeof Video> = {
  video: Video,
  phone: Phone,
  onsite: MapPin,
  custom: Calendar,
}

type Tab = 'upcoming' | 'past' | 'cancelled'

const EMPTY_INTERVIEWS: OwnerInterview[] = []

const JOIN_WINDOW_MINUTES_BEFORE = 15

function formatDateHeading(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

interface InterviewCardProps {
  interview: OwnerInterview
  onReschedule: (interview: OwnerInterview) => void
  onCancel: (interview: OwnerInterview) => void
}

function InterviewCard({ interview, onReschedule, onCancel }: InterviewCardProps) {
  const [expanded, setExpanded] = useState(false)
  const start = new Date(interview.startAt)
  const end = new Date(interview.endAt)
  const now = new Date()
  const canJoin =
    interview.status === 'confirmed' &&
    interview.meetingUrl &&
    now >= new Date(start.getTime() - JOIN_WINDOW_MINUTES_BEFORE * 60_000) &&
    now < end
  const isCancelled = interview.status === 'cancelled'
  const isPast = end.getTime() <= now.getTime()
  const LocationIcon = LOCATION_ICON[interview.locationType]

  return (
    <div className="rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={'truncate text-sm font-medium text-ink-900' + (isCancelled ? ' line-through' : '')}>
            {interview.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 truncate text-xs text-ink-700">
            <span>{INTERVIEW_TYPE_LABEL[interview.interviewType]}</span>
            {interview.round > 1 && (
              <>
                <span aria-hidden="true">·</span>
                <span>Round {interview.round}</span>
              </>
            )}
            {interview.interviewerName && (
              <>
                <span aria-hidden="true">·</span>
                <span>{interview.interviewerName}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 capitalize">
              <LocationIcon size={11} aria-hidden="true" />
              {interview.locationType}
            </span>
          </p>
        </div>
        <Badge tone={STATUS_TONE[interview.status]}>{STATUS_LABEL[interview.status]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-sm tabular-nums text-ink-900">{formatDateHeading(start)}</span>
        <span className="font-mono text-sm tabular-nums text-ink-700">
          {formatClockInTimeZone(start, interview.timezone)}–{formatClockInTimeZone(end, interview.timezone)} ({interview.timezone})
        </span>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-col gap-1 border-t border-hairline pt-3 text-sm text-ink-700">
          {interview.description && <p>{interview.description}</p>}
          <p className="capitalize">Location: {interview.locationType}</p>
          {interview.address && <p>Address: {interview.address}</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canJoin && (
          <a href={interview.meetingUrl} target="_blank" rel="noreferrer">
            <Button variant="primary" size="sm">
              <Video size={13} aria-hidden="true" />
              Join interview
            </Button>
          </a>
        )}
        <Button variant="secondary" size="sm" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Hide details' : 'View details'}
        </Button>
        {!isCancelled && !isPast && (
          <>
            <Button variant="secondary" size="sm" onClick={() => onReschedule(interview)}>
              Reschedule
            </Button>
            <Button variant="danger" size="sm" onClick={() => onCancel(interview)}>
              Cancel
            </Button>
          </>
        )}
        {interview.status === 'confirmed' && (
          <a
            href={buildIcsDataUrl({
              uid: `${interview.id}@theledger`,
              title: interview.title,
              location: interview.locationType === 'video' ? interview.meetingUrl : interview.address,
              startAt: start,
              endAt: end,
            })}
            download={`${interview.title.replace(/\s+/g, '-').toLowerCase()}.ics`}
          >
            <Button variant="secondary" size="sm">
              Add to calendar
            </Button>
          </a>
        )}
      </div>
    </div>
  )
}

export function InterviewsPage() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [rescheduleTarget, setRescheduleTarget] = useState<OwnerInterview | null>(null)
  const [cancelTarget, setCancelTarget] = useState<OwnerInterview | null>(null)

  const interviewsQuery = useQuery({ queryKey: ['my-interviews'], queryFn: fetchMyInterviews })
  useRealtimeInvalidation([['my-interviews']])
  const interviews = interviewsQuery.data?.interviews ?? EMPTY_INTERVIEWS

  const grouped = useMemo(() => {
    const now = new Date()
    const upcoming: OwnerInterview[] = []
    const past: OwnerInterview[] = []
    const cancelled: OwnerInterview[] = []
    for (const interview of interviews) {
      if (interview.status === 'cancelled') {
        cancelled.push(interview)
      } else if (new Date(interview.endAt).getTime() <= now.getTime()) {
        past.push(interview)
      } else {
        upcoming.push(interview)
      }
    }
    upcoming.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    past.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    cancelled.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    return { upcoming, past, cancelled }
  }, [interviews])

  const visible = grouped[tab]

  return (
    <AuthenticatedLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="flex items-center gap-2 text-xl font-medium text-ink-900">
          <Calendar size={20} aria-hidden="true" className="text-amber-600" />
          My Interviews
        </h1>
        <p className="mt-1 text-sm text-ink-700">Every interview you've booked, in one place.</p>

        <div className="mt-6">
          <SegmentedControl
            label="Filter interviews"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'upcoming', label: `Upcoming (${grouped.upcoming.length})` },
              { value: 'past', label: `Past (${grouped.past.length})` },
              { value: 'cancelled', label: `Cancelled (${grouped.cancelled.length})` },
            ]}
          />
        </div>

        {interviewsQuery.isLoading && (
          <div className="mt-6 flex flex-col gap-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {interviewsQuery.isError && (
          <p role="alert" className="mt-6 text-sm text-conflict">
            Couldn't load your interviews. Please try again.
          </p>
        )}

        {!interviewsQuery.isLoading && visible.length === 0 && (
          <div className="mt-8">
            <EmptyState
              icon={tab === 'upcoming' ? Sparkles : Calendar}
              title={
                tab === 'upcoming'
                  ? 'No interviews scheduled yet.'
                  : tab === 'past'
                    ? 'No past interviews yet.'
                    : 'No cancelled interviews.'
              }
              description={
                tab === 'upcoming'
                  ? "Once a recruiter unlocks your next interview round, you'll be able to book it from your application page."
                  : undefined
              }
              action={
                tab === 'upcoming' ? (
                  <Link to="/jobs">
                    <Button variant="primary">Browse jobs</Button>
                  </Link>
                ) : undefined
              }
            />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {visible.map((interview, index) => (
            <motion.div
              key={interview.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
            >
              <InterviewCard interview={interview} onReschedule={setRescheduleTarget} onCancel={setCancelTarget} />
            </motion.div>
          ))}
        </div>
      </div>

      {rescheduleTarget && (
        <RescheduleDialog interview={rescheduleTarget} onClose={() => setRescheduleTarget(null)} />
      )}
      {cancelTarget && <CancelDialog interview={cancelTarget} onClose={() => setCancelTarget(null)} />}
    </AuthenticatedLayout>
  )
}
