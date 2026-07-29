import { isValidObjectId, Types } from 'mongoose'
import {
  ApplicationModel,
  MANUAL_APPLICATION_STATUSES,
  type ApplicationDocument,
  type ApplicationStatus,
  type ManualApplicationStatus,
} from '../models/Application.model.js'
import { JobModel } from '../models/Job.model.js'
import { UserModel } from '../models/User.model.js'
import { AppError } from '../middleware/errorHandler.js'
import { getResumeById, getResumeOwnedByUser } from './resume.service.js'
import type { ResumeDocument } from '../models/Resume.model.js'
import { createInterview } from './interview.service.js'
import type { InterviewLocationType } from '../models/Interview.model.js'
import { analyzeResumeAgainstJob, AtsAnalysisUnavailableError } from '../ai/atsAnalysis.service.js'
import { getOrCreateScheduleConfigForRecruiter } from './scheduleConfig.service.js'
import { findAvailableSlots, type AvailableSlot } from './availability.service.js'
import { sendRoundReadyEmail } from './notifications/notification.service.js'

/**
 * The recruitment pipeline's authoritative service — mirrors interview.service.ts's role
 * for the scheduling domain. Ownership is always re-verified server-side here (job belongs
 * to the recruiter; application belongs to the candidate), never trusted from a route param
 * alone — this is the actual IDOR boundary for every recruiter/candidate action below.
 */

export async function createApplication(
  candidateId: string,
  jobId: string,
  resumeId: string,
): Promise<ApplicationDocument> {
  if (!isValidObjectId(jobId)) throw new AppError('NOT_FOUND', 'Job not found.', 404)
  const job = await JobModel.findOne({ _id: jobId, status: 'published' })
  if (!job) throw new AppError('NOT_FOUND', 'Job not found or no longer accepting applications.', 404)

  const resume = await getResumeOwnedByUser(candidateId, resumeId)
  if (!resume) throw new AppError('NOT_FOUND', 'Resume not found.', 404)

  const existing = await ApplicationModel.findOne({ jobId, candidateId })
  if (existing) throw new AppError('DUPLICATE_APPLICATION', 'You have already applied to this job.', 409)

  // Snapshot the job's pipeline onto this application, all locked — an edit to the job's
  // pipeline afterward never retroactively changes an already-submitted application's rounds.
  const rounds = job.pipeline
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({
      order: stage.order,
      type: stage.type,
      title: stage.title,
      durationMinutes: stage.durationMinutes,
      instructions: stage.instructions,
      status: 'locked' as const,
      // A starting point only, from the job's default — the recruiter still picks the actual
      // meeting link/interviewer per candidate when they unlock the round
      // (advanceApplicationRound); everything else about the round's logistics is configured
      // there, not duplicated onto the job's pipeline definition.
      locationType: stage.locationType ?? 'video',
    }))

  const application = await ApplicationModel.create({ jobId, candidateId, resumeId, status: 'applied', rounds })

  // Best-effort — a failed/unavailable AI provider must never fail the application itself
  // (CLAUDE.md's AI principle; see the "AI analysis temporarily unavailable" empty state).
  try {
    const analysis = await analyzeResumeAgainstJob(resume.extractedText, {
      title: job.title,
      description: job.description,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      minExperienceYears: job.minExperienceYears,
      experienceLevel: job.experienceLevel,
      educationRequirement: job.educationRequirement,
    })
    application.atsAnalysis = { ...analysis, analyzedAt: new Date() }
    await application.save()
  } catch (error) {
    if (!(error instanceof AtsAnalysisUnavailableError)) {
      console.error('[ats] unexpected analysis failure:', error)
    }
  }

  return application
}

/** Company name is nested-populated alongside the job — the candidate-facing application
 * list and the interview-invitation cards it powers (InterviewsPage.tsx) both need to show
 * "Job title — Company" without a separate round-trip per application. */
