import { Router } from 'express'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { requireCandidateAuth } from '../middleware/candidateAuth.js'
import { ALLOWED_RESUME_MIME_TYPES, MAX_RESUME_SIZE_BYTES } from '../services/resume.service.js'
import { deleteResume, getResumeFile, getResumes, patchResumeDefault, postResume } from '../controllers/resumes.controller.js'

export const resumesRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    callback(null, ALLOWED_RESUME_MIME_TYPES.includes(file.mimetype))
  },
})

// Uploading parses+extracts text from a real file — worth its own limiter independent of
// the generic mutation traffic on this account.
const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

resumesRouter.use(requireCandidateAuth)
resumesRouter.get('/', getResumes)
resumesRouter.post('/', uploadRateLimit, upload.single('resume'), postResume)
resumesRouter.patch('/:id/default', patchResumeDefault)
resumesRouter.delete('/:id', deleteResume)
resumesRouter.get('/:id/file', getResumeFile)
