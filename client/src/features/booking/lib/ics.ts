/** Minimal RFC 5545 (iCalendar) generation — just enough for a single VEVENT so "Add to
 * calendar" works without a third-party dependency. No recurrence, no timezone VTIMEZONE
 * block (times are emitted in UTC with a trailing Z, which every calendar client resolves
 * correctly regardless of the viewer's own timezone). */
function toIcsUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export interface IcsEventInput {
  uid: string
  title: string
  description?: string
  location?: string
  startAt: Date
  endAt: Date
}

export function buildIcsDataUrl(event: IcsEventInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Ledger//Interview Scheduling//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsUtcStamp(new Date())}`,
    `DTSTART:${toIcsUtcStamp(event.startAt)}`,
    `DTEND:${toIcsUtcStamp(event.endAt)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const content = lines.join('\r\n')
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(content)}`
}
