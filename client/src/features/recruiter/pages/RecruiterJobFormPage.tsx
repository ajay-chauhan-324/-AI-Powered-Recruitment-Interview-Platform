import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { RecruiterLayout } from '@/components/layout/RecruiterLayout'
import {
  createRecruiterJob,
  fetchRecruiterJob,
  updateRecruiterJob,
  type EmploymentType,
  type ExperienceLevel,
  type PipelineStage,
  type WorkplaceType,
} from '@/features/recruiter/api/recruiterApi'
import type { InterviewLocationType, InterviewType } from '@/features/booking/api/bookingApi'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { ApiError } from '@/lib/apiClient'

const EMPLOYMENT_OPTIONS: Array<{ value: EmploymentType; label: string }> = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
]

const WORKPLACE_OPTIONS: Array<{ value: WorkplaceType; label: string }> = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
]

const EXPERIENCE_OPTIONS: Array<{ value: ExperienceLevel; label: string }> = [
  { value: 'entry', label: 'Entry' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'executive', label: 'Executive' },
]

const INTERVIEW_TYPE_OPTIONS: Array<{ value: InterviewType; label: string }> = [
  { value: 'hr_screening', label: 'HR Screening' },
  { value: 'technical', label: 'Technical' },
  { value: 'coding', label: 'Coding' },
  { value: 'system_design', label: 'System Design' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'managerial', label: 'Managerial' },
  { value: 'final', label: 'Final' },
  { value: 'panel', label: 'Panel' },
  { value: 'custom', label: 'Other' },
]

/** A round's title is derived automatically from its type (e.g. "Behavioral" ->
 * "Behavioral Interview") — the round builder deliberately only exposes Type/Duration/
 * Location; interviewer/meeting-link/instructions detail is configured later, per candidate,
 * when the recruiter unlocks the round (RecruiterApplicationDetailPage's AdvanceRoundForm). */
const INTERVIEW_TYPE_TITLE: Record<InterviewType, string> = {
  hr_screening: 'HR Screening',
  technical: 'Technical Interview',
  coding: 'Coding Interview',
  system_design: 'System Design Interview',
  behavioral: 'Behavioral Interview',
  managerial: 'Managerial Interview',
  final: 'Final Interview',
  panel: 'Panel Interview',
  custom: 'Interview',
}

function blankStage(order: number): PipelineStage {
  return {
    order,
    type: 'technical',
    title: INTERVIEW_TYPE_TITLE.technical,
    durationMinutes: 60,
    instructions: '',
    locationType: 'video',
  }
}

/** Recomputes `order` from array position — the backend requires rounds to be exactly
 * 1..N sequential (job.validators.ts's pipelineInputSchema), so reordering/removing a row
 * must always renumber the rest rather than leaving gaps. */
function renumber(stages: PipelineStage[]): PipelineStage[] {
  return stages.map((stage, index) => ({ ...stage, order: index + 1 }))
}

function skillsToText(skills: string[]): string {
  return skills.join(', ')
}

function textToSkills(text: string): string[] {
  return text
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)
}

