import { Router } from 'express'
import {
  deleteAdminBlockedSlot,
  getAdminBlockedSlots,
  postAdminBlockedSlot,
} from '../../controllers/admin/adminBlockedSlots.controller.js'
import { requireAdminAuth } from '../../middleware/adminAuth.js'

export const adminBlockedSlotsRouter = Router()

adminBlockedSlotsRouter.use(requireAdminAuth)
adminBlockedSlotsRouter.get('/', getAdminBlockedSlots)
adminBlockedSlotsRouter.post('/', postAdminBlockedSlot)
adminBlockedSlotsRouter.delete('/:id', deleteAdminBlockedSlot)
