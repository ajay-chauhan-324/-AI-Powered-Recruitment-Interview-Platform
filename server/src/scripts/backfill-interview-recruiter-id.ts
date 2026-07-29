import mongoose from 'mongoose'
import { connectDb, disconnectDb } from '../config/db.js'

/**
 * One-time backfill for CLAUDE.md §36 second pivot ("recruiter calendar is the source of
 * truth"): InterviewService now scopes every conflict-detection query by `recruiterId`
 * (Interview.model.ts), but that field didn't exist before this change — every interview
 * created through the recruitment pipeline (application.service.ts's
 * scheduleApplicationInterview) prior to this migration has `jobId` set but `recruiterId`
 * still `null`. Left unbackfilled, those older bookings would silently fall into the legacy
 * global calendar's conflict pool instead of their real recruiter's, which could both let a
 * new booking collide with an old one on the same recruiter's calendar and let an old
 * booking wrongly occupy the legacy calendar's availability.
 *
 * Idempotent: only touches interviews with a `jobId` but no `recruiterId` yet, so re-running
 * after a partial failure (or after new pipeline bookings have already backfilled themselves
 * going forward) is safe and a no-op on a second run.
 *
 * Usage: npm run backfill:interview-recruiter-id
 */
async function main() {
  await connectDb()
  const db = mongoose.connection.db
  if (!db) throw new Error('No database connection available.')

  const interviews = db.collection('interviews')
  const jobs = db.collection('jobs')

  const candidates = await interviews
    .find({ jobId: { $ne: null }, recruiterId: null })
    .project({ _id: 1, jobId: 1 })
    .toArray()

  if (candidates.length === 0) {
    console.log('No pipeline-originated interviews need a recruiterId backfill.')
    await disconnectDb()
    return
  }

  const jobIds = [...new Set(candidates.map((doc) => String(doc.jobId)))].map((id) => new mongoose.Types.ObjectId(id))
  const jobDocs = await jobs.find({ _id: { $in: jobIds } }).project({ recruiterId: 1 }).toArray()
  const recruiterIdByJobId = new Map(jobDocs.map((job) => [String(job._id), job.recruiterId]))

  let updated = 0
  let skippedNoJob = 0

  for (const doc of candidates) {
    const recruiterId = recruiterIdByJobId.get(String(doc.jobId))
    if (!recruiterId) {
      skippedNoJob += 1
      continue
    }
    await interviews.updateOne({ _id: doc._id }, { $set: { recruiterId } })
    updated += 1
  }

  console.log(`Backfill complete: ${updated} interview(s) updated, ${skippedNoJob} skipped (job no longer exists).`)

  await disconnectDb()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
