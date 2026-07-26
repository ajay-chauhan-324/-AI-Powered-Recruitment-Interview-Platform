import { env } from '../../config/env.js'
import {
  AiProviderError,
  AiProviderNotConfiguredError,
  type AiCompletionResult,
  type AiMessage,
  type AiProvider,
  type AiToolCall,
  type AiToolDefinition,
} from './types.js'

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const REQUEST_TIMEOUT_MS = 20_000

interface OpenRouterToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OpenRouterMessage {
  role: string
  content: string | null
  tool_calls?: OpenRouterToolCall[]
  tool_call_id?: string
}

interface OpenRouterResponse {
  choices?: Array<{ message: OpenRouterMessage }>
  error?: { message?: string }
}

function toOpenRouterMessage(message: AiMessage): OpenRouterMessage {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCalls && message.toolCalls.length > 0
      ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function' as const, function: { name: call.name, arguments: call.argumentsJson } })) }
      : {}),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
  }
}

function toOpenRouterTool(tool: AiToolDefinition) {
  return { type: 'function' as const, function: { name: tool.name, description: tool.description, parameters: tool.parameters } }
}

/**
 * OpenRouter's chat/completions endpoint is OpenAI-compatible, so this adapter is a thin
 * `fetch` wrapper — no SDK dependency needed (CLAUDE.md §25: smallest reasonable dependency
 * set). Swapping providers later means adding a sibling file that implements `AiProvider`,
 * never touching this one or anything in services/.
 */
export class OpenRouterProvider implements AiProvider {
  async complete(messages: AiMessage[], tools: AiToolDefinition[]): Promise<AiCompletionResult> {
    if (!env.OPENROUTER_API_KEY) throw new AiProviderNotConfiguredError()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(OPENROUTER_CHAT_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.CLIENT_ORIGIN,
          // HTTP header values must be Latin-1/ByteString — no em dash or other non-ASCII
          // characters (fetch() throws otherwise), unlike the same product name used freely
          // elsewhere in the UI/docs.
          'X-Title': 'The Ledger - Intelligent Time Canvas',
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL,
          messages: messages.map(toOpenRouterMessage),
          tools: tools.length > 0 ? tools.map(toOpenRouterTool) : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
        }),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiProviderError('The AI provider did not respond in time.')
      }
      throw new AiProviderError(`Failed to reach the AI provider: ${(error as Error).message}`)
    } finally {
      clearTimeout(timeout)
    }

    const body = (await response.json().catch(() => null)) as OpenRouterResponse | null

    if (!response.ok) {
      throw new AiProviderError(body?.error?.message ?? `AI provider request failed with status ${response.status}`)
    }

    const message = body?.choices?.[0]?.message
    if (!message) throw new AiProviderError('AI provider returned an empty response.')

    const toolCalls: AiToolCall[] = (message.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      argumentsJson: call.function.arguments,
    }))

    return { content: message.content ?? '', toolCalls }
  }
}
