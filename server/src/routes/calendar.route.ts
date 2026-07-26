import { Router } from 'express'
import { getCalendarView } from '../controllers/calendar.controller.js'

export const calendarRouter = Router()

calendarRouter.get('/', getCalendarView)
