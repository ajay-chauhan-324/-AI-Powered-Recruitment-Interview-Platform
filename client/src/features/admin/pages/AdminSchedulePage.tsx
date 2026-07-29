import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAdminBlockedSlot,
  deleteAdminBlockedSlot,
  fetchAdminBlockedSlots,
  fetchAdminSchedule,
  saveAdminSchedule,
  type RecurringBreakEntry,
  type WorkingHoursEntry,
} from '@/features/admin/api/adminApi'
import { AdminNav } from '@/features/admin/components/AdminNav'
import { ApiError } from '@/lib/apiClient'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BLOCKED_SLOT_WINDOW_DAYS = 90

function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function defaultWorkingHours(): WorkingHoursEntry[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    startMinutes: 540,
    endMinutes: 1020,
    isActive: dayOfWeek >= 1 && dayOfWeek <= 5,
  }))
}

export function AdminSchedulePage() {
  const queryClient = useQueryClient()
  const scheduleQuery = useQuery({ queryKey: ['admin-schedule'], queryFn: fetchAdminSchedule })

  const [timezone, setTimezone] = useState('America/New_York')
  const [workingHours, setWorkingHours] = useState<WorkingHoursEntry[]>(defaultWorkingHours())
  const [breaks, setBreaks] = useState<RecurringBreakEntry[]>([])
  const [bufferMinutes, setBufferMinutes] = useState(0)
  const [minNoticeMinutes, setMinNoticeMinutes] = useState(0)
  const [maxBookingWindowDays, setMaxBookingWindowDays] = useState(60)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (scheduleQuery.data?.schedule) {
      setTimezone(scheduleQuery.data.schedule.timezone)
      setWorkingHours(scheduleQuery.data.schedule.workingHours)
      setBreaks(scheduleQuery.data.schedule.breaks)
      setBufferMinutes(scheduleQuery.data.schedule.bufferMinutes)
      setMinNoticeMinutes(scheduleQuery.data.schedule.minNoticeMinutes)
      setMaxBookingWindowDays(scheduleQuery.data.schedule.maxBookingWindowDays)
    }
  }, [scheduleQuery.data])

  const saveMutation = useMutation({
    mutationFn: () =>
      saveAdminSchedule({ timezone, workingHours, breaks, bufferMinutes, minNoticeMinutes, maxBookingWindowDays }),
    onSuccess: () => {
      setSaveError(null)
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['admin-schedule'] })
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (error: unknown) => setSaveError(error instanceof ApiError ? error.message : 'Something went wrong.'),
  })

  const blockedFrom = new Date()
  const blockedTo = new Date(blockedFrom.getTime() + BLOCKED_SLOT_WINDOW_DAYS * 86_400_000)
  const blockedSlotsQuery = useQuery({
    queryKey: ['admin-blocked-slots-settings'],
    queryFn: () => fetchAdminBlockedSlots(blockedFrom, blockedTo),
  })

  const [blockLabel, setBlockLabel] = useState('')
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockError, setBlockError] = useState<string | null>(null)

  const createBlockMutation = useMutation({
    mutationFn: () =>
      createAdminBlockedSlot(blockLabel, new Date(blockStart).toISOString(), new Date(blockEnd).toISOString()),
    onSuccess: () => {
      setBlockLabel('')
      setBlockStart('')
      setBlockEnd('')
      setBlockError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-blocked-slots-settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-blocked-slots'] })
    },
    onError: (error: unknown) => setBlockError(error instanceof ApiError ? error.message : 'Something went wrong.'),
  })

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => deleteAdminBlockedSlot(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blocked-slots-settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-blocked-slots'] })
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

  return (
    <div className="min-h-dvh bg-paper-100">
      <AdminNav />

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-medium text-ink-900">Schedule settings</h1>
        <p className="mt-1 mb-6 text-sm text-ink-700">Working hours, breaks, booking rules, and blocked time.</p>

        {scheduleQuery.isLoading && <p className="mb-4 text-sm text-ink-700">Loading current schedule…</p>}
        {scheduleQuery.isError && (
          <p role="alert" className="mb-4 text-sm text-conflict">
            Couldn't load the current schedule — showing blank defaults. Saving now would overwrite your real
            configuration, so Save is disabled until this loads. Please refresh to try again.
          </p>
        )}

        <section>
          <h1 className="text-lg font-medium text-ink-900">Working hours</h1>
          <label className="mt-3 flex flex-col gap-1 text-sm text-ink-700">
            Business timezone (IANA)
            <input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="w-64 rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>

          <div className="mt-4 flex flex-col gap-2">
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
                  onChange={(event) => updateWorkingHour(entry.dayOfWeek, { startMinutes: timeInputToMinutes(event.target.value) })}
                  disabled={!entry.isActive}
                  className="rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900 disabled:opacity-40"
                />
                <span className="text-sm text-ink-700">to</span>
                <input
                  type="time"
                  value={minutesToTimeInput(entry.endMinutes)}
                  onChange={(event) => updateWorkingHour(entry.dayOfWeek, { endMinutes: timeInputToMinutes(event.target.value) })}
                  disabled={!entry.isActive}
                  className="rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900 disabled:opacity-40"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-md font-medium text-ink-900">Recurring breaks</h2>
          <div className="mt-3 flex flex-col gap-2">
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
        </section>

        <section className="mt-8">
          <h2 className="text-md font-medium text-ink-900">Booking rules</h2>
          <p className="mt-1 text-sm text-ink-700">Applied by the availability engine for every booking path — public, admin, and AI.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        </section>

        {saveError && (
          <p role="alert" className="mt-4 text-sm text-conflict">
            {saveError}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setSaveError(null)
            saveMutation.mutate()
          }}
          disabled={saveMutation.isPending || scheduleQuery.isLoading || scheduleQuery.isError}
          className="mt-6 flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : saved ? 'Saved' : 'Save schedule'}
        </button>

        <section className="mt-10 border-t border-hairline pt-8">
          <h2 className="text-md font-medium text-ink-900">Blocked time</h2>
          <p className="mt-1 text-sm text-ink-700">One-off periods (holidays, vacation) — next {BLOCKED_SLOT_WINDOW_DAYS} days.</p>

          <div className="mt-4 flex flex-col gap-2">
            {blockedSlotsQuery.isLoading && <p className="text-sm text-ink-700">Loading…</p>}
            {blockedSlotsQuery.isError && (
              <p role="alert" className="text-sm text-conflict">
                Couldn't load blocked time. Please try again.
              </p>
            )}
            {blockedSlotsQuery.data?.blockedSlots.map((slot) => (
              <div key={slot.id} className="flex items-center justify-between rounded-md border border-hairline px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-ink-900">{slot.label}</p>
                  <p className="font-mono text-xs text-ink-700">
                    {new Date(slot.startAt).toLocaleString()} – {new Date(slot.endAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteBlockMutation.mutate(slot.id)}
                  className="flex min-h-11 items-center px-1 text-sm text-ink-700 hover:text-ink-900"
                >
                  Remove
                </button>
              </div>
            ))}
            {blockedSlotsQuery.data?.blockedSlots.length === 0 && (
              <p className="text-sm text-ink-700">No blocked periods scheduled.</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Label
              <input
                value={blockLabel}
                onChange={(event) => setBlockLabel(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Start
              <input
                type="datetime-local"
                value={blockStart}
                onChange={(event) => setBlockStart(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              End
              <input
                type="datetime-local"
                value={blockEnd}
                onChange={(event) => setBlockEnd(event.target.value)}
                className="rounded-md border border-hairline bg-paper-50 px-2 py-1 text-sm text-ink-900"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setBlockError(null)
                createBlockMutation.mutate()
              }}
              disabled={createBlockMutation.isPending || !blockLabel || !blockStart || !blockEnd}
              className="flex min-h-11 items-center rounded-pill border border-amber-600 bg-amber-100 px-3 text-sm font-medium text-ink-900 hover:bg-amber-100/70 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {blockError && (
            <p role="alert" className="mt-2 text-sm text-conflict">
              {blockError}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
