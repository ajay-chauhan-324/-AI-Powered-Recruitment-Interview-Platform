import type { NextFunction, Request, Response } from 'express'
import { runConversation } from '../../ai/conversation.service.js'
import { aiChatInputSchema } from '../../validators/ai.validators.js'

export async function postRecruiterAiChat(req: Request, res: Response, next: NextFunction) {
  try {
    const { messages, timezone } = aiChatInputSchema.parse(req.body)
    const result = await runConversation(
      messages,
      { mode: 'recruiter', userId: req.recruiter!.userId, email: req.recruiter!.email, companyId: req.recruiter!.companyId },
      timezone,
    )
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}