export function RecruiterJobFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const jobQuery = useQuery({
    queryKey: ['recruiter-job', id],
    queryFn: () => fetchRecruiterJob(id!),
    enabled: isEditing,
  })

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time')
  const [workplaceType, setWorkplaceType] = useState<WorkplaceType>('onsite')
  const [location, setLocation] = useState('')
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('mid')
  const [minExperienceYears, setMinExperienceYears] = useState(0)
  const [requiredSkillsText, setRequiredSkillsText] = useState('')
  const [preferredSkillsText, setPreferredSkillsText] = useState('')
  const [educationRequirement, setEducationRequirement] = useState('')
  const [pipeline, setPipeline] = useState<PipelineStage[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const job = jobQuery.data?.job
    if (!job) return
    setTitle(job.title)
    setDescription(job.description)
    setEmploymentType(job.employmentType)
    setWorkplaceType(job.workplaceType)
    setLocation(job.location)
    setExperienceLevel(job.experienceLevel)
    setMinExperienceYears(job.minExperienceYears)
    setRequiredSkillsText(skillsToText(job.requiredSkills))
    setPreferredSkillsText(skillsToText(job.preferredSkills))
    setEducationRequirement(job.educationRequirement)
    setPipeline(job.pipeline)
  }, [jobQuery.data])

  function updateStage(index: number, patch: Partial<PipelineStage>) {
    setPipeline((stages) => stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)))
  }

  function updateStageType(index: number, type: InterviewType) {
    updateStage(index, { type, title: INTERVIEW_TYPE_TITLE[type] })
  }

  function addStage() {
    setPipeline((stages) => [...stages, blankStage(stages.length + 1)])
  }

  function removeStage(index: number) {
    setPipeline((stages) => renumber(stages.filter((_, i) => i !== index)))
  }

  function moveStage(index: number, direction: -1 | 1) {
    setPipeline((stages) => {
      const target = index + direction
      if (target < 0 || target >= stages.length) return stages
      const next = stages.slice()
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return renumber(next)
    })
  }

  function buildInput() {
    return {
      title,
      description,
      employmentType,
      workplaceType,
      location,
      experienceLevel,
      minExperienceYears,
      requiredSkills: textToSkills(requiredSkillsText),
      preferredSkills: textToSkills(preferredSkillsText),
      educationRequirement,
      pipeline: renumber(pipeline),
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => (isEditing ? updateRecruiterJob(id!, buildInput()) : createRecruiterJob(buildInput())),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recruiter-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['recruiter-job', data.job.id] })
      navigate('/recruiter/jobs', { replace: true })
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (title.trim().length === 0) {
      setError('Title is required.')
      return
    }
    saveMutation.mutate()
  }

  if (isEditing && jobQuery.isLoading) {
    return (
      <RecruiterLayout>
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </RecruiterLayout>
    )
  }

  return (
    <RecruiterLayout>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-medium text-ink-900">{isEditing ? 'Edit job' : 'Post a job'}</h1>
        <p className="mt-1 text-sm text-ink-700">
          {isEditing ? 'Update this job posting.' : "It's saved as a draft — publish it when you're ready."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Job title
            <input
              required
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Description
            <textarea
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Employment type
              <select
                value={employmentType}
                onChange={(event) => setEmploymentType(event.target.value as EmploymentType)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              >
                {EMPLOYMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Workplace type
              <select
                value={workplaceType}
                onChange={(event) => setWorkplaceType(event.target.value as WorkplaceType)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              >
                {WORKPLACE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Location
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Experience level
              <select
                value={experienceLevel}
                onChange={(event) => setExperienceLevel(event.target.value as ExperienceLevel)}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              >
                {EXPERIENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-700">
              Minimum years of experience
              <input
                type="number"
                min={0}
                max={60}
                value={minExperienceYears}
                onChange={(event) => setMinExperienceYears(Number(event.target.value))}
                className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Required skills (comma-separated)
            <input
              type="text"
              value={requiredSkillsText}
              onChange={(event) => setRequiredSkillsText(event.target.value)}
              placeholder="Node.js, TypeScript, MongoDB"
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Preferred skills (comma-separated)
            <input
              type="text"
              value={preferredSkillsText}
              onChange={(event) => setPreferredSkillsText(event.target.value)}
              placeholder="AWS, Docker"
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink-700">
            Education requirement (optional)
            <input
              type="text"
              value={educationRequirement}
              onChange={(event) => setEducationRequirement(event.target.value)}
              className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
            />
          </label>

          <div className="flex flex-col gap-2 border-t border-hairline pt-4">
            <div>
              <p className="text-sm font-medium text-ink-900">Interview pipeline</p>
              <p className="text-xs text-ink-700">
                The ordered rounds a candidate moves through — a recruiter unlocks them one at a time as candidates
                pass. A job needs at least one round before it can be published.
              </p>
            </div>

            {pipeline.length === 0 && (
              <p className="rounded-md border border-dashed border-hairline px-3 py-4 text-center text-sm text-ink-700">
                No rounds yet. Add the first one below.
              </p>
            )}

            <div className="flex flex-col gap-3">
              {pipeline.map((stage, index) => (
                <div key={index} className="rounded-md border border-hairline bg-paper-100 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline font-mono text-xs text-ink-700">
                      {index + 1}
                    </span>
                    <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="flex flex-col gap-1 text-sm text-ink-700">
                        Round type
                        <select
                          value={stage.type}
                          onChange={(event) => updateStageType(index, event.target.value as InterviewType)}
                          className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                        >
                          {INTERVIEW_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-sm text-ink-700">
                        Duration (minutes)
                        <input
                          type="number"
                          min={15}
                          max={480}
                          step={15}
                          value={stage.durationMinutes}
                          onChange={(event) => updateStage(index, { durationMinutes: Number(event.target.value) })}
                          className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm text-ink-700">
                        Location
                        <select
                          value={stage.locationType}
                          onChange={(event) => updateStage(index, { locationType: event.target.value as InterviewLocationType })}
                          className="rounded-md border border-hairline bg-paper-50 px-3 py-2 text-base text-ink-900 focus-visible:outline-none"
                        >
                          <option value="video">Video</option>
                          <option value="phone">Phone</option>
                          <option value="onsite">On-site</option>
                          <option value="custom">Custom</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => moveStage(index, -1)}
                        disabled={index === 0}
                        aria-label="Move round up"
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-700 hover:bg-paper-200 disabled:opacity-30"
                      >
                        <ChevronUp size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStage(index, 1)}
                        disabled={index === pipeline.length - 1}
                        aria-label="Move round down"
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-700 hover:bg-paper-200 disabled:opacity-30"
                      >
                        <ChevronDown size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStage(index)}
                        aria-label="Remove round"
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-conflict hover:bg-conflict-tint"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button type="button" variant="secondary" size="sm" onClick={addStage} className="w-fit">
              <Plus size={14} aria-hidden="true" />
              Add round
            </Button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-conflict">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex min-h-11 items-center justify-center rounded-pill border border-amber-600 bg-amber-100 px-4 text-sm font-medium text-ink-900 hover:bg-amber-100/70 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Save as draft'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/recruiter/jobs')}
              className="flex min-h-11 items-center justify-center rounded-pill border border-hairline px-4 text-sm font-medium text-ink-700 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </RecruiterLayout>
  )
}
