import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../middleware/errorHandler.js'
import { UserModel } from '../models/User.model.js'
import { deleteAvatarForUser, mimeTypeForAvatarKey, readAvatarFile, saveAvatarForUser } from '../services/avatar.service.js'

export async function postAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new AppError('VALIDATION_ERROR', 'A photo file is required.', 400)
    }
    await saveAvatarForUser(req.user!.userId, req.file.buffer, req.file.mimetype)
    res.status(201).json({ ok: true })
  } catch (error) {
    next(error)
  }
}

export async function deleteAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteAvatarForUser(req.user!.userId)
    res.status(200).json({ ok: true })
  } catch (error) {
    next(error)
  }
}

/** Serves the signed-in user's own photo only — a recruiter viewing a candidate's photo goes
 * through the separate ownership-checked route in recruiterApplications.controller.ts. */
export async function getMyAvatarFile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await UserModel.findById(req.user!.userId)
    if (!user || !user.photoKey) throw new AppError('NOT_FOUND', 'No photo uploaded.', 404)
    const buffer = await readAvatarFile(user.photoKey)
    res.setHeader('Content-Type', mimeTypeForAvatarKey(user.photoKey))
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.status(200).send(buffer)
  } catch (error) {
    next(error)
  }
}
