import { Router } from 'express'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { requireUserAuth } from '../middleware/userAuth.js'
import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_SIZE_BYTES } from '../services/avatar.service.js'
import { deleteAvatar, getMyAvatarFile, postAvatar } from '../controllers/avatar.controller.js'

export const avatarRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    callback(null, ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype))
  },
})

const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

avatarRouter.use(requireUserAuth)
avatarRouter.post('/', uploadRateLimit, upload.single('photo'), postAvatar)
avatarRouter.delete('/', deleteAvatar)
avatarRouter.get('/file', getMyAvatarFile)
