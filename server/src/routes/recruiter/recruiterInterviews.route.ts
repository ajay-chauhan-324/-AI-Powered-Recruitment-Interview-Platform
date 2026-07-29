import { Router } from 'express'
import { requireRecruiterAuth } from '../../middleware/recruiterAuth.js'
import {
  deleteRecruiterInterview,
  getRecruiterInterviews,
  patchRecruiterInterview,
} from '../../controllers/recruiter/recruiterInterviews.controller.js'

export const recruiterInterviewsRouter = Router()

recruiterInterviewsRouter.use(requireRecruiterAuth)
recruiterInterviewsRouter.get('/', getRecruiterInterviews)
recruiterInterviewsRouter.patch('/:id', patchRecruiterInterview)
recruiterInterviewsRouter.delete('/:id', deleteRecruiterInterview)
