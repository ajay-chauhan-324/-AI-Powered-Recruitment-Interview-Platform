import { Router } from 'express'
import { requireRecruiterAuth } from '../../middleware/recruiterAuth.js'
import {
  getRecruiterJob,
  getRecruiterJobs,
  patchRecruiterJob,
  postRecruiterJob,
  postRecruiterJobClose,
  postRecruiterJobDuplicate,
  postRecruiterJobPause,
  postRecruiterJobPublish,
} from '../../controllers/recruiter/recruiterJobs.controller.js'
import { getJobApplications } from '../../controllers/recruiter/recruiterApplications.controller.js'

export const recruiterJobsRouter = Router()

recruiterJobsRouter.use(requireRecruiterAuth)
recruiterJobsRouter.get('/', getRecruiterJobs)
recruiterJobsRouter.post('/', postRecruiterJob)
recruiterJobsRouter.get('/:id', getRecruiterJob)
recruiterJobsRouter.patch('/:id', patchRecruiterJob)
recruiterJobsRouter.post('/:id/publish', postRecruiterJobPublish)
recruiterJobsRouter.post('/:id/pause', postRecruiterJobPause)
recruiterJobsRouter.post('/:id/close', postRecruiterJobClose)
recruiterJobsRouter.post('/:id/duplicate', postRecruiterJobDuplicate)
recruiterJobsRouter.get('/:jobId/applications', getJobApplications)
