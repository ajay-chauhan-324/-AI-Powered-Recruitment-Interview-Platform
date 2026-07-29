/**
 * Provider-agnostic shapes for the AI conversation layer (CLAUDE.md §16). Every provider
 * adapter (OpenRouter today; Gemini/OpenAI/Ollama later) implements `AiProvider` against
 * these types — nothing outside `ai/providers/` knows which vendor is behind it, and
 * nothing in here knows about booking/availability business rules.
 */

export type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface AiToolCall {
  id: string
  name: string
  /** Raw JSON text as returned by the model — never trusted until Zod-parsed by the caller. */
  argumentsJson: string
}

export interface AiMessage {
  role: AiMessageRole
  /** Empty string is valid for an assistant message that is pure tool calls. */
  content: string
  toolCalls?: AiToolCall[]
  /** Required on role: 'tool' messages — must match the AiToolCall.id it answers. */
  toolCallId?: string
}

export interface AiToolDefinition {
  name: string
  description: string
  /** A JSON Schema object (not a Zod schema) — this is what goes over the wire to the model. */
  parameters: Record<string, unknown>
}

export interface AiCompletionResult {
  content: string
  toolCalls: AiToolCall[]
}

export interface AiProvider {
  complete(messages: AiMessage[], tools: AiToolDefinition[]): Promise<AiCompletionResult>
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiProviderError'
  }
}

/** Thrown when the selected provider has no API key configured — mapped to 503, never a
 * server crash, mirroring the SMTP credential-free-default pattern (Phase 10). */
export class AiProviderNotConfiguredError extends AiProviderError {
  constructor() {
    super('The AI conversation layer is not configured (missing provider API key).')
    this.name = 'AiProviderNotConfiguredError'
  }
}

/** Thrown specifically for a 429 rate-limit response (e.g. OpenRouter's free-model daily
 * cap) — kept distinct from a generic AiProviderError so the client can tell "the assistant
 * is temporarily out of quota, try again after this time" apart from a genuine provider
 * outage, instead of collapsing both into the same unhelpful message. `resetAt` is best-
 * effort — omitted if the provider's response didn't include a parseable reset time. */
export class AiProviderRateLimitedError extends AiProviderError {
  readonly resetAt: Date | null

  constructor(message: string, resetAt: Date | null = null) {
    super(message)
    this.name = 'AiProviderRateLimitedError'
    this.resetAt = resetAt
  }
}
