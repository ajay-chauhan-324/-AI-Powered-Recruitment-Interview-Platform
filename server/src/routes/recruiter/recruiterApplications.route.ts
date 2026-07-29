import { Router } from 'express'
import { requireRecruiterAuth } from '../../middleware/recruiterAuth.js'
import {
  getAllRecruiterApplications,
  getApplicationCandidatePhoto,
  getApplicationResumeFile,
  getRecruiterApplication,
  patchApplicationNotes,
  patchApplicationStatus,
  postRoundOutcome,
} from '../../controllers/recruiter/recruiterApplications.controller.js'

export const recruiterApplicationsRouter = Router()

recruiterApplicationsRouter.use(requireRecruiterAuth)
recruiterApplicationsRouter.get('/', getAllRecruiterApplications)
recruiterApplicationsRouter.get('/:id', getRecruiterApplication)
recruiterApplicationsRouter.patch('/:id/status', patchApplicationStatus)
recruiterApplicationsRouter.patch('/:id/notes', patchApplicationNotes)
recruiterApplicationsRouter.post('/:id/rounds/:order/outcome', postRoundOutcome)
recruiterApplicationsRouter.get('/:id/resume', getApplicationResumeFile)
recruiterApplicationsRouter.get('/:id/photo', getApplicationCandidatePhoto)
