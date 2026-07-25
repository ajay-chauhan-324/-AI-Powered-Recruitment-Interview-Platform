import { useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Header } from '@/components/layout/Header'
import { TimeCanvas, type CanvasZoom } from '@/features/calendar/components/TimeCanvas'
import { AiRibbon } from '@/features/ai/components/AiRibbon'

export function App() {
  const [zoom, setZoom] = useState<CanvasZoom>('day')

  const dateLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    [],
  )

  return (
    <AppShell
      header={<Header zoom={zoom} onZoomChange={setZoom} dateLabel={dateLabel} />}
      canvas={<TimeCanvas zoom={zoom} />}
      ribbon={<AiRibbon />}
    />
  )
}
