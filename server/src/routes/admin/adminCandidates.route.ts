import { Router } from 'express'
import { getAdminCandidateInterviews, getAdminCandidates } from '../../controllers/admin/adminCandidates.controller.js'
import { requireAdminAuth } from '../../middleware/adminAuth.js'

export const adminCandidatesRouter = Router()

adminCandidatesRouter.use(requireAdminAuth)
adminCandidatesRouter.get('/', getAdminCandidates)
adminCandidatesRouter.get('/:email/interviews', getAdminCandidateInterviews)
