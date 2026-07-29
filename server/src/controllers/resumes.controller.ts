import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../middleware/errorHandler.js'
import {
  createResumeRecord,
  deleteResumeRecord,
  extractResumeText,
  getResumeOwnedByUser,
  listResumesForUser,
  readResumeFile,
  saveResumeFile,
  setDefaultResume,
} from '../services/resume.service.js'
import type { ResumeDocument } from '../models/Resume.model.js'

/** Express 5 types a route param as string | string[] | undefined (repeated-param patterns
 * aren't possible for these routes, but the type doesn't know that). */
function requireStringParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError('NOT_FOUND', 'Resume not found.', 404)
  }
  return value
}

function toJson(resume: ResumeDocument) {
  return {
    id: resume._id.toString(),
    fileName: resume.fileName,
    mimeType: resume.mimeType,
    sizeBytes: resume.sizeBytes,
    isDefault: resume.isDefault,
    createdAt: resume.createdAt,
  }
}

export async function getResumes(req: Request, res: Response, next: NextFunction) {
  try {
    const resumes = await listResumesForUser(req.user!.userId)
    res.status(200).json({ resumes: resumes.map(toJson) })
  } catch (error) {
    next(error)
  }
}

export async function postResume(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new AppError('VALIDATION_ERROR', 'A resume file is required.', 400)
    }
    const { buffer, mimetype, originalname, size } = req.file
    const extractedText = await extractResumeText(buffer, mimetype)
    const storageKey = await saveResumeFile(buffer, mimetype)
    const resume = await createResumeRecord(req.user!.userId, {
      fileName: originalname,
      storageKey,
      mimeType: mimetype,
      sizeBytes: size,
      extractedText,
    })
    res.status(201).json({ resume: toJson(resume) })
  } catch (error) {
    next(error)
  }
}

export async function patchResumeDefault(req: Request, res: Response, next: NextFunction) {
  try {
    const resume = await setDefaultResume(req.user!.userId, requireStringParam(req.params.id))
    res.status(200).json({ resume: toJson(resume) })
  } catch (error) {
    next(error)
  }
}

export async function deleteResume(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteResumeRecord(req.user!.userId, requireStringParam(req.params.id))
    res.status(200).json({ ok: true })
  } catch (error) {
    next(error)
  }
}

export async function getResumeFile(req: Request, res: Response, next: NextFunction) {
  try {
    const resume = await getResumeOwnedByUser(req.user!.userId, requireStringParam(req.params.id))
    if (!resume) throw new AppError('NOT_FOUND', 'Resume not found.', 404)
    const buffer = await readResumeFile(resume.storageKey)
    res.setHeader('Content-Type', resume.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(resume.fileName)}"`)
    res.status(200).send(buffer)
  } catch (error) {
    next(error)
  }
}