const JOB_WITH_COMPANY_POPULATE = {
  path: 'jobId',
  select: 'title companyId location employmentType workplaceType status',
  populate: { path: 'companyId', select: 'name' },
} as const

export async function listApplicationsForCandidate(candidateId: string): Promise<ApplicationDocument[]> {
  return ApplicationModel.find({ candidateId }).populate(JOB_WITH_COMPANY_POPULATE).sort({ createdAt: -1 })
}

export async function getApplicationForCandidate(candidateId: string, applicationId: string): Promise<ApplicationDocument> {
  if (!isValidObjectId(applicationId)) throw new AppError('NOT_FOUND', 'Application not found.', 404)
  const application = await ApplicationModel.findOne({ _id: applicationId, candidateId }).populate(JOB_WITH_COMPANY_POPULATE)
  if (!application) throw new AppError('NOT_FOUND', 'Application not found.', 404)
  return application
}

async function getJobOwnedByRecruiterOrThrow(recruiterId: string, jobId: string) {
  const job = await JobModel.findOne({ _id: jobId, recruiterId })
  if (!job) throw new AppError('NOT_FOUND', 'Job not found.', 404)
  return job
}

export async function listApplicationsForJob(recruiterId: string, jobId: string): Promise<ApplicationDocument[]> {
  if (!isValidObjectId(jobId)) throw new AppError('NOT_FOUND', 'Job not found.', 404)
  await getJobOwnedByRecruiterOrThrow(recruiterId, jobId)
  // Highest AI match score first (MongoDB's BSON ordering puts null/missing scores — a
  // still-pending or failed analysis — after numbers in a descending sort, so those
  // naturally fall to the bottom without special-casing them). createdAt is only a
  // tiebreaker for equal/absent scores.
  return ApplicationModel.find({ jobId })
    .populate({
      path: 'candidateId',
      select: 'name email headline about location skills experienceLevel linkedIn github portfolioUrl photoKey education experience projects',
    })
    .populate({ path: 'resumeId', select: 'fileName' })
    .sort({ 'atsAnalysis.score': -1, createdAt: -1 })
}

export interface RecruiterApplicationsFilter {
  jobId?: string
  status?: ApplicationStatus
  /** Matches a candidate's skills array, case-insensitively — powers the recruiter AI's
   * "best React candidate" / "AWS candidates" style questions. */
  skill?: string
  limit?: number
}

/** The AI-facing counterpart to listApplicationsForJob: same ATS-score ordering and
 * ownership scoping, but across every one of the recruiter's jobs at once (jobId omitted) or
 * narrowed to one (jobId given), with optional status/skill filtering and a result cap — for
 * questions like "who's my best candidate overall" or "who's waiting for review" that aren't
 * naturally scoped to a single job the recruiter has already named. */
export async function listApplicationsForRecruiter(
  recruiterId: string,
  filter: RecruiterApplicationsFilter = {},
): Promise<ApplicationDocument[]> {
  let jobIds: string[]
  if (filter.jobId) {
    const job = await getJobOwnedByRecruiterOrThrow(recruiterId, filter.jobId)
    jobIds = [job._id.toString()]
  } else {
    const jobs = await JobModel.find({ recruiterId }).select('_id')
    jobIds = jobs.map((job) => job._id.toString())
  }
  if (jobIds.length === 0) return []

  const match: Record<string, unknown> = { jobId: { $in: jobIds } }
  if (filter.status) match.status = filter.status

  const query = ApplicationModel.find(match)
    .populate({
      path: 'candidateId',
      select: 'name email headline about location skills experienceLevel linkedIn github portfolioUrl photoKey education experience projects',
    })
    .populate({ path: 'jobId', select: 'title' })
    .sort({ 'atsAnalysis.score': -1, createdAt: -1 })

  // Skill matching happens in JS below (it filters on a populated candidate profile array,
  // not something the query itself can express) — applying `.limit()` before that filter runs
  // could cut off matching candidates before they're ever checked. Only push the limit down to
  // the database when there's no skill filter to apply afterward; the skill-filter branch
  // slices to `limit` itself, once it knows the true matching set.
  if (filter.limit && !filter.skill) {
    query.limit(filter.limit)
  }

  let applications = await query

  if (filter.skill) {
    const needle = filter.skill.trim().toLowerCase()
    applications = applications.filter((application) => {
      const candidate = application.candidateId as unknown as { skills?: string[] } | null
      return (candidate?.skills ?? []).some((skill) => skill.toLowerCase().includes(needle))
    })
    if (filter.limit) applications = applications.slice(0, filter.limit)
  }

  return applications
}

