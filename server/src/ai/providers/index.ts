import { env } from '../../config/env.js'
import { OpenRouterProvider } from './openRouterProvider.js'
import type { AiProvider } from './types.js'

export * from './types.js'

/**
 * Extensible by design (CLAUDE.md §26): adding Gemini/OpenAI/Ollama later means adding a
 * case here and a sibling provider file — nothing in ai/tools.ts, ai/conversation.service.ts,
 * or any booking/availability service changes.
 */
export function getAiProvider(): AiProvider {
  switch (env.AI_PROVIDER) {
    case 'openrouter':
      return new OpenRouterProvider()
  }
}
