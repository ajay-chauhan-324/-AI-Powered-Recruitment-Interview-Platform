import type { NextFunction, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { UserModel, type UserDocument } from '../models/User.model.js'
import { env } from '../config/env.js'
import { AppError } from '../middleware/errorHandler.js'
import { USER_SESSION_COOKIE, USER_SESSION_DURATION_MS } from '../middleware/userAuth.js'
import { createCompany } from '../services/company.service.js'
import {
  changePasswordInputSchema,
  loginInputSchema,
  registerInputSchema,
  updateProfileInputSchema,
} from '../validators/auth.validators.js'

function setSessionCookie(res: Response, token: string) {
  res.cookie(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: USER_SESSION_DURATION_MS,
  })
}

function issueSession(res: Response, userId: string, email: string) {
  const token = jwt.sign({ role: 'user', userId, email }, env.JWT_SECRET, { expiresIn: '7d' })
  setSessionCookie(res, token)
}

function toPublicUser(user: UserDocument) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    accountType: user.accountType,
    companyId: user.companyId ? user.companyId.toString() : null,
    phone: user.phone ?? '',
    linkedIn: user.linkedIn ?? '',
    github: user.github ?? '',
    portfolioUrl: user.portfolioUrl ?? '',
    photoUrl: user.photoKey ? '/api/v1/me/photo/file' : '',
    headline: user.headline ?? '',
    about: user.about ?? '',
    location: user.location ?? '',
    skills: user.skills ?? [],
    experienceLevel: user.experienceLevel ?? null,
    experience: user.experience ?? [],
    education: user.education ?? [],
    projects: user.projects ?? [],
  }
}

export async function postRegister(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, password, timezone, accountType, companyName } = registerInputSchema.parse(req.body)

    const existing = await UserModel.findOne({ email })
    if (existing) {
      throw new AppError('EMAIL_IN_USE', 'An account with this email already exists.', 409)
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await UserModel.create({ name, email, passwordHash, timezone, accountType })

    if (accountType === 'recruiter') {
      const company = await createCompany(user._id.toString(), companyName!)
      user.companyId = company._id
      await user.save()
    }

    issueSession(res, user._id.toString(), user.email)
    res.status(201).json({ user: toPublicUser(user) })
  } catch (error) {
    next(error)
  }
}

export async function postLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginInputSchema.parse(req.body)
    const user = await UserModel.findOne({ email })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401)
    }
    issueSession(res, user._id.toString(), user.email)
    res.status(200).json({ user: toPublicUser(user) })
  } catch (error) {
    next(error)
  }
}

export function postLogout(_req: Request, res: Response) {
  res.clearCookie(USER_SESSION_COOKIE)
  res.status(200).json({ ok: true })
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await UserModel.findById(req.user!.userId)
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired session.', 401)
    }
    res.status(200).json({ user: toPublicUser(user) })
  } catch (error) {
    next(error)
  }
}

export async function patchMe(req: Request, res: Response, next: NextFunction) {
  try {
    const updates = updateProfileInputSchema.parse(req.body)
    const user = await UserModel.findById(req.user!.userId)
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired session.', 401)
    }
    Object.assign(user, updates)
    await user.save()
    res.status(200).json({ user: toPublicUser(user) })
  } catch (error) {
    next(error)
  }
}

export async function postChangePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = changePasswordInputSchema.parse(req.body)
    const user = await UserModel.findById(req.user!.userId)
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired session.', 401)
    }
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.', 401)
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12)
    await user.save()
    res.status(200).json({ ok: true })
  } catch (error) {
    next(error)
  }
}
