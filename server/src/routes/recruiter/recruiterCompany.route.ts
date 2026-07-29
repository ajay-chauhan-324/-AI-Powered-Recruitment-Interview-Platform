import { Router } from 'express'
import { requireRecruiterAuth } from '../../middleware/recruiterAuth.js'
import { getRecruiterCompany, patchRecruiterCompany } from '../../controllers/recruiter/recruiterCompany.controller.js'

export const recruiterCompanyRouter = Router()

recruiterCompanyRouter.use(requireRecruiterAuth)
recruiterCompanyRouter.get('/', getRecruiterCompany)
recruiterCompanyRouter.patch('/', patchRecruiterCompany)
