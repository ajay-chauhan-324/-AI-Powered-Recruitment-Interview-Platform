import { Route, Routes } from 'react-router-dom'
import { CalendarApp } from './CalendarApp'
import { ManageAppointmentPage } from '@/features/booking/pages/ManageAppointmentPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<CalendarApp />} />
      <Route path="/manage/:token" element={<ManageAppointmentPage />} />
    </Routes>
  )
}
