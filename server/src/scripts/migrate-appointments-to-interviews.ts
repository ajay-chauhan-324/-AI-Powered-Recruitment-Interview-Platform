import mongoose from 'mongoose'
import { connectDb, disconnectDb } from '../config/db.js'

/**
 * One-time migration for the Appointment -> Interview domain rename (see CLAUDE.md's
 * "PRODUCT PIVOT" notice). Copies every document from the old `appointments` collection into
 * the new `interviews` collection the Interview model reads/writes, translating the renamed
 * fields (name -> candidateName, email -> candidateEmail, purpose -> title) and backfilling
 * sensible defaults for the new interview-specific fields that didn't exist before
 * (interviewType: 'custom', round: 1, locationType: 'video', everything else blank).
 *
 * Idempotent: does nothing if `appointments` doesn't exist or is empty, and skips any
 * document whose _id already exists in `interviews` (so re-running after a partial failure
 * is safe). Does NOT drop the old collection — that's a manual follow-up once you've
 * confirmed the migrated data looks right; see the printed summary for exact counts.
 *
 * Usage: npm run migrate:interviews
 */
async function main() {
  await connectDb()
  const db = mongoose.connection.db
  if (!db) throw new Error('No database connection available.')

  const collections = await db.listCollections({ name: 'appointments' }).toArray()
  if (collections.length === 0) {
    console.log('No `appointments` collection found — nothing to migrate.')
    await disconnectDb()
    return
  }

  const oldDocs = await db.collection('appointments').find({}).toArray()
  if (oldDocs.length === 0) {
    console.log('`appointments` collection exists but is empty — nothing to migrate.')
    await disconnectDb()
    return
  }

  const interviews = db.collection('interviews')
  let migrated = 0
  let skipped = 0

  for (const doc of oldDocs) {
    const existing = await interviews.findOne({ _id: doc._id })
    if (existing) {
      skipped += 1
      continue
    }

    await interviews.insertOne({
      _id: doc._id,
      title: doc.purpose ?? 'Interview',
      description: '',
      interviewType: 'custom',
      round: 1,
      locationType: 'video',
      meetingUrl: '',
      address: '',
      interviewerName: '',
      interviewerEmail: '',
      candidateName: doc.name ?? 'Unknown candidate',
      candidateEmail: doc.email ?? '',
      candidatePhone: '',
      candidateLinkedIn: '',
      candidateGithub: '',
      candidatePortfolioUrl: '',
      candidateResumeUrl: '',
      candidateNotes: '',
      startAt: doc.startAt,
      endAt: doc.endAt,
      durationMinutes: doc.durationMinutes,
      timezone: doc.timezone,
      status: doc.status,
      source: doc.source,
      manageTokenHash: doc.manageTokenHash,
      rescheduleHistory: [],
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    })
    migrated += 1
  }

  console.log(`Migration complete: ${migrated} document(s) migrated, ${skipped} already present and skipped.`)
  console.log('The old `appointments` collection was left in place — drop it manually once you\'ve verified the migrated data.')

  await disconnectDb()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
