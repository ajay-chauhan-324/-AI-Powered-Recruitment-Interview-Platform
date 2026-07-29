import { Router } from 'express'
import { getCompanyProfile } from '../controllers/companies.controller.js'

export const companiesRouter = Router()

companiesRouter.get('/:id', getCompanyProfile)
