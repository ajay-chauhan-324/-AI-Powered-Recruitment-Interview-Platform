import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { RequireUser } from '@/features/auth/components/RequireUser'
import { RequireRecruiter } from '@/features/recruiter/components/RequireRecruiter'
import { RequireAdmin } from '@/features/admin/components/RequireAdmin'
import { Skeleton } from '@/components/ui/Skeleton'

// Eager: the landing/auth pages are the first thing an unauthenticated visitor sees, so they
// should never wait on a lazy-chunk network round trip. Everything below is role-specific
// (candidate/recruiter/admin) and never concurrently needed by the same visitor in one
// session, so splitting it out keeps the initial bundle small (CLAUDE.md §25's dependency-
// discipline extended to code-splitting: only the entry surfaces ship eagerly).
import { LandingPage } from '@/features/marketing/pages/LandingPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { RegisterPage } from '@/features/auth/pages/RegisterPage'

const ManageInterviewPage = lazy(() => import('@/features/booking/pages/ManageInterviewPage').then((m) => ({ default: m.ManageInterviewPage })))
const JobsListPage = lazy(() => import('@/features/jobs/pages/JobsListPage').then((m) => ({ default: m.JobsListPage })))
const JobDetailPage = lazy(() => import('@/features/jobs/pages/JobDetailPage').then((m) => ({ default: m.JobDetailPage })))
const CompanyProfilePage = lazy(() => import('@/features/jobs/pages/CompanyProfilePage').then((m) => ({ default: m.CompanyProfilePage })))
const MeetingRoomPage = lazy(() => import('@/features/meetings/pages/MeetingRoomPage').then((m) => ({ default: m.MeetingRoomPage })))

const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const InterviewsPage = lazy(() => import('@/features/interviews/pages/InterviewsPage').then((m) => ({ default: m.InterviewsPage })))
const UserCalendarPage = lazy(() => import('@/features/calendar/pages/UserCalendarPage').then((m) => ({ default: m.UserCalendarPage })))
const AiAssistantPage = lazy(() => import('@/features/ai/pages/AiAssistantPage').then((m) => ({ default: m.AiAssistantPage })))
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const ApplicationsPage = lazy(() => import('@/features/applications/pages/ApplicationsPage').then((m) => ({ default: m.ApplicationsPage })))

const RecruiterDashboardPage = lazy(() =>
  import('@/features/recruiter/pages/RecruiterDashboardPage').then((m) => ({ default: m.RecruiterDashboardPage })),
)
const RecruiterJobsPage = lazy(() => import('@/features/recruiter/pages/RecruiterJobsPage').then((m) => ({ default: m.RecruiterJobsPage })))
const RecruiterJobFormPage = lazy(() =>
  import('@/features/recruiter/pages/RecruiterJobFormPage').then((m) => ({ default: m.RecruiterJobFormPage })),
)
const RecruiterJobApplicationsPage = lazy(() =>
  import('@/features/recruiter/pages/RecruiterJobApplicationsPage').then((m) => ({ default: m.RecruiterJobApplicationsPage })),
)
const RecruiterCalendarPage = lazy(() =>
  import('@/features/recruiter/pages/RecruiterCalendarPage').then((m) => ({ default: m.RecruiterCalendarPage })),
)
const RecruiterCandidatesPage = lazy(() =>
  import('@/features/recruiter/pages/RecruiterCandidatesPage').then((m) => ({ default: m.RecruiterCandidatesPage })),
)
const RecruiterApplicationDetailPage = lazy(() =>
  import('@/features/recruiter/pages/RecruiterApplicationDetailPage').then((m) => ({ default: m.RecruiterApplicationDetailPage })),
)
const RecruiterAiPage = lazy(() => import('@/features/recruiter/pages/RecruiterAiPage').then((m) => ({ default: m.RecruiterAiPage })))
const RecruiterSettingsPage = lazy(() =>
  import('@/features/recruiter/pages/RecruiterSettingsPage').then((m) => ({ default: m.RecruiterSettingsPage })),
)

