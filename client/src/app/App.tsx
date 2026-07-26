import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Header } from '@/components/layout/Header'
import { TimeCanvas, type CanvasZoom } from '@/features/calendar/components/TimeCanvas'
import { AiRibbon } from '@/features/ai/components/AiRibbon'

export function App() {
  const [zoom, setZoom] = useState<CanvasZoom>('day')
  const [anchorDate, setAnchorDate] = useState(() => new Date())

  return (
    <AppShell
      header={
        <Header zoom={zoom} onZoomChange={setZoom} anchorDate={anchorDate} onAnchorDateChange={setAnchorDate} />
      }
      canvas={
        <TimeCanvas
          zoom={zoom}
          anchorDate={anchorDate}
          onAnchorDateChange={setAnchorDate}
          onZoomChange={setZoom}
        />
      }
      ribbon={<AiRibbon />}
    />
  )
}
