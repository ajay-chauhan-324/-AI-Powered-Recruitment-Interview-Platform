import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Header } from '@/components/layout/Header'
import { TimeCanvas, type CanvasZoom } from '@/features/calendar/components/TimeCanvas'
import { AiRibbon } from '@/features/ai/components/AiRibbon'
import { BookingPanel } from '@/features/booking/components/BookingPanel'
import { DEFAULT_INTERVIEW_DURATION_MINUTES, computeDefaultBookingStart } from '@/features/booking/constants'

export function CalendarApp() {
  const [zoom, setZoom] = useState<CanvasZoom>('day')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [bookingDraftStart, setBookingDraftStart] = useState<Date | null>(null)

  return (
    <>
      <AppShell
        header={
          <Header
            zoom={zoom}
            onZoomChange={setZoom}
            anchorDate={anchorDate}
            onAnchorDateChange={setAnchorDate}
            onBookNew={() => setBookingDraftStart(computeDefaultBookingStart())}
          />
        }
        canvas={
          <TimeCanvas
            zoom={zoom}
            anchorDate={anchorDate}
            onAnchorDateChange={setAnchorDate}
            onZoomChange={setZoom}
            onSelectSlot={setBookingDraftStart}
          />
        }
        ribbon={<AiRibbon />}
      />
      {bookingDraftStart && (
        <BookingPanel
          initialStart={bookingDraftStart}
          durationMinutes={DEFAULT_INTERVIEW_DURATION_MINUTES}
          onClose={() => setBookingDraftStart(null)}
        />
      )}
    </>
  )
}