/** Ownership-checked via the parent job, not the application id alone — a recruiter must
 * own the job an application belongs to before seeing/acting on it. */
async function getApplicationForRecruiterOrThrow(recruiterId: string, applicationId: string): Promise<ApplicationDocument> {
  if (!isValidObjectId(applicationId)) throw new AppError('NOT_FOUND', 'Application not found.', 404)
  const application = await ApplicationModel.findById(applicationId).populate({
    path: 'candidateId',
    select: 'name email headline about location skills experienceLevel linkedIn github portfolioUrl photoKey education experience projects',
  })
  if (!application) throw new AppError('NOT_FOUND', 'Application not found.', 404)
  await getJobOwnedByRecruiterOrThrow(recruiterId, application.jobId.toString())
  return application
}

export async function getApplicationForRecruiter(recruiterId: string, applicationId: string): Promise<ApplicationDocument> {
  return getApplicationForRecruiterOrThrow(recruiterId, applicationId)
}

/** A recruiter may read the resume attached to an application to a job they own — this is
 * NOT the same authorization as getResumeOwnedByUser (that's for the candidate's own resume
 * management); ownership here flows through the job, not the Resume record itself. */
export async function getApplicationResumeForRecruiter(recruiterId: string, applicationId: string): Promise<ResumeDocument> {
  const application = await getApplicationForRecruiterOrThrow(recruiterId, applicationId)
  const resume = await getResumeById(application.resumeId.toString())
  if (!resume) throw new AppError('NOT_FOUND', 'Resume not found.', 404)
  return resume
}

export async function updateApplicationStatus(
  recruiterId: string,
  applicationId: string,
  status: ManualApplicationStatus,
): Promise<ApplicationDocument> {
  if (!MANUAL_APPLICATION_STATUSES.includes(status)) {
    // interview_in_progress/selected are round-driven only — see unlockNextRound/
    // recordRoundOutcome. A recruiter (or the recruiter-mode AI tool) can never set them by hand.
    throw new AppError('VALIDATION_ERROR', 'That status can only change as interview rounds progress.', 400)
  }
  const application = await getApplicationForRecruiterOrThrow(recruiterId, applicationId)
  application.status = status
  // Shortlisting automatically unlocks the candidate's first interview round — there is no
  // separate manual "unlock" step (CLAUDE.md's recruitment pivot: round progression is fully
  // automatic, driven only by shortlist/pass). unlockNextRound no-ops harmlessly if round 1 is
  // already unlocked (e.g. the recruiter shortlists again later in the pipeline).
  if (status === 'shortlisted') {
    const unlocked = unlockNextRound(application)
    if (application.rounds.some((round) => round.status !== 'locked')) {
      application.status = 'interview_in_progress'
    }
    await application.save()
    if (unlocked) void notifyRoundReady(application, unlocked)
    return application
  }
  await application.save()
  return application
}

export async function addRecruiterNotes(recruiterId: string, applicationId: string, notes: string): Promise<ApplicationDocument> {
  const application = await getApplicationForRecruiterOrThrow(recruiterId, applicationId)
  application.recruiterNotes = notes
  await application.save()
  return application
}

/** The only next locked round is ever unlockable at once — a candidate's previous round
 * must be passed before the following one becomes bookable (CLAUDE.md §11: "must not
 * accidentally unlock multiple future rounds at once"). */
