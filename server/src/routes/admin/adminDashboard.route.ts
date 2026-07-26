import { Router } from 'express'
import { getAdminDashboard } from '../../controllers/admin/adminDashboard.controller.js'
import { requireAdminAuth } from '../../middleware/adminAuth.js'

export const adminDashboardRouter = Router()

adminDashboardRouter.use(requireAdminAuth)
adminDashboardRouter.get('/', getAdminDashboard)
