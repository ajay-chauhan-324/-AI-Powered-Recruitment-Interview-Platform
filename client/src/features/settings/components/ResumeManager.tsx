import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteResume, fetchResumes, resumeDownloadUrl, setDefaultResume, uploadResume } from '@/features/settings/api/resumesApi'
import { Skeleton } from '@/components/ui/Skeleton'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(0)} KB`
}

/** Candidate resume management — upload/list/default/delete, backed by the local-disk
 * storage service (server/src/services/resume.service.ts). Accepts PDF and plain-text only,
 * matching what the backend can actually extract text from for the ATS pipeline. */
export function ResumeManager() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const resumesQuery = useQuery({ queryKey: ['resumes'], queryFn: fetchResumes })
  const resumes = resumesQuery.data?.resumes ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['resumes'] })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadResume(file),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Upload failed.'),
  })

  const defaultMutation = useMutation({ mutationFn: (id: string) => setDefaultResume(id), onSuccess: invalidate })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteResume(id),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    // A resume attached to a job application can't be deleted (server-enforced) — this is
    // the one real failure mode here, so it needs to actually reach the user, not fail silently.
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Delete failed.'),
  })

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    event.target.value = ''
  }

  return (
    <section className="mt-6 rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag">
      <h2 className="text-md font-medium text-ink-900">Resumes</h2>
      <p className="mt-1 text-sm text-ink-700">Upload a PDF or plain-text resume. Your default resume is used when you apply.</p>

      {resumesQuery.isLoading && (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!resumesQuery.isLoading && resumes.length === 0 && (
        <p className="mt-3 text-sm text-ink-700">No resumes uploaded yet.</p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {resumes.map((resume) => (
          <div key={resume.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{resume.fileName}</p>
              <p className="text-xs text-ink-700">
                {formatSize(resume.sizeBytes)} · {new Date(resume.createdAt).toLocaleDateString()}
                {resume.isDefault && <span className="ml-1.5 font-medium text-amber-600">· Default</span>}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <a
                href={resumeDownloadUrl(resume.id)}
                className="flex min-h-9 items-center rounded-pill border border-hairline px-3 text-xs font-medium text-ink-700 hover:text-ink-900"
              >
                Download
              </a>
              {!resume.isDefault && (
                <button
                  type="button"
                  onClick={() => defaultMutation.mutate(resume.id)}
                  className="flex min-h-9 items-center rounded-pill border border-hairline px-3 text-xs font-medium text-ink-700 hover:text-ink-900"
                >
                  Set default
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteMutation.mutate(resume.id)}
                className="flex min-h-9 items-center rounded-pill border border-conflict/40 px-3 text-xs font-medium text-conflict hover:bg-conflict-tint"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-conflict">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,text/plain"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className="mt-4 flex min-h-11 items-center justify-center rounded-pill border border-hairline px-4 text-sm font-medium text-ink-700 hover:text-ink-900 disabled:opacity-50"
      >
        {uploadMutation.isPending ? 'Uploading…' : 'Upload resume'}
      </button>
    </section>
  )
}
