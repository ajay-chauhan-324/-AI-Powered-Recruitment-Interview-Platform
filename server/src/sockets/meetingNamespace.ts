import type { Server as SocketIOServer, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { UserModel } from '../models/User.model.js'
import type { MeetingParticipantRole } from '../models/Interview.model.js'
import {
  findInterviewOwnedByUser,
  getInterviewByMeetingId,
  getInterviewOwnedByRecruiter,
  recordMeetingParticipantJoin,
  recordMeetingParticipantLeave,
} from '../services/interview.service.js'

/**
 * The in-platform Meeting Room's signaling channel — WebRTC offer/answer/ICE relay, chat, and
 * participant join/leave, all scoped to one Socket.IO room per meetingId. This is a NEW
 * namespace (not the existing `/calendar` one, which is an unauthenticated global broadcast —
 * wrong shape for a private 1:1 call), but it reuses the same Socket.IO server instance
 * (initSocketServer already owns the `io` object) and, critically, the SAME ownership checks
 * every REST reschedule/cancel path already uses (getInterviewOwnedByRecruiter/
 * findInterviewOwnedByUser) — knowing a meetingId is never sufficient to join; the connecting
 * session must actually be the candidate or recruiter on that specific interview.
 *
 * The database (Interview.meeting) remains authoritative for participant/status state, exactly
 * like the `/calendar` namespace's own "events are signals, not trusted state" rule — every
 * client re-fetches the interview via REST after a `meeting:joined`/`meeting:peer-joined` event
 * rather than trusting the socket payload as final truth for anything but live UI feedback.
 */

interface UserSessionPayload {
  role: 'user'
  userId: string
  email: string
}

interface SocketAuth {
  userId: string
  email: string
  role: MeetingParticipantRole
}

function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined
}

/** Mirrors userAuth.ts's requireUserAuth exactly (same cookie, same JWT secret, same
 * re-verify-role-from-the-database-never-the-token rule) — Socket.IO connections don't pass
 * through Express middleware, so this is the socket-transport equivalent, not a second
 * authentication scheme. */
async function authenticateSocket(socket: Socket): Promise<SocketAuth | null> {
  const token = parseCookie(socket.handshake.headers.cookie, 'user_session')
  if (!token) return null
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as UserSessionPayload
    if (payload.role !== 'user') return null
    const user = await UserModel.findById(payload.userId)
    if (!user) return null
    return { userId: user._id.toString(), email: user.email, role: user.accountType === 'recruiter' ? 'recruiter' : 'candidate' }
  } catch {
    return null
  }
}

async function isAuthorizedForInterview(auth: SocketAuth, interviewId: string): Promise<boolean> {
  if (auth.role === 'recruiter') {
    try {
      await getInterviewOwnedByRecruiter(auth.userId, interviewId)
      return true
    } catch {
      return false
    }
  }
  return Boolean(await findInterviewOwnedByUser(interviewId, auth.userId, auth.email))
}

function roomNameFor(meetingId: string): string {
  return `meeting:${meetingId}`
}

export function initMeetingNamespace(io: SocketIOServer): void {
  const meetingNamespace = io.of('/meeting')

  meetingNamespace.use((socket, next) => {
    void (async () => {
      const auth = await authenticateSocket(socket)
      if (!auth) {
        next(new Error('UNAUTHORIZED'))
        return
      }
      socket.data.auth = auth as SocketAuth
      next()
    })()
  })

  meetingNamespace.on('connection', (socket) => {
    const auth = socket.data.auth as SocketAuth
    let joinedMeetingId: string | null = null
    let joinedInterviewId: string | null = null

    socket.on('meeting:join', (payload: { meetingId: string }) => {
      void (async () => {
        const meetingId = typeof payload?.meetingId === 'string' ? payload.meetingId : ''
        const interview = meetingId ? await getInterviewByMeetingId(meetingId) : null
        if (!interview) {
          socket.emit('meeting:error', { message: 'Meeting not found.' })
          return
        }
        if (interview.status === 'cancelled') {
          socket.emit('meeting:error', { message: 'This interview was cancelled.' })
          return
        }
        const authorized = await isAuthorizedForInterview(auth, interview._id.toString())
        if (!authorized) {
          socket.emit('meeting:error', { message: 'You are not a participant in this meeting.' })
          return
        }

        const roomName = roomNameFor(meetingId)
        await socket.join(roomName)
        joinedMeetingId = meetingId
        joinedInterviewId = interview._id.toString()

        const updated = await recordMeetingParticipantJoin(joinedInterviewId, auth.role)
        const activeRoles = (updated.meeting?.participants ?? []).filter((p) => !p.leftAt).map((p) => p.role)

        socket.to(roomName).emit('meeting:peer-joined', { role: auth.role })
        socket.emit('meeting:joined', { role: auth.role, status: updated.meeting?.status ?? 'waiting', participants: activeRoles })
      })()
    })

    // WebRTC offer/answer/ICE candidates — relayed opaquely, never inspected or trusted as
    // anything but a pass-through to the one other participant in the room.
    socket.on('meeting:signal', (payload: { data: unknown }) => {
      if (!joinedMeetingId) return
      socket.to(roomNameFor(joinedMeetingId)).emit('meeting:signal', { data: payload?.data, from: auth.role })
    })

    socket.on('meeting:chat', (payload: { message: string }) => {
      if (!joinedMeetingId) return
      const text = typeof payload?.message === 'string' ? payload.message.trim().slice(0, 2000) : ''
      if (!text) return
      // Broadcast to the whole room including the sender (rather than the sender optimistically
      // rendering its own message) so there is exactly one source of truth for message order.
      meetingNamespace.to(roomNameFor(joinedMeetingId)).emit('meeting:chat', { message: text, from: auth.role, at: new Date().toISOString() })
    })

    socket.on('meeting:raise-hand', (payload: { raised: boolean }) => {
      if (!joinedMeetingId) return
      socket.to(roomNameFor(joinedMeetingId)).emit('meeting:raise-hand', { from: auth.role, raised: Boolean(payload?.raised) })
    })

    async function leaveMeeting() {
      if (!joinedInterviewId || !joinedMeetingId) return
      const roomName = roomNameFor(joinedMeetingId)
      await recordMeetingParticipantLeave(joinedInterviewId, auth.role)
      socket.to(roomName).emit('meeting:peer-left', { role: auth.role })
      joinedInterviewId = null
      joinedMeetingId = null
    }

    socket.on('meeting:leave', () => void leaveMeeting())
    socket.on('disconnect', () => void leaveMeeting())
  })
}
