import type { NextFunction, Request, Response } from 'express'
import { runConversation } from '../ai/conversation.service.js'
import { aiChatInputSchema } from '../validators/ai.validators.js'

export async function postUserAiChat(req: Request, res: Response, next: NextFunction) {
  try {
    const { messages, timezone, activeApplicationId } = aiChatInputSchema.parse(req.body)
    const result = await runConversation(
      messages,
      { mode: 'user', userId: req.user!.userId, email: req.user!.email, activeApplicationId },
      timezone,
    )
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}
