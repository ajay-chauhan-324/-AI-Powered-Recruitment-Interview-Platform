import { Router } from 'express'
import { requireRecruiterAuth } from '../../middleware/recruiterAuth.js'
import { getRecruiterSchedule, putRecruiterSchedule } from '../../controllers/recruiter/recruiterSchedule.controller.js'

export const recruiterScheduleRouter = Router()

recruiterScheduleRouter.use(requireRecruiterAuth)
recruiterScheduleRouter.get('/', getRecruiterSchedule)
recruiterScheduleRouter.put('/', putRecruiterSchedule)
