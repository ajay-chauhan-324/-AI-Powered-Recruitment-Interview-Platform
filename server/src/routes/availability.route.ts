import { Router } from 'express'
import { getAvailability } from '../controllers/availability.controller.js'

export const availabilityRouter = Router()

availabilityRouter.get('/', getAvailability)
