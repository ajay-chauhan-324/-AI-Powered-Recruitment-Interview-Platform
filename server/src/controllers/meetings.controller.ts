import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../middleware/errorHandler.js'
import { UserModel } from '../models/User.model.js'
import { findInterviewOwnedByUser, getInterviewByMeetingId, getInterviewOwnedByRecruiter } from '../services/interview.service.js'

function requireStringParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new AppError('NOT_FOUND', 'Meeting not found.', 404)
  return value
}

/**
 * Pre-join metadata for the Meeting Room page — reachable by either role (candidate or
 * recruiter), unlike every other route in this codebase which is scoped to exactly one. This
 * re-verifies the SAME ownership rules those single-role routes already enforce
 * (findInterviewOwnedByUser / getInterviewOwnedByRecruiter), just tries both since either role
 * legitimately lands here. Never trusts accountType from the session claim — always re-reads
 * the user fresh from the database, same as recruiterAuth.ts.
 */
export async function getMeeting(req: Request, res: Response, next: NextFunction) {
  try {
    const meetingId = requireStringParam(req.params.meetingId)
    const interview = await getInterviewByMeetingId(meetingId)
    if (!interview) throw new AppError('NOT_FOUND', 'Meeting not found.', 404)

    const user = await UserModel.findById(req.user!.userId)
    if (!user) throw new AppError('UNAUTHORIZED', 'Invalid or expired session.', 401)

    let yourRole: 'candidate' | 'recruiter'
    if (user.accountType === 'recruiter') {
      await getInterviewOwnedByRecruiter(user._id.toString(), interview._id.toString())
      yourRole = 'recruiter'
    } else {
      const owned = await findInterviewOwnedByUser(interview._id.toString(), user._id.toString(), user.email)
      if (!owned) throw new AppError('FORBIDDEN', 'You are not a participant in this meeting.', 403)
      yourRole = 'candidate'
    }

    res.status(200).json({
      meeting: {
        interviewId: interview._id.toString(),
        meetingId,
        title: interview.title,
        interviewType: interview.interviewType,
        round: interview.round,
        candidateName: interview.candidateName,
        interviewerName: interview.interviewerName,
        startAt: interview.startAt,
        endAt: interview.endAt,
        timezone: interview.timezone,
        interviewStatus: interview.status,
        meetingStatus: interview.meeting?.status ?? 'not_started',
        yourRole,
      },
    })
  } catch (error) {
    next(error)
  }
}
