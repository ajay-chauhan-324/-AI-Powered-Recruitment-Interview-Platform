import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AppError } from '../middleware/errorHandler.js'
import { UserModel } from '../models/User.model.js'

/**
 * Local-disk storage for candidate profile photos — mirrors resume.service.ts's storage
 * abstraction exactly (same swap-later-to-S3 rationale), kept as a separate module because
 * photos and resumes have different accepted formats/size limits and no other overlap.
 */
const STORAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/avatars')

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

export const ALLOWED_AVATAR_MIME_TYPES = Object.keys(EXTENSION_BY_MIME)
export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

const MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_MIME).map(([mime, ext]) => [ext, mime]),
)

/** Maps a storage key's extension back to its content-type — used by every route that
 * streams a photo back (own-profile and recruiter-viewing-candidate alike). */
export function mimeTypeForAvatarKey(storageKey: string): string {
  const extension = storageKey.slice(storageKey.lastIndexOf('.'))
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

async function ensureStorageRoot(): Promise<void> {
  await fs.mkdir(STORAGE_ROOT, { recursive: true })
}

function resolveStoragePath(storageKey: string): string {
  const resolved = path.resolve(STORAGE_ROOT, storageKey)
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new AppError('INVALID_STORAGE_KEY', 'Invalid photo reference.', 400)
  }
  return resolved
}

async function deletePhotoFile(storageKey: string): Promise<void> {
  try {
    await fs.unlink(resolveStoragePath(storageKey))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export async function readAvatarFile(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveStoragePath(storageKey))
}

/** Replaces whatever photo the user previously had (single photo per account, unlike the
 * multi-resume model) — the old file is removed once the new one is safely written. */
export async function saveAvatarForUser(userId: string, buffer: Buffer, mimeType: string): Promise<string> {
  const extension = EXTENSION_BY_MIME[mimeType]
  if (!extension) {
    throw new AppError('UNSUPPORTED_PHOTO_FORMAT', 'Only JPEG, PNG, or WebP photos are supported.', 400)
  }
  await ensureStorageRoot()
  const user = await UserModel.findById(userId)
  if (!user) throw new AppError('UNAUTHORIZED', 'Invalid or expired session.', 401)

  const previousKey = user.photoKey
  const storageKey = `${userId}-${crypto.randomUUID()}${extension}`
  await fs.writeFile(resolveStoragePath(storageKey), buffer)
  user.photoKey = storageKey
  await user.save()

  if (previousKey) await deletePhotoFile(previousKey)
  return storageKey
}

export async function deleteAvatarForUser(userId: string): Promise<void> {
  const user = await UserModel.findById(userId)
  if (!user) throw new AppError('UNAUTHORIZED', 'Invalid or expired session.', 401)
  if (!user.photoKey) return
  const previousKey = user.photoKey
  user.photoKey = ''
  await user.save()
  await deletePhotoFile(previousKey)
}
