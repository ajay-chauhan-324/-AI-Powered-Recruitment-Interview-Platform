import { useEffect, useRef } from 'react'
import { VideoOff } from 'lucide-react'

interface VideoTileProps {
  stream: MediaStream | null
  muted: boolean
  label: string
  cameraOff?: boolean
  className?: string
}

/** One video tile (local or remote) — binds a MediaStream to a <video> element via
 * srcObject, which React can't do declaratively. */
export function VideoTile({ stream, muted, label, cameraOff = false, className = '' }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-lg bg-ink-700 ${className}`}>
      {stream && !cameraOff ? (
        <video ref={videoRef} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-2 text-paper-200">
          <VideoOff size={28} aria-hidden="true" />
          <span className="text-xs">Camera off</span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-pill bg-ink-900/70 px-2 py-0.5 text-xs font-medium text-paper-50">{label}</span>
    </div>
  )
}
