import { Router } from 'express'
import { requireUserAuth } from '../middleware/userAuth.js'
import { getMeeting } from '../controllers/meetings.controller.js'

export const meetingsRouter = Router()

meetingsRouter.use(requireUserAuth)
meetingsRouter.get('/:meetingId', getMeeting)
