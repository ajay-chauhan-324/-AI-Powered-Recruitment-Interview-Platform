const API_BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string }
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : ''
  const response = await fetch(`${API_BASE}${path}${query}`)
  const body = (await response.json().catch(() => null)) as T | ErrorBody | null

  if (!response.ok) {
    const message =
      (body as ErrorBody | null)?.error?.message ?? `Request failed with status ${response.status}`
    throw new ApiError(response.status, message)
  }

  return body as T
}
