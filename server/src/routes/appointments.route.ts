import { Router } from 'express'
import {
  deleteAppointmentByManageToken,
  getAppointmentByManageToken,
  patchAppointmentByManageToken,
  postAppointment,
} from '../controllers/appointments.controller.js'

export const appointmentsRouter = Router()

appointmentsRouter.post('/', postAppointment)
appointmentsRouter.get('/manage/:token', getAppointmentByManageToken)
appointmentsRouter.patch('/manage/:token', patchAppointmentByManageToken)
appointmentsRouter.delete('/manage/:token', deleteAppointmentByManageToken)
