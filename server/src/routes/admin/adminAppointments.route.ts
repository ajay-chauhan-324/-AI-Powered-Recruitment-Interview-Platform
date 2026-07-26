import { Router } from 'express'
import {
  deleteAdminAppointment,
  getAdminAppointments,
  patchAdminAppointment,
  postAdminAppointment,
} from '../../controllers/admin/adminAppointments.controller.js'
import { requireAdminAuth } from '../../middleware/adminAuth.js'

export const adminAppointmentsRouter = Router()

adminAppointmentsRouter.use(requireAdminAuth)
adminAppointmentsRouter.get('/', getAdminAppointments)
adminAppointmentsRouter.post('/', postAdminAppointment)
adminAppointmentsRouter.patch('/:id', patchAdminAppointment)
adminAppointmentsRouter.delete('/:id', deleteAdminAppointment)
