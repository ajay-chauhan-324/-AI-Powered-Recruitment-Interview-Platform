import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminLogin } from '@/features/admin/api/adminApi'
import { ApiError } from '@/lib/apiClient'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => adminLogin(email, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-session'] })
      navigate('/admin', { replace: true })
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-hairline bg-paper-50 p-6 shadow-panel"
      >
        <span className="font-mono text-sm font-medium tracking-wide text-ink-900">The Ledger — Admin</span>

        <label className="mt-6 flex flex-col gap-1 text-sm text-ink-700">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>
        <label className="mt-4 flex flex-col gap-1 text-sm text-ink-700">
          Password
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="mt-4 text-sm text-conflict">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="mt-6 flex min-h-11 w-full items-center justify-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70 disabled:opacity-50"
        >
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
