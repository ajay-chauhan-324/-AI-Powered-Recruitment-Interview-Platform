import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { loginUser } from '@/features/auth/api/authApi'
import { ApiError } from '@/lib/apiClient'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const explicitRedirect = (location.state as { from?: string } | null)?.from

  const mutation = useMutation({
    mutationFn: () => loginUser(email, password),
    onSuccess: (data) => {
      // Seed the cache with the exact user object the login response just returned, rather
      // than invalidating and letting the destination route's own useUserSession() re-fetch
      // it. That re-fetch races the navigation below: if this browser tab had already fetched
      // ['user-session'] once before (e.g. this /login visit was itself the result of a
      // guarded route redirecting a signed-out visitor here), the query is already "settled"
      // in an error state, so React Query's isLoading stays false while the background
      // refetch is still in flight — RequireUser/RequireRecruiter then reads the *old*
      // signed-out result and bounces straight back to /login. That's the intermittent
      // "first attempt doesn't log in, second one does" bug: by the second attempt the
      // earlier refetch has usually resolved. Seeding synchronously makes the destination
      // route's guard see the correct, authenticated session on its very first render.
      queryClient.setQueryData(['user-session'], data)
      const isRecruiter = data.user.accountType === 'recruiter'
      const defaultRedirect = isRecruiter ? '/recruiter/dashboard' : '/dashboard'
      // A "return to where you came from" redirect is only trusted when it actually belongs
      // to this account's role — e.g. a recruiter bounced from /recruiter/jobs while signed
      // out should return there, but a recruiter bounced from a candidate route (or a stale
      // `from` value from an earlier session) must never land back in the candidate UI. The
      // account type just returned by the login response — not the previous URL — decides.
      const redirectMatchesRole = explicitRedirect !== undefined && explicitRedirect.startsWith('/recruiter') === isRecruiter
      navigate(redirectMatchesRole ? explicitRedirect! : defaultRedirect, { replace: true })
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
    <div className="flex min-h-dvh items-start justify-center bg-paper-100 px-4 py-12 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-hairline bg-paper-50 shadow-panel">
        <div className="h-1 bg-amber-600" aria-hidden="true" />
        <div className="border-b border-hairline px-6 py-4">
          <Link to="/" className="font-mono text-sm font-medium tracking-wide text-ink-900">
            The Ledger
          </Link>
        </div>
        <div className="px-6 py-6">
          <h1 className="text-lg font-medium text-ink-900">Sign in</h1>
          <p className="mt-1 text-sm text-ink-700">Welcome back. Sign in to manage your interviews.</p>

          <form onSubmit={handleSubmit} className="mt-5" noValidate>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="mt-4 flex flex-col gap-1 text-sm text-ink-700">
              Password
              <span className="relative flex items-center">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-md border border-hairline bg-paper-50 py-2 pl-3 pr-16 text-base text-ink-900 focus-visible:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 flex min-h-8 items-center px-1.5 text-xs font-medium text-ink-700 hover:text-ink-900"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
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

          <p className="mt-5 text-sm text-ink-700">
            New here?{' '}
            <Link to="/register" className="font-medium text-ink-900 underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