function nextUnlockableOrder(application: ApplicationDocument): number {
  return application.rounds.filter((round) => round.status === 'passed').length + 1
}

/** Unlocks exactly the next locked round, fully automatically — no recruiter input required.
 * A round's location/type/duration were already cloned from the job's pipeline stage at
 * application-creation time (createApplication above); interviewer name/meeting link/address
 * simply stay blank until the recruiter chooses to fill them in (recordRoundOutcome and
 * updateApplicationStatus are the only two callers, on PASS and on shortlist respectively —
 * there is no separate manual "unlock" action a recruiter must perform, per CLAUDE.md's
 * recruitment-pipeline pivot). No-ops if the next round isn't currently locked, so callers can
 * invoke this idempotently without checking state first. */
function unlockNextRound(application: ApplicationDocument): ApplicationDocument['rounds'][number] | undefined {
  const order = nextUnlockableOrder(application)
  const round = application.rounds.find((candidate) => candidate.order === order && candidate.status === 'locked')
  if (round) round.status = 'ready_to_book'
  return round
}

/** Tells the candidate a round just unlocked and is ready to book — this is what replaces the
 * AI as the thing that surfaces "you can book now" (this product's decision that booking must
 * never depend on the AI). Best-effort and never awaited by callers — a failed/unavailable
 * notification transport must never block the actual round-unlock, matching
 * interview.service.ts's notifySafely pattern. */
async function notifyRoundReady(application: ApplicationDocument, round: ApplicationDocument['rounds'][number]): Promise<void> {
  try {
    const job = await JobModel.findById(application.jobId).select('title')
    const candidate = application.candidateId as unknown as { name?: string; email?: string } | null
    if (!job || !candidate?.email) return
    await sendRoundReadyEmail({
      candidateName: candidate.name ?? '',
      candidateEmail: candidate.email,
      jobTitle: job.title,
      roundTitle: round.title,
      round: round.order,
    })
  } catch (error) {
    console.error('[notification] failed to send round-ready email:', error)
  }
}

export async function recordRoundOutcome(
  recruiterId: string,
  applicationId: string,
  order: number,
  outcome: 'passed' | 'failed',
): Promise<ApplicationDocument> {
  const application = await getApplicationForRecruiterOrThrow(recruiterId, applicationId)
  const round = application.rounds.find((candidate) => candidate.order === order)
  if (!round) throw new AppError('NOT_FOUND', 'Interview round not found.', 404)
  if (round.status !== 'scheduled') {
    throw new AppError('INVALID_STATE', 'Only a scheduled round can be marked passed or failed.', 400)
  }

  round.status = outcome
  let unlocked: ApplicationDocument['rounds'][number] | undefined
  if (outcome === 'failed') {
    application.status = 'rejected'
  } else {
    const isLastRound = application.rounds.every((candidate) => candidate.order <= order)
    if (isLastRound) {
      application.status = 'selected'
    } else {
      // Passing automatically unlocks the next round — no separate manual unlock step.
      unlocked = unlockNextRound(application)
      application.status = 'interview_in_progress'
    }
  }
  await application.save()
  if (unlocked) void notifyRoundReady(application, unlocked)
  return application
}

/** The single round a candidate may currently act on — never an arbitrary one (CLAUDE.md's
 * core rule). Shared by scheduleApplicationInterview and getApplicationRoundAvailability so
 * both agree on exactly which round "book now" refers to. */
function getReadyToBookRound(application: ApplicationDocument): ApplicationDocument['rounds'][number] {
  const round = application.rounds.find((candidate) => candidate.status === 'ready_to_book')
  if (!round) {
    throw new AppError('INVALID_STATE', 'This application has no interview round ready to book.', 400)
  }
  return round
}

/**
 * Real, live availability for the one round a candidate may currently book — reads the
 * owning recruiter's own calendar (CLAUDE.md §36 second pivot: "the recruiter calendar
 * becomes the source of truth") through the exact same AvailabilityService every other
 * booking path uses, never a second/invented notion of free time. Powers the candidate-
 * facing Interview Scheduler dialog (replacing its previous use of the legacy global
 * availability endpoint, which had no idea which recruiter's calendar it should even be
 * checking).
 */
