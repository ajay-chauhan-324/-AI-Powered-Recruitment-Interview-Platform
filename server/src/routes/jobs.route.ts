import { Router } from 'express'
import { getJobDetail, getJobs } from '../controllers/jobs.controller.js'

export const jobsRouter = Router()

jobsRouter.get('/', getJobs)
jobsRouter.get('/:idOrSlug', getJobDetail)
