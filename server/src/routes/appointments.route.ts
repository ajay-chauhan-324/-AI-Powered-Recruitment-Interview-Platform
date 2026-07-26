import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  deleteAppointmentByManageToken,
  getAppointmentByManageToken,
  patchAppointmentByManageToken,
  postAppointment,
} from '../controllers/appointments.controller.js'

export const appointmentsRouter = Router()

// Unauthenticated and reachable by anyone: without a limit, this endpoint can be used to
// spam-fill availability or email-bomb an arbitrary victim's inbox with confirmation emails
// (the notification service sends to whatever address the request supplies).
const createAppointmentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

// Manage-token routes are keyed by a 256-bit random token (brute force is infeasible), but
// still worth limiting against scripted scanning/abuse of an unauthenticated endpoint.
const manageTokenRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
})

appointmentsRouter.post('/', createAppointmentRateLimit, postAppointment)
appointmentsRouter.get('/manage/:token', manageTokenRateLimit, getAppointmentByManageToken)
appointmentsRouter.patch('/manage/:token', manageTokenRateLimit, patchAppointmentByManageToken)
appointmentsRouter.delete('/manage/:token', manageTokenRateLimit, deleteAppointmentByManageToken)
