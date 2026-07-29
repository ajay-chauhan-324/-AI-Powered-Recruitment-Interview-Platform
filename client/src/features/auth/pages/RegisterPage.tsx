import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { registerUser, type AccountType } from '@/features/auth/api/authApi'
import { ApiError } from '@/lib/apiClient'

function getPasswordIssue(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.'
  }
  return null
}

export function RegisterPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [accountType, setAccountType] = useState<AccountType>('candidate')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      registerUser({
        name,
        email,
        password,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        accountType,
        companyName: accountType === 'recruiter' ? companyName : undefined,
      }),
    onSuccess: (data) => {
      // Seed the cache with the register response's own user object before navigating — see
      // LoginPage.tsx's identical fix for why invalidateQueries()-then-navigate() races the
      // destination route's guard and can otherwise bounce a freshly-registered user back to
      // a login screen they never needed.
      queryClient.setQueryData(['user-session'], data)
      navigate(accountType === 'recruiter' ? '/recruiter/dashboard' : '/dashboard', { replace: true })
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const passwordIssue = getPasswordIssue(password)
    if (passwordIssue) {
      setError(passwordIssue)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (accountType === 'recruiter' && companyName.trim().length === 0) {
      setError('Company name is required to register as a recruiter.')
      return
    }
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
          <h1 className="text-lg font-medium text-ink-900">Create your account</h1>
          <p className="mt-1 text-sm text-ink-700">
            {accountType === 'candidate'
              ? 'Find jobs, apply with your resume, and manage every interview in one place.'
              : 'Post jobs, review AI-analyzed applications, and schedule interviews.'}
          </p>

          <div role="radiogroup" aria-label="Account type" className="mt-5 grid grid-cols-2 gap-2">
            {(['candidate', 'recruiter'] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={accountType === type}
                onClick={() => setAccountType(type)}
                className={
                  'flex min-h-11 items-center justify-center rounded-md border px-3 text-sm font-medium ' +
                  (accountType === type
                    ? 'border-amber-600 bg-amber-100 text-ink-900'
                    : 'border-hairline text-ink-700 hover:text-ink-900')
                }
              >
                {type === 'candidate' ? "I'm a candidate" : "I'm a recruiter"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-5" noValidate>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Full name
              <input
                required
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            {accountType === 'recruiter' && (
              <label className="mt-4 flex flex-col gap-1 text-sm text-ink-700">
                Company name
                <input
                  required
                  type="text"
                  autoComplete="organization"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                />
              </label>
            )}
            <label className="mt-4 flex flex-col gap-1 text-sm text-ink-700">
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
                  autoComplete="new-password"
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
              <span className="text-xs text-ink-500">At least 8 characters, with a letter and a number.</span>
            </label>
            <label className="mt-4 flex flex-col gap-1 text-sm text-ink-700">
              Confirm password
              <input
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
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
              {mutation.isPending ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-5 text-sm text-ink-700">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-ink-900 underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
