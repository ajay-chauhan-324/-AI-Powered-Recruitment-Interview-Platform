import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, FileText, Loader2, Upload } from 'lucide-react'
import { fetchResumes, uploadResume } from '@/features/settings/api/resumesApi'
import { createApplication } from '@/features/applications/api/applicationsApi'
import { ApiError } from '@/lib/apiClient'
import { Button } from '@/components/ui/Button'

interface ApplyPanelProps {
  jobId: string
  jobTitle: string
  companyName?: string
  onClose: () => void
  onApplied: () => void
}

const STEPS = ['Resume', 'Review', 'Done'] as const

function StepHeader({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {STEPS.map((step, index) => (
        <div key={step} className="flex flex-1 items-center gap-2">
          <div
            className={
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ' +
              (index < currentIndex
                ? 'bg-available text-paper-50'
                : index === currentIndex
                  ? 'border border-amber-600 bg-amber-100 text-ink-900'
                  : 'border border-hairline text-ink-500')
            }
          >
            {index < currentIndex ? <Check size={12} aria-hidden="true" /> : index + 1}
          </div>
          <span className={'text-xs font-medium ' + (index <= currentIndex ? 'text-ink-900' : 'text-ink-500')}>{step}</span>
          {index < STEPS.length - 1 && <div className="h-px flex-1 bg-hairline" />}
        </div>
      ))}
    </div>
  )
}

/** Deliberately just a confirmation — no AI match score, skill breakdown, or recommendation
 * is ever shown to the candidate. ATS analysis is a recruiter tool (CLAUDE.md's recruitment
 * pivot: it's still computed at apply-time for the recruiter's pipeline view, just never
 * surfaced here). */
function ResultView({ jobTitle }: { jobTitle: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-available/10 text-available">
          <Check size={24} aria-hidden="true" />
        </div>
        <p className="text-md font-medium text-ink-900">Application submitted</p>
        <p className="text-sm text-ink-700">
          You've applied to <span className="font-medium text-ink-900">{jobTitle}</span>. Track its progress from your
          applications page.
        </p>
      </div>

      <Link to="/applications">
        <Button variant="primary" className="w-full">
          View my applications
        </Button>
      </Link>
    </div>
  )
}

export function ApplyPanel({ jobId, jobTitle, companyName, onClose, onApplied }: ApplyPanelProps) {
  const resumesQuery = useQuery({ queryKey: ['resumes'], queryFn: fetchResumes })
  const resumes = resumesQuery.data?.resumes ?? []
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [step, setStep] = useState<'resume' | 'review'>('resume')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const effectiveResumeId = selectedResumeId ?? resumes.find((resume) => resume.isDefault)?.id ?? resumes[0]?.id ?? null
  const effectiveResume = resumes.find((resume) => resume.id === effectiveResumeId)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadResume(file),
    onSuccess: (data) => {
      setError(null)
      setSelectedResumeId(data.resume.id)
      resumesQuery.refetch()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Upload failed.'),
  })

  const applyMutation = useMutation({
    mutationFn: () => createApplication(jobId, effectiveResumeId!),
    onSuccess: () => {
      setError(null)
      setSubmitted(true)
      onApplied()
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    event.target.value = ''
  }

  const stepIndex = submitted ? 2 : step === 'resume' ? 0 : 1

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink-900/30 data-[state=open]:animate-[dialog-overlay-in_150ms_ease-out]" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-40 max-h-[90dvh] overflow-y-auto rounded-t-lg border border-hairline bg-paper-50 p-5 shadow-sheet outline-none data-[state=open]:animate-[dialog-content-in_180ms_ease-out] sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:shadow-panel"
        >
          <Dialog.Title className="sr-only">Apply to {jobTitle}</Dialog.Title>
          <Dialog.Description className="sr-only">Select a resume, review, and submit your application.</Dialog.Description>

          {!submitted && <StepHeader currentIndex={stepIndex} />}

          {submitted ? (
            <ResultView jobTitle={jobTitle} />
          ) : step === 'resume' ? (
            <>
              <h2 className="text-md font-medium text-ink-900">Choose a resume</h2>
              <p className="mt-1 text-sm text-ink-700">Applying to {jobTitle}.</p>

              <div className="mt-4 flex flex-col gap-2">
                {resumesQuery.isLoading && <p className="text-sm text-ink-700">Loading your resumes…</p>}
                {!resumesQuery.isLoading && resumes.length === 0 && (
                  <p className="text-sm text-ink-700">You haven't uploaded a resume yet — upload one below.</p>
                )}
                {resumes.map((resume) => (
                  <label
                    key={resume.id}
                    className={
                      'flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm ' +
                      (effectiveResumeId === resume.id ? 'border-amber-600/60 bg-amber-100' : 'border-hairline bg-paper-50')
                    }
                  >
                    <input
                      type="radio"
                      name="resume"
                      checked={effectiveResumeId === resume.id}
                      onChange={() => setSelectedResumeId(resume.id)}
                    />
                    <FileText size={14} aria-hidden="true" className="shrink-0 text-ink-500" />
                    <span className="truncate text-ink-900">{resume.fileName}</span>
                    {resume.isDefault && <span className="ml-auto shrink-0 text-xs text-ink-500">Default</span>}
                  </label>
                ))}
              </div>

              <label className="mt-3 flex min-h-11 w-fit cursor-pointer items-center gap-1.5 rounded-pill border border-hairline px-4 text-sm font-medium text-ink-700 hover:text-ink-900">
                {uploadMutation.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
                {uploadMutation.isPending ? 'Uploading…' : 'Upload a new resume'}
                <input type="file" accept="application/pdf,text/plain" onChange={handleFileSelect} className="hidden" />
              </label>

              {error && (
                <p role="alert" className="mt-3 text-sm text-conflict">
                  {error}
                </p>
              )}

              <div className="mt-5 flex gap-2">
                <Button variant="secondary" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button variant="primary" disabled={!effectiveResumeId} onClick={() => setStep('review')} className="flex-1">
                  Continue
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-md font-medium text-ink-900">Confirm your application</h2>

              <div className="mt-4 flex flex-col gap-2.5 rounded-md border border-hairline bg-paper-100 p-4 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-700">You are applying for</p>
                  <p className="text-ink-900">{jobTitle}</p>
                </div>
                {companyName && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-700">Company</p>
                    <p className="text-ink-900">{companyName}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-700">Resume</p>
                  <p className="flex items-center gap-2 text-ink-900">
                    <FileText size={14} aria-hidden="true" className="text-ink-500" />
                    {effectiveResume?.fileName}
                  </p>
                </div>
              </div>

              {error && (
                <p role="alert" className="mt-3 text-sm text-conflict">
                  {error}
                </p>
              )}

              <div className="mt-5 flex gap-2">
                <Button variant="secondary" onClick={() => setStep('resume')} className="flex-1">
                  Back
                </Button>
                <Button
                  variant="primary"
                  isLoading={applyMutation.isPending}
                  onClick={() => {
                    setError(null)
                    applyMutation.mutate()
                  }}
                  className="flex-1"
                >
                  {applyMutation.isPending ? 'Applying…' : 'Apply'}
                </Button>
              </div>
            </>
          )}

          {submitted && (
            <Button variant="secondary" onClick={onClose} className="mt-4 w-full">
              Close
            </Button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
