import { Router } from 'express'
import { requireCandidateAuth } from '../middleware/candidateAuth.js'
import {
  deleteMyInterview,
  getMyInterview,
  getMyInterviews,
  patchMyInterview,
} from '../controllers/myInterviews.controller.js'

export const myInterviewsRouter = Router()

myInterviewsRouter.use(requireCandidateAuth)
myInterviewsRouter.get('/', getMyInterviews)
myInterviewsRouter.get('/:id', getMyInterview)
myInterviewsRouter.patch('/:id', patchMyInterview)
myInterviewsRouter.delete('/:id', deleteMyInterview)
