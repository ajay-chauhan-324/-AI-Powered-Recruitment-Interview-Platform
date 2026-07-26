import { Schema, model } from 'mongoose'

/**
 * A single shared document that every booking-mutation transaction writes to
 * as its first operation. This is NOT business data — it exists purely to
 * force MongoDB's real write-conflict detection between two concurrent
 * booking transactions.
 *
 * Why this is necessary: MongoDB transactions use snapshot isolation, not
 * full serializable predicate locking. Two concurrent transactions that each
 * read "no conflicting appointment exists" and then insert two DIFFERENT,
 * overlapping appointment documents will NOT conflict at the storage-engine
 * level — nothing stops both from committing, resulting in an actual double
 * booking. Making every mutation touch this one shared document turns that
 * race into a genuine write-write conflict on the same document, which
 * MongoDB does detect and which `session.withTransaction()` automatically
 * retries (it's a TransientTransactionError) — so the losing transaction
 * re-runs its conflict check against the winner's now-committed data and
 * correctly reports a real conflict instead of silently double-booking.
 */
const bookingLockSchema = new Schema({
  singleton: { type: String, required: true, unique: true, default: 'default', immutable: true },
  version: { type: Number, required: true, default: 0 },
})

export const BookingLockModel = model('BookingLock', bookingLockSchema)
