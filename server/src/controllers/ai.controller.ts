import type { NextFunction, Request, Response } from 'express'
import { runConversation } from '../ai/conversation.service.js'
import { guestAiChatInputSchema } from '../validators/ai.validators.js'

export async function postAiChat(req: Request, res: Response, next: NextFunction) {
  try {
    const { messages, timezone, manageToken } = guestAiChatInputSchema.parse(req.body)
    const result = await runConversation(messages, { mode: 'guest', manageToken }, timezone)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}
