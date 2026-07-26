import { Router } from 'express'
import { getAdminSchedule, putAdminSchedule } from '../../controllers/admin/adminSchedule.controller.js'
import { requireAdminAuth } from '../../middleware/adminAuth.js'

export const adminScheduleRouter = Router()

adminScheduleRouter.use(requireAdminAuth)
adminScheduleRouter.get('/', getAdminSchedule)
adminScheduleRouter.put('/', putAdminSchedule)
