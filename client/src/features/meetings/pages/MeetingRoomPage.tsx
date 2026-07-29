import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Copy,
  Hand,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Maximize,
  Minimize,
  Circle,
  Users,
  Video as VideoIcon,
  VideoOff,
  Info,
  Loader2,
} from 'lucide-react'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { ApiError } from '@/lib/apiClient'
import { fetchMeeting } from '@/features/meetings/api/meetingsApi'
import { useMeetingRoom, type MeetingConnectionStatus } from '@/features/meetings/hooks/useMeetingRoom'
import { VideoTile } from '@/features/meetings/components/VideoTile'

const INTERVIEW_TYPE_LABEL: Record<string, string> = {
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

const CONNECTION_STATUS_LABEL: Record<MeetingConnectionStatus, string> = {
  connecting: 'Connecting…',
  'waiting-for-peer': 'Waiting for the other participant',
  'connecting-peer': 'Connecting…',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection error',
}

const CONNECTION_STATUS_DOT: Record<MeetingConnectionStatus, string> = {
  connecting: 'bg-amber-600',
  'waiting-for-peer': 'bg-amber-600',
  'connecting-peer': 'bg-amber-600',
  connected: 'bg-available',
  disconnected: 'bg-conflict',
  error: 'bg-conflict',
}

function ElapsedTimer({ since }: { since: Date }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return (
    <span className="font-mono text-xs tabular-nums text-paper-100">
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </span>
  )
}

type SidePanelTab = 'chat' | 'participants' | 'info'

export function MeetingRoomPage() {
  const { meetingId = '' } = useParams<{ meetingId: string }>()
  const navigate = useNavigate()
  const session = useUserSession()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sidePanel, setSidePanel] = useState<SidePanelTab | null>(null)
  const [chatDraft, setChatDraft] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [connectedAt, setConnectedAt] = useState<Date | null>(null)

  const meetingQuery = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => fetchMeeting(meetingId),
    enabled: Boolean(meetingId) && Boolean(session.data),
    retry: false,
  })

  const meeting = meetingQuery.data?.meeting
  const myRole = meeting?.yourRole ?? null

  const room = useMeetingRoom(meetingId, myRole)

  useEffect(() => {
    if (room.connectionStatus === 'connected' && !connectedAt) setConnectedAt(new Date())
    if (room.connectionStatus === 'waiting-for-peer') setConnectedAt(null)
  }, [room.connectionStatus, connectedAt])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      void containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      void document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  function copyMeetingLink() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  function handleLeave() {
    room.leaveMeeting()
    navigate(myRole === 'recruiter' ? '/recruiter/calendar' : '/interviews')
  }

  function handleSendChat() {
    if (!chatDraft.trim()) return
    room.sendChatMessage(chatDraft)
    setChatDraft('')
  }

  if (session.isLoading || meetingQuery.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-900">
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }

  if (!session.data) {
    navigate('/login', { replace: true, state: { from: `/meeting/${meetingId}` } })
    return null
  }

  if (meetingQuery.isError || !meeting) {
    const message = meetingQuery.error instanceof ApiError ? meetingQuery.error.message : "This meeting couldn't be found."
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-900 px-4">
        <EmptyState icon={VideoOff} title="Meeting unavailable" description={message} />
      </div>
    )
  }

  const otherRole = myRole === 'candidate' ? 'recruiter' : 'candidate'
  const peerPresent = room.participants.includes(otherRole)
  const myLabel = myRole === 'candidate' ? meeting.candidateName || 'You' : meeting.interviewerName || 'You'
  const otherLabel = otherRole === 'candidate' ? meeting.candidateName || 'Candidate' : meeting.interviewerName || 'Recruiter'

  return (
    <div ref={containerRef} className="flex min-h-dvh flex-col bg-ink-900 text-paper-50">
      {/* Top bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-paper-100/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-paper-50">
            {INTERVIEW_TYPE_LABEL[meeting.interviewType] ?? meeting.title} · Round {meeting.round}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-paper-200">
            <span className={`h-1.5 w-1.5 rounded-full ${CONNECTION_STATUS_DOT[room.connectionStatus]}`} aria-hidden="true" />
            {CONNECTION_STATUS_LABEL[room.connectionStatus]}
            {connectedAt && (
              <>
                <span aria-hidden="true">·</span>
                <ElapsedTimer since={connectedAt} />
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={copyMeetingLink}
            className="flex min-h-9 items-center gap-1.5 rounded-pill border border-paper-100/20 px-3 text-xs font-medium text-paper-100 hover:bg-paper-50/10"
          >
            <Copy size={13} aria-hidden="true" />
            {linkCopied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
            className="flex min-h-9 min-w-9 items-center justify-center rounded-pill border border-paper-100/20 text-paper-100 hover:bg-paper-50/10"
          >
            {isFullscreen ? <Minimize size={14} aria-hidden="true" /> : <Maximize size={14} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {room.errorMessage && (
        <p role="alert" className="shrink-0 bg-conflict-tint px-4 py-2 text-sm text-conflict">
          {room.errorMessage}
        </p>
      )}

      {/* Main area */}
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <VideoTile
            stream={room.localStream}
            muted
            label={`${myLabel} (You)`}
            cameraOff={!room.isCameraOn}
            className="aspect-video sm:aspect-auto"
          />
          {peerPresent ? (
            <VideoTile stream={room.remoteStream} muted={false} label={otherLabel} className="aspect-video sm:aspect-auto" />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-paper-100/20 text-paper-200 sm:aspect-auto">
              <Loader2 size={22} aria-hidden="true" className="animate-spin" />
              <p className="text-sm">Waiting for {otherLabel} to join…</p>
            </div>
          )}
        </div>

        {sidePanel && (
          <div className="flex w-full shrink-0 flex-col rounded-lg border border-paper-100/10 bg-ink-700/50 lg:w-72">
            <div className="flex items-center justify-between border-b border-paper-100/10 px-3 py-2.5">
              <p className="text-sm font-medium text-paper-50 capitalize">{sidePanel}</p>
              <button type="button" onClick={() => setSidePanel(null)} aria-label="Close panel" className="text-paper-200 hover:text-paper-50">
                ×
              </button>
            </div>

            {sidePanel === 'chat' && (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  {room.chatMessages.length === 0 && <p className="text-xs text-paper-200">No messages yet.</p>}
                  {room.chatMessages.map((message, index) => (
                    <div key={index} className="text-sm">
                      <span className="font-medium text-amber-500 capitalize">{message.from === myRole ? 'You' : otherLabel}</span>
                      <span className="ml-1.5 text-paper-100">{message.message}</span>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleSendChat()
                  }}
                  className="flex items-center gap-2 border-t border-paper-100/10 p-2.5"
                >
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                    placeholder="Message…"
                    className="w-full rounded-md border border-paper-100/20 bg-ink-900 px-2.5 py-1.5 text-sm text-paper-50 placeholder:text-paper-200 focus:outline-none"
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={!chatDraft.trim()}>
                    Send
                  </Button>
                </form>
              </>
            )}

            {sidePanel === 'participants' && (
              <div className="flex-1 space-y-2 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{myLabel} (You)</span>
                  <span className="text-xs text-available">Joined</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{otherLabel}</span>
                  <span className={`text-xs ${peerPresent ? 'text-available' : 'text-paper-200'}`}>
                    {peerPresent ? 'Joined' : 'Not yet joined'}
                  </span>
                </div>
                {room.peerRaisedHand && <p className="flex items-center gap-1.5 text-xs text-amber-500"><Hand size={12} aria-hidden="true" /> {otherLabel} raised their hand</p>}
              </div>
            )}

            {sidePanel === 'info' && (
              <div className="flex-1 space-y-3 p-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-paper-200">Candidate</p>
                  <p className="text-paper-50">{meeting.candidateName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-paper-200">Recruiter</p>
                  <p className="text-paper-50">{meeting.interviewerName || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-paper-200">Scheduled</p>
                  <p className="text-paper-50">
                    {new Date(meeting.startAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} ({meeting.timezone})
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-paper-100/10 px-4 py-3">
        <button
          type="button"
          onClick={room.toggleMic}
          aria-label={room.isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border ${room.isMicOn ? 'border-paper-100/20 text-paper-50 hover:bg-paper-50/10' : 'border-conflict/40 bg-conflict-tint text-conflict'}`}
        >
          {room.isMicOn ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={room.toggleCamera}
          aria-label={room.isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border ${room.isCameraOn ? 'border-paper-100/20 text-paper-50 hover:bg-paper-50/10' : 'border-conflict/40 bg-conflict-tint text-conflict'}`}
        >
          {room.isCameraOn ? <VideoIcon size={18} aria-hidden="true" /> : <VideoOff size={18} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => void room.toggleScreenShare()}
          aria-label={room.isScreenSharing ? 'Stop screen share' : 'Share screen'}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border ${room.isScreenSharing ? 'border-amber-600 bg-amber-100 text-ink-900' : 'border-paper-100/20 text-paper-50 hover:bg-paper-50/10'}`}
        >
          {room.isScreenSharing ? <MonitorOff size={18} aria-hidden="true" /> : <Monitor size={18} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={room.toggleRaiseHand}
          aria-label={room.isHandRaised ? 'Lower hand' : 'Raise hand'}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border ${room.isHandRaised ? 'border-amber-600 bg-amber-100 text-ink-900' : 'border-paper-100/20 text-paper-50 hover:bg-paper-50/10'}`}
        >
          <Hand size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled
          title="Recording is not available yet"
          aria-label="Recording (coming soon)"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-paper-100/10 text-paper-200/50"
        >
          <Circle size={18} aria-hidden="true" />
        </button>

        <span className="mx-1 h-8 w-px bg-paper-100/10" aria-hidden="true" />

        <button
          type="button"
          onClick={() => setSidePanel((prev) => (prev === 'chat' ? null : 'chat'))}
          aria-label="Toggle chat"
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border ${sidePanel === 'chat' ? 'border-amber-600 bg-amber-100 text-ink-900' : 'border-paper-100/20 text-paper-50 hover:bg-paper-50/10'}`}
        >
          <MessageSquare size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setSidePanel((prev) => (prev === 'participants' ? null : 'participants'))}
          aria-label="Toggle participants"
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border ${sidePanel === 'participants' ? 'border-amber-600 bg-amber-100 text-ink-900' : 'border-paper-100/20 text-paper-50 hover:bg-paper-50/10'}`}
        >
          <Users size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setSidePanel((prev) => (prev === 'info' ? null : 'info'))}
          aria-label="Toggle info"
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border ${sidePanel === 'info' ? 'border-amber-600 bg-amber-100 text-ink-900' : 'border-paper-100/20 text-paper-50 hover:bg-paper-50/10'}`}
        >
          <Info size={18} aria-hidden="true" />
        </button>

        <span className="mx-1 h-8 w-px bg-paper-100/10" aria-hidden="true" />

        <button
          type="button"
          onClick={handleLeave}
          aria-label="Leave meeting"
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-conflict px-5 text-sm font-medium text-paper-50 hover:bg-conflict/90"
        >
          <PhoneOff size={16} aria-hidden="true" />
          Leave
        </button>
      </div>
    </div>
  )
}
