import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CalendarClock, KeyRound, LogOut, UserRound } from 'lucide-react'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import { changePassword, logoutUser, updateProfile } from '@/features/auth/api/authApi'
import {
  fetchRecruiterCompany,
  fetchRecruiterSchedule,
  saveRecruiterSchedule,
  updateRecruiterCompany,
  type RecurringBreakEntry,
  type WorkingHoursEntry,
} from '@/features/recruiter/api/recruiterApi'
import { ApiError } from '@/lib/apiClient'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function RecruiterSettingsPage() {
  const session = useUserSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const companyQuery = useQuery({ queryKey: ['recruiter-company'], queryFn: fetchRecruiterCompany })

  const [name, setName] = useState('')
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [companyName, setCompanyName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [size, setSize] = useState('')
  const [companyLocation, setCompanyLocation] = useState('')
  const [description, setDescription] = useState('')
  const [linkedIn, setLinkedIn] = useState('')
  const [foundedYear, setFoundedYear] = useState('')
  const [benefitsText, setBenefitsText] = useState('')
  const [culture, setCulture] = useState('')
  const [techStackText, setTechStackText] = useState('')
  const [companyMessage, setCompanyMessage] = useState<string | null>(null)
  const [companyError, setCompanyError] = useState<string | null>(null)

  const scheduleQuery = useQuery({ queryKey: ['recruiter-schedule'], queryFn: fetchRecruiterSchedule })
  const [timezone, setTimezone] = useState('')
  const [workingHours, setWorkingHours] = useState<WorkingHoursEntry[]>([])
  const [breaks, setBreaks] = useState<RecurringBreakEntry[]>([])
  const [bufferMinutes, setBufferMinutes] = useState(0)
  const [minNoticeMinutes, setMinNoticeMinutes] = useState(0)
  const [maxBookingWindowDays, setMaxBookingWindowDays] = useState(60)
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    if (session.data?.user) setName(session.data.user.name)
  }, [session.data])

  useEffect(() => {
    const company = companyQuery.data?.company
    if (!company) return
    setCompanyName(company.name)
    setLogoUrl(company.logoUrl)
    setWebsite(company.website)
    setIndustry(company.industry)
    setSize(company.size)
    setCompanyLocation(company.location)
    setDescription(company.description)
    setLinkedIn(company.linkedIn)
    setFoundedYear(company.foundedYear ? String(company.foundedYear) : '')
    setBenefitsText(company.benefits.join(', '))
    setCulture(company.culture)
    setTechStackText(company.techStack.join(', '))
  }, [companyQuery.data])

  useEffect(() => {
    const schedule = scheduleQuery.data?.schedule
    if (!schedule) return
    setTimezone(schedule.timezone)
    setWorkingHours(schedule.workingHours)
    setBreaks(schedule.breaks)
    setBufferMinutes(schedule.bufferMinutes)
    setMinNoticeMinutes(schedule.minNoticeMinutes)
    setMaxBookingWindowDays(schedule.maxBookingWindowDays)
  }, [scheduleQuery.data])

  const scheduleMutation = useMutation({
    mutationFn: () =>
      saveRecruiterSchedule({ timezone, workingHours, breaks, bufferMinutes, minNoticeMinutes, maxBookingWindowDays }),
    onSuccess: () => {
      setScheduleError(null)
      setScheduleMessage('Interview calendar updated.')
      queryClient.invalidateQueries({ queryKey: ['recruiter-schedule'] })
    },
    onError: (err: unknown) => {
      setScheduleMessage(null)
      setScheduleError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  function updateWorkingHour(dayOfWeek: number, patch: Partial<WorkingHoursEntry>) {
    setWorkingHours((prev) => prev.map((entry) => (entry.dayOfWeek === dayOfWeek ? { ...entry, ...patch } : entry)))
  }

  function addBreak() {
    setBreaks((prev) => [...prev, { dayOfWeek: 1, startMinutes: 720, endMinutes: 780, label: 'Lunch' }])
  }

  function updateBreak(index: number, patch: Partial<RecurringBreakEntry>) {
    setBreaks((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  }

  function removeBreak(index: number) {
    setBreaks((prev) => prev.filter((_, i) => i !== index))
  }

  function handleScheduleSubmit(event: FormEvent) {
    event.preventDefault()
    setScheduleMessage(null)
    scheduleMutation.mutate()
  }

  const profileMutation = useMutation({
    mutationFn: () => updateProfile({ name }),
    onSuccess: () => {
      setProfileError(null)
      setProfileMessage('Profile updated.')
      queryClient.invalidateQueries({ queryKey: ['user-session'] })
    },
    onError: (err: unknown) => {
      setProfileMessage(null)
      setProfileError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  const companyMutation = useMutation({
    mutationFn: () =>
      updateRecruiterCompany({
        name: companyName,
        logoUrl,
        website,
        industry,
        size,
        location: companyLocation,
        description,
        linkedIn,
        foundedYear: foundedYear ? Number(foundedYear) : undefined,
        benefits: benefitsText
          .split(',')
          .map((benefit) => benefit.trim())
          .filter(Boolean),
        culture,
        techStack: techStackText
          .split(',')
          .map((tech) => tech.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setCompanyError(null)
      setCompanyMessage('Company profile updated.')
      queryClient.invalidateQueries({ queryKey: ['recruiter-company'] })
    },
    onError: (err: unknown) => {
      setCompanyMessage(null)
      setCompanyError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  const passwordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setPasswordError(null)
      setPasswordMessage('Password changed.')
      setCurrentPassword('')
      setNewPassword('')
    },
    onError: (err: unknown) => {
      setPasswordMessage(null)
      setPasswordError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  const logoutMutation = useMutation({
    mutationFn: () => logoutUser(),
    onSuccess: () => {
      queryClient.setQueryData(['user-session'], null)
      navigate('/', { replace: true })
    },
  })

  function handleProfileSubmit(event: FormEvent) {
    event.preventDefault()
    setProfileMessage(null)
    profileMutation.mutate()
  }

  function handleCompanySubmit(event: FormEvent) {
    event.preventDefault()
    setCompanyMessage(null)
    companyMutation.mutate()
  }

  function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault()
    setPasswordMessage(null)
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('New password must be at least 8 characters, with a letter and a number.')
      return
    }
    passwordMutation.mutate()
  }

  return (
    <RecruiterLayout>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-medium text-ink-900">Settings</h1>
        <p className="mt-1 text-sm text-ink-700">Manage your company profile and account.</p>

        <section className="mt-8 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
          <h2 className="flex items-center gap-1.5 text-md font-medium text-ink-900">
            <Building2 size={16} aria-hidden="true" className="text-amber-600" />
            Company profile
          </h2>

          {companyQuery.isLoading && <p className="mt-4 text-sm text-ink-700">Loading company profile…</p>}
          {companyQuery.isError && (
            <p role="alert" className="mt-4 text-sm text-conflict">
              Couldn't load your company profile. Please refresh to try again.
            </p>
          )}

          {!companyQuery.isLoading && !companyQuery.isError && (
          <form onSubmit={handleCompanySubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={companyName || 'Company'} photoUrl={logoUrl} size="lg" />
              <label className="flex flex-1 flex-col gap-1 text-sm text-ink-700">
                Logo URL (optional)
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(event) => setLogoUrl(event.target.value)}
                  placeholder="https://…"
                  className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Company name
              <input
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Website
              <input
                type="text"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-ink-700">
                Industry
                <input
                  type="text"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-ink-700">
                Company size
                <input
                  type="text"
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                  placeholder="e.g. 11-50"
                  className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Headquarters
              <input
                type="text"
                value={companyLocation}
                onChange={(event) => setCompanyLocation(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-ink-700">
                LinkedIn
                <input
                  type="text"
                  value={linkedIn}
                  onChange={(event) => setLinkedIn(event.target.value)}
                  className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-ink-700">
                Founded year
                <input
                  type="number"
                  value={foundedYear}
                  onChange={(event) => setFoundedYear(event.target.value)}
                  placeholder="e.g. 2015"
                  className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Description
              <textarea
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Culture (optional)
              <textarea
                rows={3}
                value={culture}
                onChange={(event) => setCulture(event.target.value)}
                placeholder="What it's like to work here…"
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Benefits (comma-separated, optional)
              <input
                type="text"
                value={benefitsText}
                onChange={(event) => setBenefitsText(event.target.value)}
                placeholder="Health insurance, Remote-first, Unlimited PTO"
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Tech stack (comma-separated, optional)
              <input
                type="text"
                value={techStackText}
                onChange={(event) => setTechStackText(event.target.value)}
                placeholder="React, Node.js, PostgreSQL"
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            {companyMessage && <p className="text-sm text-available">{companyMessage}</p>}
            {companyError && (
              <p role="alert" className="text-sm text-conflict">
                {companyError}
              </p>
            )}
            <Button type="submit" variant="primary" isLoading={companyMutation.isPending} className="self-start">
              {companyMutation.isPending ? 'Saving…' : 'Save company profile'}
            </Button>
          </form>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
          <h2 className="flex items-center gap-1.5 text-md font-medium text-ink-900">
            <CalendarClock size={16} aria-hidden="true" className="text-amber-600" />
            Interview calendar
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            Your own working hours, breaks, and booking rules — every candidate booking a round against one of your
            jobs sees only real, open time on this calendar. Changes apply immediately.
          </p>

          {scheduleQuery.isLoading && <p className="mt-4 text-sm text-ink-700">Loading your calendar…</p>}
          {scheduleQuery.isError && (
            <p role="alert" className="mt-4 text-sm text-conflict">
              Couldn't load your calendar. Please refresh to try again.
            </p>
          )}

          {!scheduleQuery.isLoading && !scheduleQuery.isError && (
            <form onSubmit={handleScheduleSubmit} className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm text-ink-700">
                Timezone (IANA)
                <input
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  placeholder="e.g. Asia/Kolkata"
                  className="w-64 rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                />
              </label>

              <div className="flex flex-col gap-2">
                {workingHours.map((entry) => (
                  <div key={entry.dayOfWeek} className="flex items-center gap-3">
                    <label className="flex w-28 items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={entry.isActive}
                        onChange={(event) => updateWorkingHour(entry.dayOfWeek, { isActive: event.target.checked })}
                      />
                      {DAY_LABELS[entry.dayOfWeek]}
                    </label>
                    <input
                      type="time"
                      value={minutesToTimeInput(entry.startMinutes)}
                      onChange={(event) =>
                        updateWorkingHour(entry.dayOfWeek, { startMinutes: timeInputToMinutes(event.target.value) })
                      }
                      disabled={!entry.isActive}
                      className="rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900 disabled:opacity-40"
                    />
                    <span className="text-sm text-ink-700">to</span>
                    <input
                      type="time"
                      value={minutesToTimeInput(entry.endMinutes)}
                      onChange={(event) =>
                        updateWorkingHour(entry.dayOfWeek, { endMinutes: timeInputToMinutes(event.target.value) })
                      }
                      disabled={!entry.isActive}
                      className="rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900 disabled:opacity-40"
                    />
                  </div>
                ))}
              </div>

              <div>
                <h3 className="text-sm font-medium text-ink-900">Recurring breaks</h3>
                <div className="mt-2 flex flex-col gap-2">
                  {breaks.map((brk, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        value={brk.dayOfWeek}
                        onChange={(event) => updateBreak(index, { dayOfWeek: Number(event.target.value) })}
                        className="rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900"
                      >
                        {DAY_LABELS.map((label, day) => (
                          <option key={day} value={day}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="time"
                        value={minutesToTimeInput(brk.startMinutes)}
                        onChange={(event) => updateBreak(index, { startMinutes: timeInputToMinutes(event.target.value) })}
                        className="rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900"
                      />
                      <input
                        type="time"
                        value={minutesToTimeInput(brk.endMinutes)}
                        onChange={(event) => updateBreak(index, { endMinutes: timeInputToMinutes(event.target.value) })}
                        className="rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900"
                      />
                      <input
                        value={brk.label}
                        onChange={(event) => updateBreak(index, { label: event.target.value })}
                        placeholder="Label"
                        className="w-28 rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900"
                      />
                      <button
                        type="button"
                        onClick={() => removeBreak(index)}
                        className="flex min-h-11 items-center px-1 text-sm text-ink-700 hover:text-ink-900"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addBreak}
                    className="mt-1 flex min-h-11 items-center self-start px-1 text-sm text-ink-700 hover:text-ink-900"
                  >
                    + Add break
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-ink-900">Booking rules</h3>
                <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-sm text-ink-700">
                    Buffer between interviews (minutes)
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={bufferMinutes}
                      onChange={(event) => setBufferMinutes(Number(event.target.value))}
                      className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-ink-700">
                    Minimum notice (minutes)
                    <input
                      type="number"
                      min={0}
                      step={15}
                      value={minNoticeMinutes}
                      onChange={(event) => setMinNoticeMinutes(Number(event.target.value))}
                      className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-ink-700">
                    Maximum booking window (days)
                    <input
                      type="number"
                      min={1}
                      value={maxBookingWindowDays}
                      onChange={(event) => setMaxBookingWindowDays(Number(event.target.value))}
                      className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                    />
                  </label>
                </div>
              </div>

              {scheduleMessage && <p className="text-sm text-available">{scheduleMessage}</p>}
              {scheduleError && (
                <p role="alert" className="text-sm text-conflict">
                  {scheduleError}
                </p>
              )}
              <Button type="submit" variant="primary" isLoading={scheduleMutation.isPending} className="self-start">
                {scheduleMutation.isPending ? 'Saving…' : 'Save calendar'}
              </Button>
            </form>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
          <h2 className="flex items-center gap-1.5 text-md font-medium text-ink-900">
            <UserRound size={16} aria-hidden="true" className="text-amber-600" />
            Your account
          </h2>
          <form onSubmit={handleProfileSubmit} className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Full name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Email
              <input
                type="email"
                value={session.data?.user.email ?? ''}
                disabled
                className="rounded-md border border-hairline bg-paper-100 px-3 py-2 text-base text-ink-500"
              />
            </label>
            {profileMessage && <p className="text-sm text-available">{profileMessage}</p>}
            {profileError && (
              <p role="alert" className="text-sm text-conflict">
                {profileError}
              </p>
            )}
            <Button type="submit" variant="secondary" isLoading={profileMutation.isPending} className="self-start">
              {profileMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </section>

        <section className="mt-6 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
          <h2 className="flex items-center gap-1.5 text-md font-medium text-ink-900">
            <KeyRound size={16} aria-hidden="true" className="text-amber-600" />
            Password
          </h2>
          <form onSubmit={handlePasswordSubmit} className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
            {passwordMessage && <p className="text-sm text-available">{passwordMessage}</p>}
            {passwordError && (
              <p role="alert" className="text-sm text-conflict">
                {passwordError}
              </p>
            )}
            <Button type="submit" variant="secondary" isLoading={passwordMutation.isPending} className="self-start">
              {passwordMutation.isPending ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        </section>

        <section className="mt-6 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
          <Button variant="danger" onClick={() => logoutMutation.mutate()}>
            <LogOut size={14} aria-hidden="true" />
            Log out
          </Button>
        </section>
      </div>
    </RecruiterLayout>
  )
}
