import type { NextFunction, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { AdminUserModel } from '../../models/AdminUser.model.js'
import { env } from '../../config/env.js'
import { AppError } from '../../middleware/errorHandler.js'
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_DURATION_MS } from '../../middleware/adminAuth.js'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
})

function setSessionCookie(res: Response, token: string) {
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_SESSION_DURATION_MS,
  })
}

export async function postLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const admin = await AdminUserModel.findOne({ email })
    // Same error for "no such admin" and "wrong password" — don't reveal which.
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401)
    }

    const token = jwt.sign({ adminId: admin._id.toString(), email: admin.email }, env.JWT_SECRET, {
      expiresIn: '12h',
    })
    setSessionCookie(res, token)
    res.status(200).json({ admin: { email: admin.email } })
  } catch (error) {
    next(error)
  }
}

export function postLogout(_req: Request, res: Response) {
  res.clearCookie(ADMIN_SESSION_COOKIE)
  res.status(200).json({ ok: true })
}

export function getMe(req: Request, res: Response) {
  res.status(200).json({ admin: req.admin })
}
