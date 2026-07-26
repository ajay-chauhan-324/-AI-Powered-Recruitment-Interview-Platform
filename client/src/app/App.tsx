import { Route, Routes } from 'react-router-dom'
import { CalendarApp } from './CalendarApp'
import { ManageInterviewPage } from '@/features/booking/pages/ManageInterviewPage'
import { AdminLoginPage } from '@/features/admin/pages/AdminLoginPage'
import { AdminDashboardPage } from '@/features/admin/pages/AdminDashboardPage'
import { AdminCalendarPage } from '@/features/admin/pages/AdminCalendarPage'
import { AdminCandidatesPage } from '@/features/admin/pages/AdminCandidatesPage'
import { AdminSchedulePage } from '@/features/admin/pages/AdminSchedulePage'
import { RequireAdmin } from '@/features/admin/components/RequireAdmin'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<CalendarApp />} />
      <Route path="/manage/:token" element={<ManageInterviewPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminDashboardPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/calendar"
        element={
          <RequireAdmin>
            <AdminCalendarPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/candidates"
        element={
          <RequireAdmin>
            <AdminCandidatesPage />
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
