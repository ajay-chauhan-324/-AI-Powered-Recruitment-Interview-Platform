import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

export type MeetingConnectionStatus =
  | 'connecting'
  | 'waiting-for-peer'
  | 'connecting-peer'
  | 'connected'
  | 'disconnected'
  | 'error'

export type MeetingRole = 'candidate' | 'recruiter'

export interface MeetingChatMessage {
  from: MeetingRole
  message: string
  at: string
}

// A public STUN server is enough for NAT traversal in the common case (no TURN relay — out of
// scope for this MVP, matching "future-ready for WebRTC" rather than a production media relay).
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

interface SignalPayload {
  data: { type: 'offer' | 'answer' | 'ice-candidate'; sdp?: string; candidate?: RTCIceCandidateInit }
  from: MeetingRole
}

/**
 * All WebRTC + Socket.IO signaling for one Meeting Room, kept out of the page component so the
 * page can stay focused on layout. Signaling goes over the server's `/meeting` namespace
 * (server/src/sockets/meetingNamespace.ts) — a private room per meetingId, authenticated and
 * ownership-checked server-side; this hook never decides who's allowed in, it just reacts to
 * what the server already validated. Exactly one side ever creates the SDP offer (whichever
 * participant was already in the room when the other joins — see meeting:peer-joined below),
 * so there's no glare/race between two simultaneous offers.
 */