export async function getApplicationRoundAvailability(
  candidateId: string,
  applicationId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ slots: AvailableSlot[]; timezone: string; durationMinutes: number }> {
  const application = await getApplicationForCandidate(candidateId, applicationId)
  const round = getReadyToBookRound(application)
  const job = await JobModel.findById(application.jobId)
  if (!job) throw new AppError('NOT_FOUND', 'Job not found.', 404)

  const recruiterId = job.recruiterId.toString()
  const config = await getOrCreateScheduleConfigForRecruiter(recruiterId)
  const slots = await findAvailableSlots({
    rangeStart,
    rangeEnd,
    durationMinutes: round.durationMinutes,
    recruiterId,
  })

  return { slots, timezone: config.timezone, durationMinutes: round.durationMinutes }
}

/**
 * The candidate's half of the pipeline flow: books a real slot for whichever single round
 * the recruiter has unlocked (never an arbitrary round — CLAUDE.md's core rule), which
 * reuses the existing InterviewService.createInterview — the SAME conflict-safe,
 * transaction-protected booking engine every other interview path uses (never a second
 * scheduling engine). Duration/type/location come from the round's own configuration, never
 * from the candidate's request, so a candidate can't request a different-length slot than
 * the recruiter configured for that round.
 */
export async function scheduleApplicationInterview(
  candidateId: string,
  applicationId: string,
  startAt: Date,
  // Deliberately unused — the interview always runs on ITS OWN RECRUITER'S calendar timezone
  // (resolved below from that recruiter's ScheduleConfig, CLAUDE.md §36 second pivot: "the
  // recruiter calendar becomes the source of truth"), never a timezone the caller supplies
  // (AI tool or the direct REST /applications/:id/schedule route alike) — kept as a parameter
  // only for backward-compatible call signatures.
  _timezone: string,
) {
  const application = await getApplicationForCandidate(candidateId, applicationId)
  const round = getReadyToBookRound(application)

  const job = await JobModel.findById(application.jobId)
  if (!job) throw new AppError('NOT_FOUND', 'Job not found.', 404)
  const candidate = await UserModel.findById(candidateId)
  if (!candidate) throw new AppError('NOT_FOUND', 'Candidate account not found.', 404)

  const recruiterId = job.recruiterId.toString()
  const config = await getOrCreateScheduleConfigForRecruiter(recruiterId)

  const { interview, manageToken } = await createInterview(
    {
      title: `${job.title} — ${round.title}`,
      interviewType: round.type,
      round: round.order,
      locationType: (round.locationType ?? 'video') as InterviewLocationType,
      meetingUrl: round.meetingUrl,
      address: round.address,
      interviewerName: round.interviewerName,
      interviewerEmail: round.interviewerEmail,
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      startAt,
      durationMinutes: round.durationMinutes,
      timezone: config.timezone,
      source: 'public',
    },
    candidateId,
    recruiterId,
  )

  interview.jobId = job._id
  interview.applicationId = application._id
  await interview.save()

  round.status = 'scheduled'
  round.interviewId = interview._id
  await application.save()

  return { application, interview, manageToken }
}

/** A bare count per job — safe for the public job listing/detail (unlike every other
 * function in this file, this deliberately has no ownership check, since "how many people
 * applied" reveals nothing about who they are). One aggregation query, not N+1. */
export async function countApplicationsByJob(jobIds: string[]): Promise<Map<string, number>> {
  if (jobIds.length === 0) return new Map()
  const rows = await ApplicationModel.aggregate<{ _id: string; count: number }>([
    { $match: { jobId: { $in: jobIds.map((id) => new Types.ObjectId(id)) } } },
    { $group: { _id: '$jobId', count: { $sum: 1 } } },
  ])
  return new Map(rows.map((row) => [row._id.toString(), row.count]))
}
