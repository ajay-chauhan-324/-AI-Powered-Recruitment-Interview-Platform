import { Router } from 'express'
import {
  deleteAdminInterview,
  getAdminInterviews,
  patchAdminInterview,
  postAdminInterview,
} from '../../controllers/admin/adminInterviews.controller.js'
import { requireAdminAuth } from '../../middleware/adminAuth.js'

export const adminInterviewsRouter = Router()

adminInterviewsRouter.use(requireAdminAuth)
adminInterviewsRouter.get('/', getAdminInterviews)
adminInterviewsRouter.post('/', postAdminInterview)
adminInterviewsRouter.patch('/:id', patchAdminInterview)
adminInterviewsRouter.delete('/:id', deleteAdminInterview)