export function useMeetingRoom(meetingId: string, myRole: MeetingRole | null) {
  const socketRef = useRef<Socket | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  // Caches the IN-FLIGHT getUserMedia() promise, not just its resolved result — without this,
  // two calls to ensureLocalMedia() racing before the first one resolves (e.g. the
  // meeting:joined handler and a near-simultaneous meeting:peer-joined handler) would both see
  // localStreamRef.current as null and each call getUserMedia() independently, acquiring two
  // separate camera/mic handles and silently orphaning one.
  const localMediaPromiseRef = useRef<Promise<MediaStream> | null>(null)
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  // Guards against creating a second SDP offer on the same RTCPeerConnection if
  // meeting:peer-joined ever fires more than once for a peer already connected (a duplicate or
  // stale server event) — reset whenever the peer connection is actually torn down.
  const hasOfferedRef = useRef(false)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])

  const [connectionStatus, setConnectionStatus] = useState<MeetingConnectionStatus>('connecting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [participants, setParticipants] = useState<MeetingRole[]>([])
  const [peerRaisedHand, setPeerRaisedHand] = useState(false)
  const [isHandRaised, setIsHandRaised] = useState(false)
  const [chatMessages, setChatMessages] = useState<MeetingChatMessage[]>([])

  const ensurePeerConnection = useCallback((): RTCPeerConnection => {
    if (peerConnectionRef.current) return peerConnectionRef.current
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('meeting:signal', { data: { type: 'ice-candidate', candidate: event.candidate.toJSON() } })
      }
    }
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] ?? null)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setConnectionStatus('connected')
      else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionStatus('disconnected')
        setRemoteStream(null)
      }
    }
    peerConnectionRef.current = pc
    return pc
  }, [])

  /** Idempotent — returns the already-acquired stream on every call after the first, so the
   * candidate/recruiter sees their own camera preview immediately on entering the waiting
   * room, before a peer has even joined. Also safe under concurrent calls (see
   * localMediaPromiseRef above) — only ever issues one getUserMedia() request per session. */
  const ensureLocalMedia = useCallback(async (): Promise<MediaStream> => {
    if (localStreamRef.current) return localStreamRef.current
    if (localMediaPromiseRef.current) return localMediaPromiseRef.current
    const promise = navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      localStreamRef.current = stream
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null
      setLocalStream(stream)
      return stream
    })
    localMediaPromiseRef.current = promise
    try {
      return await promise
    } finally {
      localMediaPromiseRef.current = null
    }
  }, [])

  // createOffer/handleOffer are always invoked as bare `void createOffer()` /
  // `void handleOffer(...)` from socket event handlers below — neither has a caller that
  // attaches a `.catch`, so any rejection (most commonly ensureLocalMedia() re-throwing a
  // camera/mic denial on a later call, once its promise cache has already been cleared by an
  // earlier attempt) would otherwise surface as an unhandled promise rejection instead of the
  // same user-facing error message the initial `meeting:joined` acquisition already shows.
  const createOffer = useCallback(async () => {
    if (hasOfferedRef.current) return
    hasOfferedRef.current = true
    setConnectionStatus('connecting-peer')
    try {
      const stream = await ensureLocalMedia()
      const pc = ensurePeerConnection()
      if (pc.getSenders().length === 0) {
        for (const track of stream.getTracks()) pc.addTrack(track, stream)
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socketRef.current?.emit('meeting:signal', { data: { type: 'offer', sdp: offer.sdp } })
    } catch {
      hasOfferedRef.current = false
      setErrorMessage('Camera/microphone access is needed to join this meeting.')
      setConnectionStatus('error')
    }
  }, [ensureLocalMedia, ensurePeerConnection])

  const handleOffer = useCallback(
    async (sdp: string) => {
      setConnectionStatus('connecting-peer')
      try {
        const stream = await ensureLocalMedia()
        const pc = ensurePeerConnection()
        if (pc.getSenders().length === 0) {
          for (const track of stream.getTracks()) pc.addTrack(track, stream)
        }
        await pc.setRemoteDescription({ type: 'offer', sdp })
        for (const candidate of pendingCandidatesRef.current.splice(0)) {
          await pc.addIceCandidate(candidate)
        }
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socketRef.current?.emit('meeting:signal', { data: { type: 'answer', sdp: answer.sdp } })
      } catch {
        setErrorMessage('Camera/microphone access is needed to join this meeting.')
        setConnectionStatus('error')
      }
    },
    [ensureLocalMedia, ensurePeerConnection],
  )

  const handleAnswer = useCallback(async (sdp: string) => {
    const pc = peerConnectionRef.current
    if (!pc) return
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp })
      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        await pc.addIceCandidate(candidate)
      }
    } catch {
      // Also invoked as bare `void handleAnswer(...)` from the signal handler below — never
      // let a stale/invalid SDP answer surface as an unhandled promise rejection.
      setErrorMessage('The connection to the other participant was interrupted.')
      setConnectionStatus('error')
    }
  }, [])

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current
    if (!pc || !pc.remoteDescription) {
      pendingCandidatesRef.current.push(candidate)
      return
    }
    try {
      await pc.addIceCandidate(candidate)
    } catch {
      // A single rejected candidate (e.g. one that arrived from a now-stale negotiation round)
      // is not fatal — other candidates can still complete the connection. Also invoked as bare
      // `void handleIceCandidate(...)` from the signal handler below, so this must never throw.
    }
  }, [])

  useEffect(() => {
    if (!myRole) return
    let cancelled = false
    const socket = io('/meeting', { path: '/socket.io' })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('meeting:join', { meetingId })
    })

    socket.on('meeting:joined', (payload: { status: string; participants: MeetingRole[] }) => {
      if (cancelled) return
      setParticipants(payload.participants)
      setConnectionStatus(payload.participants.length >= 2 ? 'connecting-peer' : 'waiting-for-peer')
      void ensureLocalMedia().catch(() => setErrorMessage('Camera/microphone access is needed to join this meeting.'))
    })

    socket.on('meeting:peer-joined', (payload: { role: MeetingRole }) => {
      if (cancelled) return
      setParticipants((prev) => (prev.includes(payload.role) ? prev : [...prev, payload.role]))
      void createOffer()
    })

    socket.on('meeting:peer-left', (payload: { role: MeetingRole }) => {
      if (cancelled) return
      setParticipants((prev) => prev.filter((role) => role !== payload.role))
      setRemoteStream(null)
      setConnectionStatus('waiting-for-peer')
      peerConnectionRef.current?.close()
      peerConnectionRef.current = null
      // The next createOffer() (once the peer rejoins) must be allowed to run again — this flag
      // only guards against a duplicate offer on the SAME still-open connection, not a fresh one.
      hasOfferedRef.current = false
      // Any ICE candidates still queued belonged to the connection that just closed — replaying
      // them onto the NEW RTCPeerConnection created on rejoin would apply candidates from an
      // unrelated SDP session, which addIceCandidate would reject (now caught above, but still
      // pointless work and log noise). Discard them the same moment the connection itself is torn down.
      pendingCandidatesRef.current = []
    })

    socket.on('meeting:signal', (payload: SignalPayload) => {
      if (cancelled) return
      const { data } = payload
      if (data.type === 'offer' && data.sdp) void handleOffer(data.sdp)
      else if (data.type === 'answer' && data.sdp) void handleAnswer(data.sdp)
      else if (data.type === 'ice-candidate' && data.candidate) void handleIceCandidate(data.candidate)
    })

    socket.on('meeting:chat', (payload: MeetingChatMessage) => {
      if (cancelled) return
      setChatMessages((prev) => [...prev, payload])
    })

    socket.on('meeting:raise-hand', (payload: { raised: boolean }) => {
      if (cancelled) return
      setPeerRaisedHand(payload.raised)
    })

    socket.on('meeting:error', (payload: { message: string }) => {
      if (cancelled) return
      setErrorMessage(payload.message)
      setConnectionStatus('error')
    })

    socket.on('connect_error', () => {
      if (cancelled) return
      setErrorMessage('Could not connect to the meeting.')
      setConnectionStatus('error')
    })

    return () => {
      cancelled = true
      socket.emit('meeting:leave')
      socket.disconnect()
      socketRef.current = null
      peerConnectionRef.current?.close()
      peerConnectionRef.current = null
      hasOfferedRef.current = false
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
      // Stop the screen-capture track too if the user was still sharing when they navigated
      // away — otherwise the browser's "you are sharing your screen" indicator (and the OS
      // capture permission) stays active after leaving the meeting.
      screenStreamRef.current?.getTracks().forEach((track) => track.stop())
      screenStreamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, myRole])

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setIsMicOn(track.enabled)
  }, [])

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setIsCameraOn(track.enabled)
  }, [])

  /** Stops whatever screen-capture stream is currently active (if any) and swaps the camera
   * track back onto the sender. Shared by both the in-app "stop sharing" button and the
   * browser's own "Stop sharing" bar (screenTrack.onended below) — without actually calling
   * .stop() on every track here, the browser's capture indicator and OS-level permission stay
   * active even after the app's UI says sharing has ended. */
  const stopScreenShare = useCallback(() => {
    const pc = peerConnectionRef.current
    const cameraTrack = cameraTrackRef.current
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video')
    if (sender && cameraTrack) void sender.replaceTrack(cameraTrack)
    screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
    setIsScreenSharing(false)
  }, [])

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare()
      return
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const screenTrack = displayStream.getVideoTracks()[0]
      if (!screenTrack) return
      screenStreamRef.current = displayStream
      const pc = peerConnectionRef.current
      const sender = pc?.getSenders().find((s) => s.track?.kind === 'video')
      if (sender) await sender.replaceTrack(screenTrack)
      setIsScreenSharing(true)
      // Fires when the user stops sharing from the BROWSER's own "Stop sharing" bar, rather
      // than this app's button — must go through the same cleanup path either way.
      screenTrack.onended = () => stopScreenShare()
    } catch {
      // The user cancelled the screen-picker dialog — not an error worth surfacing.
    }
  }, [isScreenSharing, stopScreenShare])

  const toggleRaiseHand = useCallback(() => {
    setIsHandRaised((prev) => {
      const next = !prev
      socketRef.current?.emit('meeting:raise-hand', { raised: next })
      return next
    })
  }, [])

  const sendChatMessage = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    socketRef.current?.emit('meeting:chat', { message: trimmed })
  }, [])

  const leaveMeeting = useCallback(() => {
    socketRef.current?.emit('meeting:leave')
    socketRef.current?.disconnect()
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    // Matches the effect cleanup's screen-share handling below — an explicit "Leave" click
    // while still screen-sharing must stop that capture here too, not only rely on the
    // unmount effect that (today) happens to run right after this, since navigate() is the
    // caller's responsibility, not this function's.
    screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
  }, [])

  return {
    connectionStatus,
    errorMessage,
    localStream,
    remoteStream,
    isMicOn,
    isCameraOn,
    isScreenSharing,
    participants,
    peerRaisedHand,
    isHandRaised,
    chatMessages,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    toggleRaiseHand,
    sendChatMessage,
    leaveMeeting,
  }
}
