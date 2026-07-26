import { Route, Routes } from 'react-router-dom'
import { CalendarApp } from './CalendarApp'
import { ManageAppointmentPage } from '@/features/booking/pages/ManageAppointmentPage'
import { AdminLoginPage } from '@/features/admin/pages/AdminLoginPage'
import { AdminCalendarPage } from '@/features/admin/pages/AdminCalendarPage'
import { AdminSchedulePage } from '@/features/admin/pages/AdminSchedulePage'
import { RequireAdmin } from '@/features/admin/components/RequireAdmin'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<CalendarApp />} />
      <Route path="/manage/:token" element={<ManageAppointmentPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminCalendarPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/schedule"
        element={
          <RequireAdmin>
            <AdminSchedulePage />
          </RequireAdmin>
        }
      />
    </Routes>
  )
}
