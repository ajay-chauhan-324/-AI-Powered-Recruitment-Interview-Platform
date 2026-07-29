const API_BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** The 409 SLOT_CONFLICT shape carries alternative slots the caller can offer the user. */
export class ApiConflictError extends ApiError {
  alternatives: Array<{ start: string; end: string }>
  constructor(message: string, alternatives: Array<{ start: string; end: string }>) {
    super(409, message, 'SLOT_CONFLICT')
    this.name = 'ApiConflictError'
    this.alternatives = alternatives
  }
}

/** The AI_RATE_LIMITED shape (a 503 from the AI chat endpoints specifically) carries when
 * the provider's free-tier daily quota resets, if the provider reported one — distinct from
 * a generic provider outage so the UI can say "back at 5:30 AM" instead of "try again in a
 * moment" (which is misleading when the real wait is hours, not seconds). */
export class ApiRateLimitedError extends ApiError {
  resetAt: string | null
  constructor(message: string, resetAt: string | null) {
    super(503, message, 'AI_RATE_LIMITED')
    this.name = 'ApiRateLimitedError'
    this.resetAt = resetAt
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; resetAt?: string | null }
  alternatives?: Array<{ start: string; end: string }>
}

async function handleResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | ErrorBody | null

  if (!response.ok) {
    const errorBody = body as ErrorBody | null
    const message = errorBody?.error?.message ?? `Request failed with status ${response.status}`
    if (response.status === 409 && errorBody?.alternatives) {
      throw new ApiConflictError(message, errorBody.alternatives)
    }
    if (errorBody?.error?.code === 'AI_RATE_LIMITED') {
      throw new ApiRateLimitedError(message, errorBody.error.resetAt ?? null)
    }
    throw new ApiError(response.status, message, errorBody?.error?.code)
  }

  return body as T
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : ''
  const response = await fetch(`${API_BASE}${path}${query}`, { credentials: 'include' })
  return handleResponse<T>(response)
}

/** `timeoutMs` is opt-in and off by default (`undefined` — no AbortController, no behavior
 * change for any existing caller) — only the AI chat endpoints pass one (see aiApi.ts), since
 * those are the one request type observed hanging with no feedback: a genuinely stuck
 * request (server crash mid-request, dropped connection) would otherwise leave the UI's
 * "Thinking…" indicator showing forever with no way out. */
async function apiMutate<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  timeoutMs?: number,
): Promise<T> {
  // FormData (file uploads) must never be JSON-stringified or given an explicit
  // Content-Type — the browser sets its own multipart boundary header.
  const isFormData = body instanceof FormData
  const controller = timeoutMs ? new AbortController() : undefined
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal: controller?.signal,
    })
    return await handleResponse<T>(response)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, 'This is taking longer than expected. Please try again.', 'TIMEOUT')
    }
    throw error
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function apiPost<T>(path: string, body?: unknown, timeoutMs?: number): Promise<T> {
  return apiMutate<T>('POST', path, body, timeoutMs)
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiMutate<T>('PATCH', path, body)
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiMutate<T>('PUT', path, body)
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiMutate<T>('DELETE', path)
}
