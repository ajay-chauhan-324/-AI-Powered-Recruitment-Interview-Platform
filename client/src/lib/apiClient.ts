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

interface ErrorBody {
  error?: { code?: string; message?: string }
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
    throw new ApiError(response.status, message, errorBody?.error?.code)
  }

  return body as T
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : ''
  const response = await fetch(`${API_BASE}${path}${query}`, { credentials: 'include' })
  return handleResponse<T>(response)
}

async function apiMutate<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(response)
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiMutate<T>('POST', path, body)
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
