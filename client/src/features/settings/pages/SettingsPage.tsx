import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LogOut, Plus, Trash2, UserRound } from 'lucide-react'
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import {
  changePassword,
  logoutUser,
  updateProfile,
  type EducationEntry,
  type ExperienceEntry,
  type ExperienceLevel,
  type ProjectEntry,
} from '@/features/auth/api/authApi'
import { ResumeManager } from '@/features/settings/components/ResumeManager'
import { PhotoUploader } from '@/features/settings/components/PhotoUploader'
import { ApiError } from '@/lib/apiClient'
import { Button } from '@/components/ui/Button'

const EXPERIENCE_LEVEL_OPTIONS: Array<{ value: ExperienceLevel; label: string }> = [
  { value: 'entry', label: 'Entry' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'executive', label: 'Executive' },
]

const TIMEZONE_OPTIONS: string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-700">
      {label}
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
      />
    </label>
  )
}

/** Reused shape for the three "add/remove rows of structured fields" sections below —
 * education, experience, and projects each render their own inputs (different shapes), but
 * share this same add/remove row chrome. */
function ListEditorSection<T>({
  title,
  entries,
  onAdd,
  onRemove,
  emptyEntry,
  renderRow,
}: {
  title: string
  entries: T[]
  onAdd: (entry: T) => void
  onRemove: (index: number) => void
  emptyEntry: T
  renderRow: (entry: T, index: number) => React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-900">{title}</p>
        <button
          type="button"
          onClick={() => onAdd(emptyEntry)}
          className="flex min-h-8 items-center gap-1 rounded-pill border border-hairline px-2.5 text-xs font-medium text-ink-700 hover:text-ink-900"
        >
          <Plus size={12} aria-hidden="true" />
          Add
        </button>
      </div>
      {entries.length === 0 && <p className="text-xs text-ink-500">None added yet.</p>}
      {entries.map((entry, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-md border border-hairline bg-paper-100 p-3">
          {renderRow(entry, index)}
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="flex w-fit items-center gap-1 text-xs font-medium text-conflict hover:underline"
          >
            <Trash2 size={12} aria-hidden="true" />
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}

export function SettingsPage() {
  const session = useUserSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = session.data?.user

  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedIn, setLinkedIn] = useState('')
  const [github, setGithub] = useState('')
  const [portfolioUrl, setPortfolioUrl] = useState('')
  const [headline, setHeadline] = useState('')
  const [about, setAbout] = useState('')
  const [location, setLocation] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | ''>('')
  const [education, setEducation] = useState<EducationEntry[]>([])
  const [experience, setExperience] = useState<ExperienceEntry[]>([])
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setName(user.name)
    setTimezone(user.timezone)
    setPhone(user.phone)
    setLinkedIn(user.linkedIn)
    setGithub(user.github)
    setPortfolioUrl(user.portfolioUrl)
    setHeadline(user.headline)
    setAbout(user.about)
    setLocation(user.location)
    setSkillsText(user.skills.join(', '))
    setExperienceLevel(user.experienceLevel ?? '')
    setEducation(user.education)
    setExperience(user.experience)
    setProjects(user.projects)
  }, [user])

  const isCandidate = user?.accountType === 'candidate'

  const profileMutation = useMutation({
    mutationFn: () =>
      updateProfile({
        name,
        timezone,
        phone,
        linkedIn,
        github,
        portfolioUrl,
        headline,
        about,
        location,
        skills: skillsText
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        experienceLevel: experienceLevel || undefined,
        education,
        experience,
        projects,
      }),
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
      // Clear the cache synchronously rather than invalidate-then-navigate — the landing
      // page itself doesn't gate on auth, but any guarded route reached via back/forward
      // navigation right after logout must never see a stale "still signed in" cache entry.
      queryClient.setQueryData(['user-session'], null)
      navigate('/', { replace: true })
    },
  })

  function handleProfileSubmit(event: FormEvent) {
    event.preventDefault()
    setProfileMessage(null)
    profileMutation.mutate()
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
    <AuthenticatedLayout>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-medium text-ink-900">Settings</h1>
        <p className="mt-1 text-sm text-ink-700">Manage your profile, timezone, and account.</p>

        {user && (
          <>
            <section className="mt-6 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
              <h2 className="flex items-center gap-1.5 text-md font-medium text-ink-900">
                <UserRound size={16} aria-hidden="true" className="text-amber-600" />
                Profile
              </h2>

              <div className="mt-4">
                <PhotoUploader name={user.name} photoUrl={user.photoUrl} />
              </div>

              <form onSubmit={handleProfileSubmit} className="mt-4 flex flex-col gap-4">
                <TextField label="Full name" value={name} onChange={setName} autoComplete="name" />
                <label className="flex flex-col gap-1 text-sm text-ink-700">
                  Email
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    className="rounded-md border border-hairline bg-paper-100 px-3 py-2 text-base text-ink-500"
                  />
                  <span className="text-xs text-ink-500">Email can't be changed yet.</span>
                </label>

                <label className="flex flex-col gap-1 text-sm text-ink-700">
                  Timezone
                  {TIMEZONE_OPTIONS.length > 0 ? (
                    <select
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                    >
                      {!TIMEZONE_OPTIONS.includes(timezone) && <option value={timezone}>{timezone}</option>}
                      {TIMEZONE_OPTIONS.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                    />
                  )}
                </label>

                <TextField label={isCandidate ? 'Headline' : 'Headline (optional)'} value={headline} onChange={setHeadline} />
                <label className="flex flex-col gap-1 text-sm text-ink-700">
                  About (optional)
                  <textarea
                    rows={3}
                    value={about}
                    onChange={(event) => setAbout(event.target.value)}
                    placeholder="A short summary about yourself…"
                    className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                  />
                </label>
                <TextField label={isCandidate ? 'Location' : 'Location (optional)'} value={location} onChange={setLocation} />
                <label className="flex flex-col gap-1 text-sm text-ink-700">
                  Experience level (optional)
                  <select
                    value={experienceLevel}
                    onChange={(event) => setExperienceLevel(event.target.value as ExperienceLevel | '')}
                    className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                  >
                    <option value="">Not specified</option>
                    {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-ink-700">
                  {isCandidate ? 'Skills (comma-separated)' : 'Skills (comma-separated, optional)'}
                  <input
                    type="text"
                    value={skillsText}
                    onChange={(event) => setSkillsText(event.target.value)}
                    placeholder="TypeScript, React, Node.js"
                    className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                  />
                </label>
                <TextField label={isCandidate ? 'Phone' : 'Phone (optional)'} value={phone} onChange={setPhone} autoComplete="tel" />
                <TextField label={isCandidate ? 'LinkedIn' : 'LinkedIn (optional)'} value={linkedIn} onChange={setLinkedIn} type="url" />
                <TextField label="GitHub (optional)" value={github} onChange={setGithub} type="url" />
                <TextField label="Portfolio URL (optional)" value={portfolioUrl} onChange={setPortfolioUrl} type="url" />

                <ListEditorSection<EducationEntry>
                  title={isCandidate ? 'Education' : 'Education (optional)'}
                  entries={education}
                  emptyEntry={{ institution: '', degree: '', fieldOfStudy: '', endYear: undefined }}
                  onAdd={(entry) => setEducation((prev) => [...prev, entry])}
                  onRemove={(index) => setEducation((prev) => prev.filter((_, i) => i !== index))}
                  renderRow={(entry, index) => (
                    <>
                      <TextField
                        label="Institution"
                        value={entry.institution}
                        onChange={(value) => setEducation((prev) => prev.map((e, i) => (i === index ? { ...e, institution: value } : e)))}
                      />
                      <TextField
                        label="Degree"
                        value={entry.degree ?? ''}
                        onChange={(value) => setEducation((prev) => prev.map((e, i) => (i === index ? { ...e, degree: value } : e)))}
                      />
                      <TextField
                        label="Field of study"
                        value={entry.fieldOfStudy ?? ''}
                        onChange={(value) => setEducation((prev) => prev.map((e, i) => (i === index ? { ...e, fieldOfStudy: value } : e)))}
                      />
                      <TextField
                        label="End year"
                        type="number"
                        value={entry.endYear ? String(entry.endYear) : ''}
                        onChange={(value) =>
                          setEducation((prev) => prev.map((e, i) => (i === index ? { ...e, endYear: value ? Number(value) : undefined } : e)))
                        }
                      />
                    </>
                  )}
                />

                <ListEditorSection<ExperienceEntry>
                  title="Experience (optional)"
                  entries={experience}
                  emptyEntry={{ title: '', company: '', startDate: '', endDate: '', description: '' }}
                  onAdd={(entry) => setExperience((prev) => [...prev, entry])}
                  onRemove={(index) => setExperience((prev) => prev.filter((_, i) => i !== index))}
                  renderRow={(entry, index) => (
                    <>
                      <TextField
                        label="Title"
                        value={entry.title}
                        onChange={(value) => setExperience((prev) => prev.map((e, i) => (i === index ? { ...e, title: value } : e)))}
                      />
                      <TextField
                        label="Company"
                        value={entry.company}
                        onChange={(value) => setExperience((prev) => prev.map((e, i) => (i === index ? { ...e, company: value } : e)))}
                      />
                      <TextField
                        label="Start date"
                        value={entry.startDate ?? ''}
                        onChange={(value) => setExperience((prev) => prev.map((e, i) => (i === index ? { ...e, startDate: value } : e)))}
                      />
                      <TextField
                        label="End date"
                        value={entry.endDate ?? ''}
                        onChange={(value) => setExperience((prev) => prev.map((e, i) => (i === index ? { ...e, endDate: value } : e)))}
                      />
                      <label className="flex flex-col gap-1 text-sm text-ink-700">
                        Description
                        <textarea
                          rows={2}
                          value={entry.description ?? ''}
                          onChange={(event) =>
                            setExperience((prev) => prev.map((e, i) => (i === index ? { ...e, description: event.target.value } : e)))
                          }
                          className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                        />
                      </label>
                    </>
                  )}
                />

                <ListEditorSection<ProjectEntry>
                  title="Projects (optional)"
                  entries={projects}
                  emptyEntry={{ title: '', description: '', url: '' }}
                  onAdd={(entry) => setProjects((prev) => [...prev, entry])}
                  onRemove={(index) => setProjects((prev) => prev.filter((_, i) => i !== index))}
                  renderRow={(entry, index) => (
                    <>
                      <TextField
                        label="Title"
                        value={entry.title}
                        onChange={(value) => setProjects((prev) => prev.map((e, i) => (i === index ? { ...e, title: value } : e)))}
                      />
                      <label className="flex flex-col gap-1 text-sm text-ink-700">
                        Description
                        <textarea
                          rows={2}
                          value={entry.description ?? ''}
                          onChange={(event) =>
                            setProjects((prev) => prev.map((e, i) => (i === index ? { ...e, description: event.target.value } : e)))
                          }
                          className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                        />
                      </label>
                      <TextField
                        label="URL"
                        value={entry.url ?? ''}
                        onChange={(value) => setProjects((prev) => prev.map((e, i) => (i === index ? { ...e, url: value } : e)))}
                      />
                    </>
                  )}
                />

                {profileMessage && <p className="text-sm text-available">{profileMessage}</p>}
                {profileError && (
                  <p role="alert" className="text-sm text-conflict">
                    {profileError}
                  </p>
                )}

                <Button type="submit" variant="primary" isLoading={profileMutation.isPending} className="self-start">
                  {profileMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </form>
            </section>

            <ResumeManager />

            <section className="mt-6 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
              <h2 className="flex items-center gap-1.5 text-md font-medium text-ink-900">
                <KeyRound size={16} aria-hidden="true" className="text-amber-600" />
                Password
              </h2>
              <form onSubmit={handlePasswordSubmit} className="mt-4 flex flex-col gap-4">
                <TextField
                  label="Current password"
                  type="password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                />
                <TextField
                  label="New password"
                  type="password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />
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
              <h2 className="text-md font-medium text-ink-900">Account</h2>
              <p className="mt-2 text-sm text-ink-700">Signed in as {user.email}.</p>
              <Button variant="danger" onClick={() => logoutMutation.mutate()} className="mt-4">
                <LogOut size={14} aria-hidden="true" />
                Log out
              </Button>
            </section>
          </>
        )}
      </div>
    </AuthenticatedLayout>
  )
}
