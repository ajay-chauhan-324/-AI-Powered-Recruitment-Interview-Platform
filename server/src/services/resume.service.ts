import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFParse } from 'pdf-parse'
import { isValidObjectId } from 'mongoose'
import { AppError } from '../middleware/errorHandler.js'
import { ResumeModel, type ResumeDocument } from '../models/Resume.model.js'
import { ApplicationModel } from '../models/Application.model.js'

/**
 * Local-disk storage abstraction for resume files, isolated behind this module exactly as
 * CLAUDE.md's "no file-storage infrastructure exists" note asked for: no code outside this
 * file knows *how* a resume is stored. Swapping to S3/GCS later means changing only the
 * three functions below — nothing in resume.controller.ts, application.service.ts, or the
 * Resume model would need to change (storageKey is already an opaque string).
 *
 * Files are NEVER served from a public static directory — always through an authenticated,
 * ownership-checked route (routes/resumes.route.ts) that streams the buffer back.
 */
const STORAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/resumes')

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
}

export const ALLOWED_RESUME_MIME_TYPES = Object.keys(EXTENSION_BY_MIME)
export const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_EXTRACTED_TEXT_LENGTH = 20_000

async function ensureStorageRoot(): Promise<void> {
  await fs.mkdir(STORAGE_ROOT, { recursive: true })
}

function resolveStoragePath(storageKey: string): string {
  // storageKey is always a value this module generated itself (never client input threaded
  // through unchanged) — but resolve+contain defensively rather than trust that invariant.
  const resolved = path.resolve(STORAGE_ROOT, storageKey)
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new AppError('INVALID_STORAGE_KEY', 'Invalid resume reference.', 400)
  }
  return resolved
}

export async function saveResumeFile(buffer: Buffer, mimeType: string): Promise<string> {
  const extension = EXTENSION_BY_MIME[mimeType]
  if (!extension) {
    throw new AppError('UNSUPPORTED_RESUME_FORMAT', 'Only PDF or plain-text resumes are supported.', 400)
  }
  await ensureStorageRoot()
  const storageKey = `${crypto.randomUUID()}${extension}`
  await fs.writeFile(resolveStoragePath(storageKey), buffer)
  return storageKey
}

export async function readResumeFile(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveStoragePath(storageKey))
}

export async function deleteResumeFile(storageKey: string): Promise<void> {
  try {
    await fs.unlink(resolveStoragePath(storageKey))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

/**
 * Best-effort plain-text extraction for the ATS analysis pipeline (ai/atsAnalysis.service.ts).
 * DOCX and other formats are explicitly out of scope for v1 (documented in README) — the
 * upload validator only accepts PDF/plain-text in the first place, so this should never see
 * an unsupported mimeType in practice, but stays defensive since it's not the only caller of
 * writeFile's mimeType matching.
 */
export async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  let text: string
  if (mimeType === 'text/plain') {
    text = buffer.toString('utf8')
  } else if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      text = result.text
    } finally {
      await parser.destroy()
    }
  } else {
    throw new AppError('UNSUPPORTED_RESUME_FORMAT', 'Only PDF or plain-text resumes are supported.', 400)
  }
  return text.trim().slice(0, MAX_EXTRACTED_TEXT_LENGTH)
}

// --- Resume records (candidate-facing management: settings page's resume list) ---

const MAX_RESUMES_PER_USER = 10

export async function listResumesForUser(userId: string): Promise<ResumeDocument[]> {
  return ResumeModel.find({ userId }).sort({ createdAt: -1 })
}

/** No ownership check — callers must have already verified the caller is entitled to this
 * resume through some other relationship (e.g. application.service.ts verifying a recruiter
 * owns the job an application belongs to before letting them read the attached resume). */
export async function getResumeById(resumeId: string): Promise<ResumeDocument | null> {
  if (!isValidObjectId(resumeId)) return null
  return ResumeModel.findById(resumeId)
}

export async function getResumeOwnedByUser(userId: string, resumeId: string): Promise<ResumeDocument | null> {
  if (!isValidObjectId(resumeId)) return null
  return ResumeModel.findOne({ _id: resumeId, userId })
}

export interface CreateResumeInput {
  fileName: string
  storageKey: string
  mimeType: string
  sizeBytes: number
  extractedText: string
}

export async function createResumeRecord(userId: string, input: CreateResumeInput): Promise<ResumeDocument> {
  const existingCount = await ResumeModel.countDocuments({ userId })
  if (existingCount >= MAX_RESUMES_PER_USER) {
    await deleteResumeFile(input.storageKey)
    throw new AppError('RESUME_LIMIT_REACHED', `You can keep at most ${MAX_RESUMES_PER_USER} resumes — delete one first.`, 400)
  }
  return ResumeModel.create({ userId, ...input, isDefault: existingCount === 0 })
}

export async function setDefaultResume(userId: string, resumeId: string): Promise<ResumeDocument> {
  const resume = await getResumeOwnedByUser(userId, resumeId)
  if (!resume) throw new AppError('NOT_FOUND', 'Resume not found.', 404)
  await ResumeModel.updateMany({ userId, _id: { $ne: resume._id } }, { $set: { isDefault: false } })
  resume.isDefault = true
  await resume.save()
  return resume
}

export async function deleteResumeRecord(userId: string, resumeId: string): Promise<void> {
  const resume = await getResumeOwnedByUser(userId, resumeId)
  if (!resume) throw new AppError('NOT_FOUND', 'Resume not found.', 404)
  // A resume still attached to an application (any status — including past/rejected ones,
  // which recruiters can still review) must never be hard-deleted: Application.resumeId has
  // no DB-level referential integrity, so deleting it here would leave a dangling reference
  // a recruiter's resume-download view could never recover from.
  const referencingApplication = await ApplicationModel.exists({ resumeId: resume._id })
  if (referencingApplication) {
    throw new AppError(
      'RESUME_IN_USE',
      'This resume is attached to a job application and cannot be deleted.',
      409,
    )
  }
  await resume.deleteOne()
  await deleteResumeFile(resume.storageKey)
  if (resume.isDefault) {
    const nextDefault = await ResumeModel.findOne({ userId }).sort({ createdAt: -1 })
    if (nextDefault) {
      nextDefault.isDefault = true
      await nextDefault.save()
    }
  }
}
