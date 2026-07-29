import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deletePhoto, uploadPhoto } from '@/features/auth/api/authApi'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'

/** Single-photo upload (unlike ResumeManager's multi-resume list) — a new upload replaces
 * whatever photo the user previously had, backed by server/src/services/avatar.service.ts. */
export function PhotoUploader({ name, photoUrl }: { name: string; photoUrl: string }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['user-session'] })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadPhoto(file),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Upload failed.'),
  })

  const deleteMutation = useMutation({ mutationFn: () => deletePhoto(), onSuccess: invalidate })

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    event.target.value = ''
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} photoUrl={photoUrl} size="lg" />
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="flex min-h-9 items-center justify-center rounded-pill border border-hairline px-3 text-xs font-medium text-ink-700 hover:text-ink-900 disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Uploading…' : photoUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {photoUrl && (
            <Button variant="secondary" size="sm" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              Remove
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-conflict">
            {error}
          </p>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect} className="hidden" />
      </div>
    </div>
  )
}