const AdminLoginPage = lazy(() => import('@/features/admin/pages/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })))
const AdminDashboardPage = lazy(() => import('@/features/admin/pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
const AdminCalendarPage = lazy(() => import('@/features/admin/pages/AdminCalendarPage').then((m) => ({ default: m.AdminCalendarPage })))
const AdminCandidatesPage = lazy(() => import('@/features/admin/pages/AdminCandidatesPage').then((m) => ({ default: m.AdminCandidatesPage })))
const AdminSchedulePage = lazy(() => import('@/features/admin/pages/AdminSchedulePage').then((m) => ({ default: m.AdminSchedulePage })))

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper-50">
      <Skeleton className="h-8 w-40" />
    </div>
  )
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/manage/:token" element={<ManageInterviewPage />} />
        <Route path="/jobs" element={<JobsListPage />} />
        <Route path="/jobs/:idOrSlug" element={<JobDetailPage />} />
        <Route path="/companies/:id" element={<CompanyProfilePage />} />
        {/* Reachable by either role (candidate or recruiter) — no Require* wrapper, since those
            are each scoped to exactly one accountType. The page does its own session check and
            the real authorization is server-side (meetings.controller.ts / meetingNamespace.ts). */}
        <Route path="/meeting/:meetingId" element={<MeetingRoomPage />} />

        <Route
          path="/dashboard"
          element={
            <RequireUser>
              <DashboardPage />
            </RequireUser>
          }
        />
        <Route
          path="/interviews"
          element={
            <RequireUser>
              <InterviewsPage />
            </RequireUser>
          }
        />
        <Route
          path="/calendar"
          element={
            <RequireUser>
              <UserCalendarPage />
            </RequireUser>
          }
        />
        <Route
          path="/ai"
          element={
            <RequireUser>
              <AiAssistantPage />
            </RequireUser>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireUser>
              <SettingsPage />
            </RequireUser>
          }
        />
        <Route
          path="/applications"
          element={
            <RequireUser>
              <ApplicationsPage />
            </RequireUser>
          }
        />

        <Route
          path="/recruiter/dashboard"
          element={
            <RequireRecruiter>
              <RecruiterDashboardPage />
            </RequireRecruiter>
          }
        />
        <Route
          path="/recruiter/jobs"
          element={
            <RequireRecruiter>
              <RecruiterJobsPage />
            </RequireRecruiter>
          }
        />
        <Route
          path="/recruiter/calendar"
          element={
            <RequireRecruiter>
              <RecruiterCalendarPage />
            </RequireRecruiter>
          }
        />
        <Route
          path="/recruiter/jobs/new"
          element={
            <RequireRecruiter>
              <RecruiterJobFormPage />
            </RequireRecruiter>
          }
        />
        <Route
          path="/recruiter/jobs/:id/edit"
          element={
            <RequireRecruiter>
              <RecruiterJobFormPage />
            </RequireRecruiter>
          }
        />
        <Route
          path="/recruiter/jobs/:id/applications"
          element={
            <RequireRecruiter>
              <RecruiterJobApplicationsPage />
            </RequireRecruiter>
          }
        />
        <Route
          path="/recruiter/candidates"
          element={
            <RequireRecruiter>
              <RecruiterCandidatesPage />
            </RequireRecruiter>
          }
        />
        <Route
          path="/recruiter/applications/:id"
          element={
            <RequireRecruiter>
              <RecruiterApplicationDetailPage />
            </RequireRecruiter>
          }
        />
        <Route
          path="/recruiter/ai"
          element={
            <RequireRecruiter>
              <RecruiterAiPage />
            </RequireRecruiter>
          }
        />
        <Route
          path="/recruiter/settings"
          element={
            <RequireRecruiter>
              <RecruiterSettingsPage />
            </RequireRecruiter>
          }
        />

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
    </Suspense>
  )
}
