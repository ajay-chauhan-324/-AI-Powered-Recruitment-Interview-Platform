

# THE LEDGER — INTELLIGENT TIME CANVAS

# AI-POWERED SMART APPOINTMENT BOOKING SYSTEM

==================================================
PRODUCT PIVOT: INTERVIEW SCHEDULING PLATFORM
==================================================

This product has been evolved from a generic appointment booking system into
**The Ledger — Interview Scheduling & Management Platform**: a product used by
companies/recruiters/interviewers to publish interview availability and let
candidates book interview slots (technical, HR/screening, coding, system
design, behavioral, managerial, final, and panel rounds).

Everything below this notice (product vision, design system, architecture,
availability engine, concurrency/timezone rules, AI architecture, security
principles, phase plan) remains the operative engineering standard — the
pivot does not relax any of it. Sections 2 (Product Vision), 3 (Core
Principle), and 15 (Appointment/Interview Data) are superseded by the
interview-domain description that follows; every other section (availability
engine, concurrency, timezone, AI rules, security, tech stack, architecture)
applies unchanged to the interview domain.

Domain rename: `Appointment` → `Interview` throughout the codebase (model,
service, controller, routes, validators, tests) — not just additive fields.
Candidate contact fields (`name`/`email`) become `candidateName`/
`candidateEmail`, with new optional candidate fields (phone, LinkedIn,
GitHub, portfolio, resume link, notes). New interview-specific fields:
`title`, `description`, `interviewType`, `round`, `locationType`,
`meetingUrl`, `address`, `interviewerName`/`interviewerEmail`.
`AvailabilityService`, `ScheduleConfig`, `BlockedSlot`, and `BookingLock`
are unchanged — they are correct, generic, and already tested; renaming them
would be churn without benefit.

Explicitly out of scope, documented rather than faked: real-time video
calling (needs a third-party provider and credentials not available in this
environment — the integration point is built and documented, not faked),
resume *file* upload (no file-storage infrastructure exists — a resume
*link* field is supported instead), and multi-interviewer team accounts (a
single interviewer name/email per interview — there is no multi-admin-user
system to extend here).

==================================================

You are operating as a Principal Software Engineer, Staff-level System Architect, Product Engineer, AI Engineer, Security Engineer, QA Engineer, and Code Reviewer.

Your job is to build this product as a production-quality software system.

Do not behave like a code generator.

Behave like an experienced engineering team member working inside a real repository.

The goal is not to generate the maximum amount of code.

The goal is to create a correct, maintainable, secure, testable, scalable, and polished product.

==================================================
0. OPERATING MODE
=================

Use this engineering loop for every meaningful change:

INSPECT
↓
UNDERSTAND
↓
PLAN
↓
IMPLEMENT
↓
VERIFY
↓
REVIEW
↓
FIX
↓
DOCUMENT

Never skip inspection.

Never assume the repository is empty.

Never assume existing code is correct.

Never overwrite existing work without understanding it first.

Never claim that something works without actually verifying it.

==================================================

1. SOURCE OF TRUTH HIERARCHY
   ==================================================

When instructions conflict, follow this priority:

1. Existing working code and data must not be destroyed without a clear reason.
2. Security and data integrity requirements.
3. Core booking business rules.
4. Approved architecture.
5. Approved product requirements.
6. Approved "The Ledger" UI/UX specification.
7. Implementation preferences.
8. Your own assumptions.

If a requirement is ambiguous:

* Do not silently invent a major behavior.
* Choose the smallest safe implementation.
* Document the assumption.
* Continue only if the assumption does not materially change the product.

For major ambiguity, stop and explain the decision required.

==================================================
2. PRODUCT VISION
=================

This is an AI-powered interview scheduling and management platform. A
company/recruiter/interviewer publishes interview availability; candidates
book interview slots against it. This is not a generic calendar — every
screen should communicate that it is an interview scheduling product.

Candidates and the AI assistant can naturally express requests such as:

* "Find me a technical interview next week."
* "I'm available after 5 PM."
* "Is 4 PM available for my screening call?"
* "Can I reschedule my interview?"
* "What interview do I have tomorrow?"

Recruiters/admins and the AI assistant can naturally express requests such as:

* "Show today's interviews."
* "Find the next available slot."
* "Block Friday afternoon."
* "Move this interview to tomorrow."
* "How many technical interviews are scheduled this week?"

The system must:

1. Understand intent.
2. Understand date and time.
3. Respect timezone.
4. Understand duration when relevant.
5. Check availability.
6. Detect conflicts.
7. Suggest alternatives.
8. Collect candidate name, email, and other candidate details (phone,
   LinkedIn/GitHub/portfolio, resume link, notes) relevant to the interview
   type.
9. Create a valid interview booking with the correct interview type, round,
   and location (video/phone/onsite/custom).
10. Synchronize the calendar in real time.
11. Support rescheduling.
12. Support cancellation.
13. Preserve interview history (including reschedule/cancellation history).

The system must prevent:

* Double bookings.
* Overlapping interviews.
* Invalid time ranges.
* Bookings outside working hours.
* Bookings during breaks.
* Bookings during blocked periods.
* Bookings inside a configured buffer window around another interview.
* Bookings inside the minimum-notice window or beyond the maximum booking
  window.
* Unauthorized interview or candidate-data access.

==================================================
3. CORE PRODUCT PRINCIPLE
=========================

THE TIMELINE IS NOT A FEATURE INSIDE THE APP.

THE TIMELINE IS THE APP.

The product must not become:

Sidebar
→ Dashboard
→ Cards
→ Calendar widget
→ Chat widget

The product must feel like:

AI COMMAND LAYER
↓
CONTINUOUS TIME CANVAS
↓
APPOINTMENTS
AVAILABILITY
BLOCKED TIME
CONFLICTS

Every feature must reinforce this mental model.

==================================================
4. APPROVED DESIGN DIRECTION
============================

The approved visual direction is:

THE LEDGER — INTELLIGENT TIME CANVAS

This direction is final.

Do not replace it with:

* Generic SaaS UI.
* Purple-blue AI dashboard.
* Standard admin template.
* ChatGPT clone.
* Generic calendar application.
* Glassmorphism.
* Excessive gradients.
* Permanent sidebar.
* Dashboard card grid.
* Decorative visual noise.

==================================================
5. UI STRUCTURE
===============

DESKTOP:

┌───────────────────────────────────────────────────────────┐
│ Wordmark    Date Context       [Day | Week | Month]       │
├───────────────────────────────────────────────────────────┤
│                                                           │
│                    TIME CANVAS                            │
│                                                           │
│                 PRIMARY WORKSPACE                         │
│                                                           │
├───────────────────────────────────────────────────────────┤
│  ⌁ Ask to book, move, or check a time…                   │
└───────────────────────────────────────────────────────────┘

Rules:

* Minimal contextual header.
* No permanent sidebar.
* Time Canvas is primary.
* AI command ribbon is docked at canvas bottom.
* Details appear contextually.
* No permanent dashboard grid.

MOBILE:

┌───────────────────┐
│ Date      [D W M] │
├───────────────────┤
│                   │
│   TIME CANVAS     │
│                   │
├───────────────────┤
│  ⌁ Ask…           │
└───────────────────┘

Rules:

* Full-height timeline.
* Vertical scroll navigates time.
* Horizontal gesture navigates dates where appropriate.
* AI remains a bottom interaction surface.
* Appointment details open as a focused bottom sheet.
* Never create a long stacked dashboard.

==================================================
6. DESIGN SYSTEM
================

TYPOGRAPHY:

Numeral/time face:

* IBM Plex Mono or equivalent.
* Use for times, dates, durations, countdowns.

UI face:

* IBM Plex Sans or equivalent.
* Use for labels, titles, conversation, buttons.

Do not use:

* Handwritten fonts.
* Script fonts.
* Decorative display fonts.

Scale:

xs: 12/16
sm: 13/18
base: 15/22
md: 17/24
lg: 20/28
xl: 28/34
2xl: 36/42

Weight:

* Regular: body and conversation.
* Medium: labels and appointment titles.
* Semibold: primary CTA, confirmation, current-time indicator only.

SPACING:

Base unit: 4px.

Use:

2, 4, 8, 12, 16, 24, 32, 48, 64, 96px.

COLORS:

paper-50: #FBF7F0
paper-100: #F4EDE2
paper-200: #EBE1D2

ink-900: #211D17
ink-700: #4A4238
ink-500: #7A7267
ink-300: #B8AF9E

amber-600: #B5622A
amber-500: #C97A3F
amber-100: #F2DFC9

available: #3F7A5C
conflict: #B23B2E
conflict-tint: #F6DCD8

Rules:

* No gradients.
* No heavy blur.
* No excessive shadows.
* Flat fills.
* Restrained elevation.
* Status must not rely on color alone.

==================================================
7. TIME CANVAS
==============

The Time Canvas is the core product surface.

Support:

* Day view.
* Week view.
* Month view.

These are zoom levels of one time system, not unrelated pages.

Changing views must preserve the current date anchor.

DAY:

* Full hour rows.
* Time.
* Title.
* Attendee.
* Current-time indicator.

WEEK:

* Seven shared-scale columns.
* Consistent time scale.
* Compact appointment tags.

MONTH:

* Calendar grid.
* Density indicators.
* Maximum three density ticks.
* "+N more" when necessary.
* Clicking a day zooms to Day view.

==================================================
8. APPOINTMENTS
===============

Appointments are tags, not generic dashboard cards.

Display:

TIME RANGE
TITLE
ATTENDEE

Selected:

* Amber outline.
* Slight elevation.
* Subtle surrounding focus.

Cancelled:

* Desaturated.
* Title-only strikethrough.
* Preserve historical visibility.

Source:

* AI.
* Admin.
* Public.

==================================================
9. AVAILABILITY
===============

Do not create a grid of empty clickable cells.

Availability remains visually quiet.

Use:

* Thin availability line.
* Small availability tick.
* Stronger highlight only for suggested slots.

When AI suggests a slot:

1. AI slot chip appears.
2. Same slot highlights on Time Canvas.
3. Both representations remain synchronized.

==================================================
10. BLOCKED TIME
================

Blocked time uses:

* 45-degree hatch pattern.
* Full affected range.
* Label at block start.

Public users cannot book blocked time.

Admins can edit blocked time.

==================================================
11. BOOKING DOMAIN
==================

Create a central booking domain/service.

Every booking path must use the same business rules:

* Public booking.
* AI booking.
* Admin booking.
* API booking.

Controllers must remain thin.

Routes must remain thin.

Business logic belongs in domain/application services.

Do not duplicate availability or conflict logic.

==================================================
12. AVAILABILITY ENGINE
=======================

Create one centralized AvailabilityService.

It must consider:

* Working hours.
* Breaks.
* Blocked periods.
* Existing appointments.
* Appointment duration.
* Timezone.
* Current time.
* Booking constraints.

The AI must not implement its own availability logic.

The frontend must not implement authoritative availability logic.

The database-backed backend is authoritative.

==================================================
13. CONCURRENCY AND DOUBLE-BOOKING
==================================

The system must protect against simultaneous booking attempts.

The final booking operation must:

1. Validate input.
2. Resolve timezone correctly.
3. Check availability.
4. Enter the authoritative write operation.
5. Re-check conflict conditions.
6. Create the appointment atomically where supported.
7. Commit.
8. Return success.

If another booking wins the race:

* Do not create an overlapping appointment.
* Return a conflict response.
* Offer alternatives.

Never trust an earlier availability check as the final authority.

==================================================
14. TIME AND TIMEZONE
=====================

Store timestamps in UTC.

Always preserve the intended timezone context.

Never perform date/time arithmetic using fragile string manipulation.

Use one consistent date/time strategy across:

* Backend.
* Database.
* AI tools.
* Frontend.
* Notifications.

Explicitly test:

* Daylight saving transitions where applicable.
* Midnight boundaries.
* Different user timezones.
* Date rollover.
* Invalid dates.
* Ambiguous natural-language times.

The displayed timezone and time format must be explicit.

==================================================
15. INTERVIEW DATA
==================

Interview must support:

* title
* description
* interviewType (hr_screening / technical / coding / system_design /
  behavioral / managerial / final / panel / custom)
* round (a simple ordinal — Round 1, Round 2, ...)
* locationType (video / phone / onsite / custom)
* meetingUrl
* address
* interviewerName / interviewerEmail
* candidateName
* candidateEmail
* candidatePhone (optional)
* candidateLinkedIn / candidateGithub / candidatePortfolioUrl (optional)
* candidateResumeUrl (optional — a link, not a file upload; no file-storage
  infrastructure exists in this project)
* candidateNotes (optional — candidate's own notes/questions at booking time)
* startAt
* endAt
* duration
* timezone
* status
* source
* manage token hash
* rescheduleHistory (previous start/end + when it changed)
* createdAt
* updatedAt

Statuses:

* pending
* confirmed
* cancelled
* completed
* no_show

Cancellation must not hard-delete historical interviews.

==================================================
16. AI ARCHITECTURE
===================

The AI is not the source of truth.

The AI must never directly access the database.

Correct flow:

USER
↓
AI CONVERSATION LAYER
↓
INTENT UNDERSTANDING
↓
VALIDATED TOOL CALL
↓
AUTHORIZED BACKEND SERVICE
↓
DATABASE

The Booking Service is authoritative.

The Database is the source of truth.

All AI tool arguments must be:

* Schema validated.
* Authorization checked.
* Business-rule validated.
* Sanitized where necessary.

AI tool concepts:

* Check availability.
* Suggest slots.
* Create appointment.
* Reschedule appointment.
* Cancel appointment.
* Get appointment details.

The AI must not bypass backend business rules.

==================================================
17. AI SECURITY
===============

Treat all user input as untrusted.

Protect against:

* Prompt injection.
* Tool manipulation.
* Unauthorized appointment access.
* Cross-user data leakage.
* Malicious tool arguments.
* Excessive tool execution.

Never allow the model to decide authorization.

Authorization belongs to backend code.

Provider API keys must never be exposed to the frontend.

==================================================
18. PUBLIC BOOKING
==================

Public users do not need accounts.

Flow:

1. User describes intent.
2. AI understands request.
3. Availability is checked.
4. Suggestions appear.
5. Suggested slots highlight on canvas.
6. User selects a slot.
7. User enters:

   * Name.
   * Email.
   * Purpose.
8. Backend validates everything.
9. Appointment is created.
10. Confirmation appears.
11. Real-time calendar updates.
12. Confirmation is sent.

Public users must never need drag-to-book.

==================================================
19. SECURE GUEST MANAGEMENT
===========================

Guest users can manage appointments through secure links.

Support:

* View.
* Reschedule.
* Cancel.

Use secure random tokens.

Store only token hashes in the database.

Never store raw management tokens.

Authorization must be checked on every management operation.

==================================================
20. ADMIN
=========

Admin can:

* View appointments.
* Reschedule.
* Resize duration.
* Create appointments.
* Create blocked time.
* Configure working hours.
* Configure breaks.
* Cancel appointments.
* Use AI commands.

Examples:

"Block Friday afternoon."

"Move Tuesday's 3 PM appointment to 4 PM."

"Show me tomorrow's appointments."

Admin drag actions must have keyboard alternatives.

==================================================
21. REAL-TIME
=============

Use Socket.IO.

Events should represent domain changes, such as:

* appointment.created
* appointment.updated
* appointment.cancelled
* availability.changed

The database remains authoritative.

Clients must handle:

* Initial connection.
* Reconnection.
* Duplicate events.
* Stale events.
* Connection failures.

Real-time changes should create a brief visual highlight on the affected region.

Never force a page refresh.

==================================================
22. CONFIRMATION
================

Successful booking receives a small confirmation seal.

The seal is used only for successful confirmation.

AI ribbon may show:

"Booked — Tuesday 2:00 PM. Confirmation sent."

Do not reuse the seal motif everywhere.

==================================================
23. NOTIFICATIONS
=================

Create a notification abstraction.

Support architecture for:

* Confirmation.
* Reschedule.
* Cancellation.
* Reminder.

Do not over-engineer queues unless the current product actually requires them.

Keep future queue integration possible.

==================================================
24. ACCESSIBILITY
=================

Requirements:

* WCAG AA contrast.
* Never rely on color alone.
* Full keyboard operability.
* Keyboard alternative to drag actions.
* ARIA live region for AI responses.
* Visible focus states.
* Minimum 44px touch targets.
* Explicit timezone.
* Explicit time format.
* Reduced-motion support.

==================================================
25. TECHNOLOGY
==============

Frontend:

* React.
* TypeScript.
* Vite.
* Tailwind CSS.
* TanStack Query.
* React Router.

Backend:

* Node.js.
* Express.
* TypeScript.
* MongoDB.
* Mongoose.
* Socket.IO.

AI:

* Provider behind a backend abstraction.
* Provider-specific code isolated.
* API keys server-side only.

Use the smallest reasonable dependency set.

Before adding a dependency, evaluate:

1. Does it materially reduce complexity?
2. Is it actively maintained?
3. Does it introduce unnecessary bundle or security risk?
4. Can the feature be implemented simply without it?

If not clearly justified, do not add it.

==================================================
26. ARCHITECTURE
================

Use a clean separation:

CLIENT
SERVER
DATABASE
AI PROVIDER
REAL-TIME LAYER
NOTIFICATION ABSTRACTION

Frontend should separate:

* UI.
* Feature logic.
* API communication.
* Server state.
* Local UI state.

Backend should separate:

* Routes.
* Controllers.
* Services.
* Models.
* Validation.
* Middleware.
* AI tools.
* Socket handlers.

Controllers must not contain complex business logic.

==================================================
27. PROJECT STRUCTURE
=====================

Preferred structure:

/
├── client/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── calendar/
│   │   │   ├── appointments/
│   │   │   ├── ai/
│   │   │   └── admin/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── services/
│   │   ├── styles/
│   │   └── types/
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── validators/
│   │   ├── ai/
│   │   ├── sockets/
│   │   ├── utils/
│   │   ├── app.ts
│   │   └── server.ts
│   └── package.json
│
├── README.md
└── CLAUDE.md

Do not create folders without a clear purpose.

Do not create abstraction layers that have no current consumer.

==================================================
28. DEVELOPMENT PHASES
======================

PHASE 0 — REPOSITORY INSPECTION

Before modifying anything:

* Inspect all relevant files.
* Check package manager.
* Check Node version.
* Check existing scripts.
* Check existing dependencies.
* Check TypeScript configuration.
* Check environment files.
* Check git status if available.
* Check whether existing code is working.
* Identify conflicts.

Do not delete or rewrite existing code blindly.

Create a concise implementation plan.

PHASE 1 — FOUNDATION

Implement:

* Client setup.
* Server setup.
* TypeScript.
* Styling.
* Design tokens.
* Typography.
* Global styles.
* App shell.
* Header.
* Time Canvas foundation.
* AI ribbon visual shell.
* Responsive layout.

Do not implement real booking logic yet.

PHASE 2 — DOMAIN AND DATABASE

Implement:

* Database connection.
* Appointment model.
* Working hours.
* Breaks.
* Blocked time.
* Validation.

PHASE 3 — AVAILABILITY

Implement:

* AvailabilityService.
* Working hours.
* Breaks.
* Blocked periods.
* Existing appointments.
* Duration.
* Timezone handling.

PHASE 4 — BOOKING ENGINE

Implement:

* Create.
* Conflict detection.
* Overlap prevention.
* Reschedule.
* Cancellation.
* Concurrency protection.

Add meaningful tests.

PHASE 5 — CALENDAR

Implement:

* Day.
* Week.
* Month.
* Appointment rendering.
* Availability.
* Blocked time.
* Conflict states.
* Current-time indicator.
* Navigation.

PHASE 6 — REAL-TIME

Implement:

* Socket.IO.
* Domain events.
* Client synchronization.
* Reconnection.
* Duplicate protection.
* Visual update pulse.

PHASE 7 — AI

Implement:

* Conversation flow.
* Intent understanding.
* Date/time extraction.
* Tool calls.
* Availability.
* Suggestions.
* Booking.
* Rescheduling.
* Cancellation.
* Clarification.

All tools must call backend services.

PHASE 8 — PUBLIC EXPERIENCE

Implement:

* Guest booking.
* Name.
* Email.
* Purpose.
* Confirmation.
* Secure manage link.
* Reschedule.
* Cancellation.

PHASE 9 — ADMIN

Implement:

* Authentication.
* Authorization.
* Appointment management.
* Drag rescheduling.
* Duration changes.
* Blocked time.
* Working hours.
* AI commands.

PHASE 10 — NOTIFICATIONS

Implement:

* Confirmation.
* Reschedule.
* Cancellation.
* Reminder abstraction.

PHASE 11 — ACCESSIBILITY

Perform a complete accessibility audit.

PHASE 12 — TESTING

Test:

* Availability.
* Overlap detection.
* Double booking.
* Timezones.
* Rescheduling.
* Cancellation.
* Authorization.
* AI tool validation.
* Real-time behavior.

PHASE 13 — SECURITY AUDIT

Review:

* Authentication.
* Authorization.
* Input validation.
* Rate limiting.
* CORS.
* Security headers.
* Secrets.
* Token security.
* Prompt injection.
* AI tool authorization.
* Abuse prevention.

PHASE 14 — PRODUCTION READINESS

Review:

* Error handling.
* Logging.
* Health checks.
* Graceful shutdown.
* Database indexes.
* Performance.
* Environment configuration.
* Build process.
* Deployment readiness.

==================================================
29. PHASE GATES
===============

A phase is NOT complete because code exists.

A phase is complete only when:

* The feature works.
* Relevant checks pass.
* TypeScript passes.
* Build passes where applicable.
* No known critical errors remain.
* The implementation follows the architecture.
* The UI follows the design direction.
* The result has been reviewed.

Before moving forward, verify the phase gate.

If a phase is broken:

* Fix it.
* Do not build additional features on top of known broken foundations.

==================================================
30. VERIFICATION REQUIREMENTS
=============================

After meaningful changes, run appropriate checks.

Examples:

* TypeScript check.
* Linter.
* Unit tests.
* Integration tests.
* Production build.
* API health check.
* Manual browser verification where available.

Use the actual project scripts when they exist.

Do not invent test results.

Do not say "verified" if you did not run the verification.

==================================================
31. SCOPE CONTROL
=================

Do not add unrelated features.

Do not add:

* Unrequested analytics.
* Unrequested payment systems.
* Unrequested social features.
* Unrequested AI features.
* Unrequested complex infrastructure.

If a potentially valuable feature is discovered:

1. Mention it.
2. Explain the benefit.
3. Explain the scope impact.
4. Do not implement it without approval if it materially increases scope.

==================================================
32. CHANGE MANAGEMENT
=====================

Before destructive changes:

* Explain what will be changed.
* Explain why.
* Identify risk.
* Prefer incremental migration.

Do not:

* Delete working files casually.
* Replace architecture without justification.
* Rewrite large sections unnecessarily.
* Upgrade dependencies without reason.

For significant architecture decisions, document:

* Decision.
* Reason.
* Alternatives considered.
* Trade-offs.

==================================================
33. ERROR HANDLING
==================

Errors must be:

* Structured.
* Meaningful.
* Safe for users.
* Useful for developers.

Do not expose:

* Secrets.
* Stack traces in production.
* Database internals.
* Sensitive user data.

The UI should distinguish:

* Validation errors.
* Conflicts.
* Authorization errors.
* Network failures.
* Server failures.

==================================================
34. SECURITY PRINCIPLE
======================

Never trust:

* User input.
* Client-side validation.
* AI output.
* Client-provided authorization.
* Client-provided availability.

The backend must independently validate all important operations.

The database is authoritative.

==================================================
35. CURRENT EXECUTION INSTRUCTION
=================================

START NOW.

First perform PHASE 0.

Do not immediately write a large amount of code.

First inspect the repository and understand its current state.

Then:

1. Summarize the current repository.
2. Identify existing technology and versions.
3. Identify conflicts and risks.
4. Propose the implementation plan.
5. Begin only the first appropriate phase.
6. Implement incrementally.
7. Verify the result.
8. Fix discovered problems.
9. Report exactly what changed.

At the end of each phase, report:

* Phase completed.
* What was implemented.
* Files created.
* Files modified.
* Dependencies added.
* Commands executed.
* Verification performed.
* Tests passed.
* Known issues.
* Architectural decisions.
* Next phase.

Do not claim completion without verification.

Do not skip repository inspection.

Do not implement the entire application in one uncontrolled operation.

Preserve the approved architecture and the "The Ledger — Intelligent Time Canvas" design throughout the project.

Begin now.

==================================================
36. SECOND PIVOT: RECRUITMENT PLATFORM
==================================================

The product has evolved a second time, beyond the interview-scheduling
pivot in section "PRODUCT PIVOT" above: it is now **The Ledger — a full
recruitment platform**. Recruiters post jobs with an ordered interview
pipeline; candidates apply with a resume; an AI scores the application
against the job (ATS); recruiters shortlist and progress candidates round
by round; each round is booked by the candidate directly (not by AI) against
the same fixed-schedule `AvailabilityService` from section 12; each booked
interview automatically gets an in-platform WebRTC video Meeting Room.

Everything in sections 0-35 remains the operative engineering standard
(source-of-truth hierarchy, phase gates, availability engine, concurrency
rules, timezone rules, AI security, accessibility, error handling). This
section documents what was actually built on top of that standard, and is
the part every future session should read first to understand the current
system without re-deriving it from source.

--------------------------------------------------
36.1 BUSINESS RULES (as implemented)
--------------------------------------------------

* ~~All interviews run on ONE fixed schedule~~ — **SUPERSEDED, see §37.**
  Every recruiter now owns their own `ScheduleConfig` (working hours,
  breaks, timezone, buffer/notice/window), freely configurable, no fixed
  pattern. The Asia/Kolkata 10:00-13:00/15:00-19:00 pattern described here
  survives ONLY as the legacy admin/guest booking product's global
  singleton calendar (`server/src/config/scheduleDefaults.ts`,
  `ensureFixedScheduleConfig()`) — a deliberate, still-current constraint
  for that one legacy surface, never for recruitment-pipeline bookings.
* Profile completion is NOT required to apply for a job. This was built,
  then explicitly reversed at product request. Do not reintroduce a
  profile-completeness gate on the Apply button or the application-creation
  endpoint without being asked again.
* A candidate can never see or book a round out of sequence. Round
  progression is a strict state machine per round:
  `locked → ready_to_book → scheduled → passed | failed`. Shortlisting
  unlocks round 1. Booking a `ready_to_book` round moves it to `scheduled`
  and creates a real `Interview`. Recording an outcome of `passed` unlocks
  the next round (or marks the application `selected` if it was the last
  round); `failed` marks the whole application `rejected` immediately.
* A job's `pipeline` is snapshotted onto `Application.rounds` at apply time.
  Editing a job's pipeline afterward never retroactively changes an
  already-submitted application's rounds.
* ATS score/analysis is recruiter-only. A candidate never sees their own
  score through the UI or the AI assistant. ATS scoring is best-effort — a
  failed or unavailable AI provider never blocks application creation.
* ~~The AI assistant has NO tool to create a new interview~~ —
  **SUPERSEDED, see §37.** The candidate AI is now the PRIMARY booking
  workflow (`book_interview_round` + `find_bookable_interview_rounds` in
  `ai/tools.ts`), calling the exact same `scheduleApplicationInterview` →
  `createInterview` service chain `InterviewSchedulerDialog` always called
  — still never a second scheduling engine, still transaction-protected,
  still never inventing a slot outside a real `find_available_slots`
  result. `InterviewSchedulerDialog` itself still exists as a secondary/
  debug manual picker, not the primary UX anymore.
* Every `video`-type interview gets an in-platform meeting automatically at
  creation (`buildMeetingFields()` in `interview.service.ts`) — there is no
  code path that creates a video interview without a `meeting` object.
  `meetingUrl` is always same-origin (`/meeting/:meetingId`), never an
  external provider link.

--------------------------------------------------
36.2 INTERVIEW PIPELINE — DATA FLOW
--------------------------------------------------

`Job.pipeline[]` (recruiter-authored, ordered `PipelineStage`s: type, title,
duration, default location)
  → on apply, snapshotted onto `Application.rounds[]` (all `locked`)
  → recruiter shortlists → round 1 becomes `ready_to_book`
    (`application.service.ts` → `updateApplicationStatus`, wired to
    `notifyRoundReady`)
  → candidate books via `InterviewSchedulerDialog` → round becomes
    `scheduled`, a real `Interview` document is created and linked via
    `round.interviewId`
  → recruiter records outcome (`recordRoundOutcome`) → `passed` unlocks the
    next round (or finishes the application as `selected`) / `failed`
    rejects the whole application immediately.

This lives entirely in `server/src/services/application.service.ts`. Do not
duplicate this state machine anywhere else (e.g. in a controller or in the
AI tools layer) — every mutation of `rounds[].status` must go through this
service.

--------------------------------------------------
36.3 SCHEDULING — WHAT'S REUSED VS. NEW
--------------------------------------------------

`AvailabilityService`, `ScheduleConfig`, `BlockedSlot`, `BookingLock`, and
the transaction-protected create/reschedule/cancel paths in
`interview.service.ts` are UNCHANGED from the original interview-scheduling
pivot — they are generic, correct, and already tested. The recruitment
pipeline's per-round booking (`InterviewSchedulerDialog` on the client,
`scheduleApplicationInterview` in `application.service.ts` on the server)
is a thin new caller of that same existing engine, not a parallel
implementation. If a scheduling bug is found, fix it in
`AvailabilityService`/`interview.service.ts` — never patch around it in the
application-round layer.

--------------------------------------------------
36.4 MEETING SYSTEM
--------------------------------------------------

* `Interview.meeting`: `{ meetingId, status: not_started|waiting|
  in_progress|ended, participants: [{ role, joinedAt, leftAt }] }`.
  Generated by `generateMeetingId()`/`buildMeetingFields()` in
  `interview.service.ts` at interview-creation time for every `video`
  interview.
* Client: `client/src/features/meetings/` — `MeetingRoomPage.tsx`,
  `useMeetingRoom.ts` (the WebRTC + Socket.IO state machine), `VideoTile.tsx`.
* Signaling: `/meeting` Socket.IO namespace (`server/src/sockets/
  meetingNamespace.ts`) — authenticated via the same session cookie as
  REST, one room per `meetingId`, ownership re-verified server-side (the
  connecting user must actually be the candidate or interviewer on that
  interview) before joining the room.
* Protocol invariant: whichever peer was ALREADY in the room when the
  second peer joins (`meeting:peer-joined`) is the one that creates the SDP
  offer — enforced by `hasOfferedRef` in `useMeetingRoom.ts`, which is also
  reset to `false` on `meeting:peer-left` so a rejoin re-negotiates cleanly
  instead of silently failing to reconnect.
* Screen share replaces the outgoing video track in place
  (`RTCRtpSender.replaceTrack`) rather than renegotiating the whole
  connection; `stopScreenShare()` restores the camera track and is called
  both from the toggle button and from the browser's native "Stop sharing"
  control (`track.onended`).
* STUN only, no TURN — calls behind restrictive/symmetric NATs may fail to
  connect. This is a known limitation (see README), not a bug to silently
  "fix" by adding a TURN dependency without being asked.
* Raise Hand and Recording are intentionally UI-only stubs (future-ready,
  not functional). Do not wire fake functionality behind them; do not
  remove them either — they mark deliberate scope boundaries.

--------------------------------------------------
36.5 AI TOOLS (current set)
--------------------------------------------------

Both AI surfaces (`/my/ai` candidate, `/recruiter/ai` recruiter) share one
conversation loop (`server/src/ai/conversation.service.ts`,
`MAX_TOOL_ITERATIONS = 6`) and one tool file (`server/src/ai/tools.ts`).
**SUPERSEDED — see §37 for the current tool set.** As of §37, the candidate
AI DOES have real booking tools (`find_bookable_interview_rounds`,
`book_interview_round`); the "no create_interview tool" statement above no
longer holds. Every tool call still re-derives authorization server-side
from the session, never from a model-supplied id claim, and every response
is still built from a real query — the system prompt still instructs the
model never to invent data it doesn't have a tool result for, and to
respond in plain text only (no Markdown/asterisks/headings — a recurring
fight with the configured free-tier model that is mitigated, not 100%
solved; see §37).

--------------------------------------------------
36.6 CODING / FOLDER / NAMING CONVENTIONS (observed, keep following)
--------------------------------------------------

* Client feature folders: `features/<domain>/{api,components,hooks,pages}`.
  `api/` files are typed fetch wrappers only — no business logic. Shared
  cross-feature types are re-exported from the owning feature's `api` file
  (e.g. `recruiterApi.ts` imports `MeetingInfo`/`MeetingType` from
  `booking/api/bookingApi.ts` rather than redefining them).
  Populated-vs-unpopulated Mongoose reference fields
  (`application.jobId`, `application.resumeId`) require a small
  `xIdString()` helper (see `jobIdString`/`resumeIdString` in
  `recruiterApplications.controller.ts`) because `.toString()` on a
  populated document returns a debug string, not a hex id — reach for the
  existing pattern rather than re-deriving it when adding a new populated
  field.
* Server: routes are wiring only; controllers parse/validate input and
  shape the response; all business logic is in `services/`. Every request
  body is Zod-validated in `validators/`.
* Query keys: TanStack Query keys are deliberately SHARED across pages that
  need the same data (e.g. `['recruiter-applications']` used by the
  recruiter dashboard, candidates list, and AI-insight views) so they
  dedupe automatically and never drift out of sync — do not give each page
  its own key "for isolation" when they're conceptually the same fetch.
* `lucide-react` has no brand icons (no `Github`, `Linkedin`, etc.) —
  compiles fine, breaks at runtime/build. Use a generic icon
  (`ExternalLink`, `Globe`) for external-profile links instead.

--------------------------------------------------
36.7 TESTING STRATEGY
--------------------------------------------------

Server: `node:test` + `assert`, run via `npm test` in `server/`, requires a
local MongoDB **replica set** (conflict-safe booking uses multi-document
transactions — a standalone `mongod` cannot run these tests). Tests run
with `--test-concurrency=1` and share one database; new tests must use
fixture data/time windows distinct enough not to collide with existing
tests rather than relying on parallel isolation. Client has no automated
test suite yet — verification there is `tsc -b`, `oxlint`, `vite build`,
and manual browser checks.

--------------------------------------------------
36.8 DEPLOYMENT NOTES
--------------------------------------------------

* Server needs a reachable MongoDB **replica set** in production (Atlas or
  self-managed) — a standalone instance breaks the transactional booking
  path silently at runtime, not at build time, so this is easy to miss
  until the first double-booking race actually occurs.
* `GET /api/v1/health` is wired for orchestrator health checks (`200` db
  connected / `503` db disconnected). Graceful shutdown (`SIGTERM`/
  `SIGINT`) already drains sockets → HTTP → DB with a 10s force-exit
  backstop — do not add a second shutdown handler.
* No Dockerfile/docker-compose/CI exists yet (see README "Future Roadmap").

--------------------------------------------------
36.9 KNOWN CONSTRAINTS / FUTURE EXTENSION POINTS
--------------------------------------------------

* No TURN relay for the Meeting Room (extension point: add one behind an
  env-var-gated config in the same `useMeetingRoom.ts` ICE-server list).
* Meeting Room is strictly 1:1 (extension point: panel/group interviews
  would need a mesh or SFU redesign of `meetingNamespace.ts` and
  `useMeetingRoom.ts` — non-trivial, do not attempt as a small patch).
* `locationType`/`meetingType` schema already has an `offline` enum value
  reserved for future use — no UI or logic consumes it yet; do not assume
  it is wired up.
* Admin (`/admin/*`) is a separate, legacy single-tenant system predating
  the recruiter multi-tenant model — kept intentionally separate for
  generic/non-recruitment booking use cases, not a bug to "merge" into the
  recruiter workspace without being asked.
* No password-reset flow for either auth system (self-service or admin).
* Candidate profile completion is deliberately optional everywhere — see
  36.1. Any future "encourage profile completion" feature must remain
  non-blocking (nudge UI only, never a gate on Apply).

==================================================
37. THIRD PIVOT: PER-RECRUITER CALENDARS + AI-DRIVEN BOOKING
==================================================

Two further, deliberate product decisions were made after §36 was written,
neither reflected in §36's text above (now marked SUPERSEDED inline where
it was directly contradicted). This section is the current source of truth
for scheduling/booking; §36 remains correct for pipeline/round-progression/
meeting-room mechanics, which this pivot did not touch.

--------------------------------------------------
37.1 PER-RECRUITER CALENDARS (replaces the fixed IST schedule for the
recruitment pipeline)
--------------------------------------------------

* `ScheduleConfig` now has an optional `recruiterId` (sparse unique index)
  alongside the original `singleton` (also now sparse unique, was a plain
  unique index — this required a `syncIndexes()` call at boot, see 37.3,
  since Mongoose's autoIndex never repairs an already-existing index's
  options on a pre-existing database). A document has exactly one of the
  two keys, never both, never neither — `scheduleConfig.service.ts` has two
  parallel families of functions (`getScheduleConfig`/`ensureFixedScheduleConfig`/
  `upsertScheduleConfig` for the legacy singleton; `getOrCreateScheduleConfigForRecruiter`/
  `getScheduleConfigForRecruiter`/`upsertScheduleConfigForRecruiter` for a
  recruiter) — never conflate them.
* A recruiter's own calendar is auto-seeded on first read (same starting
  values as the old fixed pattern — Asia/Kolkata, Mon-Fri, 10-13/15-19 —
  purely as a reasonable default, NOT an enforced policy) and freely
  editable thereafter via `PUT /api/v1/recruiter/schedule`
  (`recruiterScheduleConfigInputSchema` in `schedule.validators.ts` — no
  fixed-pattern `.refine()`s, unlike the legacy admin schema it sits next
  to in the same file). UI: `RecruiterSettingsPage.tsx`'s "Interview
  calendar" section.
* `AvailabilityService`'s every exported function
  (`findAvailableSlots`/`isSlotAvailable`/`findNearestAlternatives`/
  `getBufferMinutesMs`/`getEffectiveTimezone`) takes an optional
  `recruiterId` — omitted, it resolves the legacy singleton (unchanged
  behavior for the legacy admin/guest product); provided, it resolves that
  recruiter's own config. `Interview` gained a denormalized `recruiterId`
  (nullable — null for legacy/generic bookings) so `createInterview`/
  `rescheduleInterview`'s transactional conflict-detection queries can
  scope by it: recruiter A's bookings can never block, or be blocked by,
  recruiter B's slots at the same instant. `BlockedSlot`/`BookingLock`
  were deliberately left global/unscoped — recruiters have no per-recruiter
  "block time" feature (that would be a real feature addition, not a bug
  fix; the legacy admin blocked-time tool is still intentionally global).
* `application.service.ts`'s `scheduleApplicationInterview` resolves the
  booking round's job → `recruiterId` → that recruiter's own
  `ScheduleConfig`, and uses ITS timezone for the created interview — the
  candidate's own browser timezone is still never trusted for the booking
  itself (matches §14's "never trust client time"), it's just resolved
  from the correct calendar now instead of a hardcoded constant.
* Migration: `npm run backfill:interview-recruiter-id`
  (`scripts/backfill-interview-recruiter-id.ts`) sets `recruiterId` on any
  interview created before this pivot (jobId set, recruiterId still null) —
  run once before deploying this change to a database with pre-existing
  recruitment-pipeline interviews, or their conflict-scoping silently
  falls back to the legacy-calendar bucket.
* **Not touched, and should not be, without a fresh product decision**:
  the legacy admin singleton calendar, `BlockedSlot`, `BookingLock`, the
  legacy public `/interviews` POST route, and the guest/admin AI
  `schedule_interview` tool — all still global, all still exactly as §36
  described them. This pivot only ever added a NEW per-recruiter path
  alongside the old one; it never modified the old one.

--------------------------------------------------
37.2 AI-DRIVEN BOOKING (reverses §36.1/§36.5's "AI never books")
--------------------------------------------------

This is an explicit, deliberate reversal of a prior deliberate decision —
both the original "AI never books" call and this reversal were correct
given what the product was at the time each was made. If asked to touch
booking again, THIS is the current, correct behavior; do not "restore" the
old restriction as if it were still in effect.

* `ai/tools.ts` (`contexts: ['user']`): `find_bookable_interview_rounds`
  (no args — scans every one of the candidate's applications for a round
  currently `ready_to_book`, across every job/recruiter; returns
  applicationId + job/company/round info) and `book_interview_round`
  (`{ applicationId?, startAt }` — applicationId optional, falls back to
  the conversation's `activeApplicationId` hint, see below). Both call the
  exact same services the manual dialog / REST routes call
  (`listApplicationsForCandidate`, `scheduleApplicationInterview`) — no
  parallel booking logic anywhere in the AI layer.
* `check_availability`/`find_available_slots` (already existed, `contexts:
  ['guest','admin','user']`) now resolve the correct recruiter's calendar
  via `applicationId` (required for `'user'` mode, either as an explicit
  arg or the `activeApplicationId` fallback) — `resolveRecruiterIdForAvailability`
  in `tools.ts`. Their result now also returns the effective `timezone`, so
  the model is never left assuming one.
* `AiContext`'s `'user'` variant gained an optional `activeApplicationId` —
  a pure UX hint (candidate arrived via a "Book with AI" link on a specific
  application), threaded through `aiChatInputSchema` →
  `userAi.controller.ts` → `AiContext` → the booking/availability tools'
  fallback resolution. It is NEVER trusted as authorization — every tool
  still re-verifies the candidate owns that application via
  `getApplicationForCandidate` regardless of whether the hint or an
  explicit arg supplied the id.
* The candidate system prompt (`conversation.service.ts`'s
  `SCOPE_RULES.user`) was rewritten to instruct the model to: discover the
  round (hint or `find_bookable_interview_rounds`, asking the candidate to
  disambiguate if more than one round is ready), check real availability,
  resolve natural-language time requests itself against the ACTUAL
  returned slots ("tomorrow morning", "after 3pm", "earliest", "Monday
  after 4" — never invented), present 2-5 options conversationally, book
  immediately on confirmation with no UI hand-off, and on a
  `SlotConflictError` treat it as a normal "just took it, here are
  alternatives" turn, never a failure message.
* Client: `AiAssistantPage.tsx` is now the PRIMARY booking entry point.
  `ApplicationsPage.tsx`'s "Book Interview" button now routes to
  `/ai?applicationId=<id>`, which seeds a natural opening message
  ("I'd like to book my interview.") and carries the id as the
  `activeApplicationId` hint on every request from then on.
  `InterviewSchedulerDialog.tsx` (the manual slot-picker) still exists,
  reachable only via a small secondary "Pick a time manually" text link —
  kept for debugging/fallback per explicit product instruction, not
  deleted. Booking confirmations render as a compact card
  (`BookingConfirmationCard`) under the chat message that produced them,
  not a new full dialog — reuses `formatClockInTimeZone`, links to My
  Interviews for reschedule/cancel rather than duplicating that UI in chat.
* **Known, accepted limitation**: the configured free-tier OpenRouter model
  (`nvidia/nemotron-3-ultra-550b-a55b:free`) sometimes emits literal
  `**bold**` Markdown despite an explicit, emphatic "plain text only, this
  bubble does not render Markdown" system-prompt rule, placed as the FIRST
  rule and given a wrong/right example. This measurably reduced but did not
  eliminate the behavior in live testing — treat as a model-compliance
  limit, not a bug to keep chasing with prompt tweaks alone; a stronger fix
  would mean either a different/larger model or a post-processing strip of
  Markdown syntax from replies before they reach the client.
* **Known, accepted limitation**: the configured free OpenRouter tier caps
  at 50 requests/day without credits — a real, user-visible failure mode
  (`AI_RATE_LIMITED`, see 38.4), not a code bug; heavy manual/automated
  testing against the live provider will exhaust it.

--------------------------------------------------
37.3 INDEX-SYNC-AT-BOOT PATTERN (established this pivot, now a standing
practice)
--------------------------------------------------

`server/src/server.ts`'s boot sequence calls `Model.syncIndexes()` (not
just relying on Mongoose's default autoIndex) for every model whose index
shape changed in a given pass — currently `ScheduleConfig`, `User`,
`Interview`, `Application`, `Job`. This is necessary, not defensive
paranoia: Mongoose's autoIndex only ever ADDS an index missing from the
current schema; it never detects or repairs an already-existing index
whose options (unique, sparse, compound fields) no longer match, which
silently breaks in two ways — a stale non-sparse unique index throws
spurious duplicate-key errors on legitimate new documents (this actually
happened, twice, during this pivot and the next production-readiness
pass), or a stale single-field index just quietly never gets the perf
benefit of a newer compound one. **How to apply**: any future schema
change that alters an index's shape (not just adds a brand-new one) must
add that model to this `Promise.all([...])` in `server.ts`, or the fix
will work on a fresh database and silently not apply to any existing one.

==================================================
38. PRODUCTION READINESS AUDIT & HARDENING PASS
==================================================

A full audit (5 parallel research passes covering dead code/folder
structure, security, database/indexes/transactions, AI/interview/socket/
WebRTC architecture, and client page-by-page correctness) plus live
QA testing was performed, followed by a fix pass. This section is the
record of what was found and fixed — read it before assuming something is
broken (it may already be fixed) or before re-auditing from scratch (the
findings below are current as of this pass; re-verify rather than trust
blindly if significant time has passed).

--------------------------------------------------
38.1 BUGS FOUND AND FIXED
--------------------------------------------------

* **DST bug, `availability.service.ts`'s `resolveLocalMinutesToUtcInterval`**
  — confirmed by direct reproduction: computing working hours as
  `startOf('day').plus({ minutes: N })` used Luxon's sub-day-unit elapsed-
  DURATION arithmetic, not wall-clock time, so on a real DST transition day
  every slot for a DST-observing recruiter timezone landed an hour off.
  Fixed via `.plus({ days })` (Luxon's day-and-above units ARE calendar-
  aware) + `.set({ hour, minute })` (assigns wall-clock time directly,
  correctly zone-resolved). Regression test: `availability.service.test.ts`
  reproduces the exact 2024-03-10 America/New_York spring-forward date.
  **How to apply**: never resolve a "minutes since local midnight" value
  via `.plus({ minutes })` from a zoned `startOf('day')` — always resolve
  via `.set({ hour, minute })` on the target calendar day.
* **`RecruiterApplicationDetailPage.tsx`**: (a) hung on the loading
  skeleton forever if the fetch genuinely errored (`isLoading || !application`
  never becomes false-and-shows-something on a fetch error) — fixed by
  checking `isError` first, with a retry button. (b) The Notes textarea
  could show a DIFFERENT, previously-viewed candidate's notes after
  client-side navigation between two applications' detail pages, because
  `notesInitialized` was a plain boolean, never re-keyed to which
  application it was initialized for — fixed by tracking
  `notesInitializedForId` instead and re-initializing whenever
  `application.id` changes. **How to apply**: any page whose state is
  seeded from route-param-driven query data, where React Router can keep
  the component instance mounted across a param change, needs to re-key
  its "have I initialized this yet" flag to the actual identity of the
  data, not just "has this ever run."
* **`useMeetingRoom.ts`**: `pendingCandidatesRef` was never cleared on
  `meeting:peer-left` (only `hasOfferedRef` was) — stale ICE candidates
  from a torn-down connection could get replayed onto the NEW
  `RTCPeerConnection` created on rejoin. `createOffer`/`handleOffer`/
  `handleAnswer`/`handleIceCandidate` are all invoked as bare
  `void fn(...)` with no `.catch` anywhere they're called — added
  try/catch inside each so a camera/mic re-denial or a stale/invalid SDP
  can never surface as an unhandled promise rejection; each sets
  `errorMessage`/`connectionStatus` appropriately instead (a single bad ICE
  candidate is swallowed silently — not fatal to the connection, matches
  WebRTC norms). `leaveMeeting()` (the explicit "Leave" button) didn't stop
  `screenStreamRef` tracks, unlike the unmount-effect cleanup — fixed for
  consistency (today's only caller unmounts immediately after anyway, so
  this was latent, not actively broken).
* **Security**: `POST /auth/change-password` had no rate limit, unlike
  every sibling credential-adjacent endpoint (login, register) — added one
  (10/15min, matches login's). Resume hard-delete
  (`resume.service.ts`'s `deleteResumeRecord`) had no check for whether an
  `Application.resumeId` still referenced it — added an `ApplicationModel.exists()`
  guard, returns `409 RESUME_IN_USE` instead of silently orphaning the
  reference (client: `ResumeManager.tsx`'s delete mutation gained an
  `onError` — it had none before, so this new failure mode would otherwise
  have been silent).
* **Database**: added indexes that were missing for actual query patterns
  — `Interview['meeting.meetingId']` (sparse; every Meeting Room join was a
  full collection scan before this), `Application{jobId,'atsAnalysis.score'}`
  (the dominant recruiter application-ranking sort), `Job{status,companyId,publishedAt}`
  (the public company-profile job list), `Interview{candidateEmail,startAt}`
  (was single-field, candidate lookups sort by startAt too). Removed
  `User.accountType`'s index — verified zero queries anywhere filter by it
  (every accountType check reads the field off an already-`findById`'d
  document, never queries by it). `application.service.ts`'s
  `listApplicationsForRecruiter` now pushes `.limit()` into the actual
  Mongoose query when there's no skill filter (skill matching happens in
  JS against populated candidate profiles, so limiting before that filter
  runs would risk cutting off real matches — only safe to push down when
  there's no skill filter to apply afterward).
* **Dead code removed** (verified zero live references via reachability
  tracing from `main.tsx`/`app.ts`, not just a naive grep): `app/CalendarApp.tsx`,
  `features/ai/components/AiRibbon.tsx`, `components/layout/AppShell.tsx`,
  `components/layout/Header.tsx`, `features/calendar/components/TimeCanvas.tsx`,
  `features/calendar/hooks/{useCalendarView,useCalendarRealtime}.ts`,
  `features/calendar/api/calendarApi.ts`, `features/booking/components/BookingPanel.tsx`
  — all part of one orphaned "old Time Canvas app" cluster, unreachable
  since before the recruitment pivot. `client/src/lib/dateContext.ts` was
  trimmed to only the functions its three real callers
  (`UserCalendarPage`/`AdminCalendarPage`/`RecruiterCalendarPage`) actually
  use (`getDayRange`/`addPeriod`/`isSameLocalDay`) — `getDateContextLabel`/
  `getMonthGridCells`/`getWeekRange`/`getMonthGridRange`/`getRangeForZoom`
  were dead multi-zoom-view code with no live caller; `addPeriod`'s
  signature dropped its unused `zoom` parameter (every real call site
  always passed `'day'`). `@radix-ui/react-tooltip` (client dependency, zero
  imports anywhere) was removed. The server's `/api/v1/calendar` route
  (backing the dead `calendarApi.ts`) was deliberately LEFT IN PLACE — it's
  a real, working, still-mounted API a future consumer could still use;
  removing a working backend route with no client caller yet is a product
  decision, not a dead-code-removal one.
* **Missing error states** (each page had a working happy path but
  silently rendered "empty"/stuck-loading on a genuine fetch failure):
  `useRecruiterApplications.ts` now exposes `isError` (was silently
  swallowed, propagating the gap to `RecruiterDashboardPage`/
  `RecruiterCandidatesPage`); `JobsListPage`, `ApplicationsPage`,
  `RecruiterJobsPage` (list fetch, plus pause/close/duplicate mutations
  which had no `onError` at all — only publish did), `RecruiterJobApplicationsPage`,
  `RecruiterCalendarPage`, `RecruiterSettingsPage`'s company-profile section
  (had none at all, inconsistent with its own "Interview calendar" section
  60 lines below) all gained a proper error render. `JobDetailPage` no
  longer conflates a genuine fetch error with a real 404 (separate
  branches now). `UserCalendarPage` gained a loading indicator (previously
  rendered a blank grid with no feedback while loading).
* **Real-time sync gap**: `RecruiterCalendarPage`, `UserCalendarPage`,
  `InterviewsPage`, `ApplicationsPage`, `AdminCalendarPage`,
  `AdminCandidatesPage` had NO socket listener at all — only the two
  public booking surfaces (`TimeCanvas` — since deleted — and
  `InterviewSchedulerDialog`) got live push updates; everything else relied
  on React Query's `staleTime`/window-refocus defaults alone. Added one new
  generic hook, `client/src/hooks/useRealtimeInvalidation.ts` (takes an
  array of query keys to invalidate on any `interview.*`/`availability.changed`
  event from the public `/calendar` namespace), and wired it into all six
  pages above — replaces the deleted single-purpose `useCalendarRealtime`
  rather than duplicating its socket-connection boilerplate six times.
* **Cosmetic/consistency**: `tools.ts` had the `interviewType` enum spelled
  out as a literal string array in three separate places instead of
  spreading the shared `INTERVIEW_TYPES` constant (the pattern already used
  for `EMPLOYMENT_TYPES`/`WORKPLACE_TYPES` in the same file) — fixed; a
  future addition to `INTERVIEW_TYPES` would otherwise silently not reach
  these tool schemas. One stray `dark:` Tailwind variant in
  `InterviewSchedulerDialog.tsx` (the only one anywhere in the codebase)
  followed OS color-scheme preference instead of this app's own
  `data-theme`-attribute-based toggle (see §36.6-adjacent dark-mode
  architecture) — removed, matching its sibling dialogs. `SettingsPage.tsx`'s
  LinkedIn/GitHub/Portfolio inputs gained `type="url"` for native
  browser-level format feedback (the server already enforced `z.url()`;
  the client silently accepted anything before submit).

--------------------------------------------------
38.2 FINDINGS DELIBERATELY NOT "FIXED" (confirmed intentional or too
risky to patch blindly — do not silently change these without a fresh
product decision)
--------------------------------------------------

* Admin's global `BlockedSlot`/booking lock and the admin AI tools having
  no per-recruiter scoping — this is §36.9's documented "admin is a
  separate legacy system" design, not a regression. Recruiters have no
  per-recruiter blocked-time feature at all; adding one is a feature
  request, not a bug fix.
* JWT sessions are not server-side revocable — verified live: replaying a
  captured `user_session` token after logout, OR after a password change,
  still authenticates successfully until the token's natural 7-day expiry.
  This is standard stateless-JWT behavior, not a bug; a real fix (a
  `tokenVersion` field on `User`, checked on every request, incremented on
  password change) is a legitimate small addition but was judged out of
  scope for a bug-fix pass — flagged here as a known gap for a future,
  explicitly-scoped session-hardening task.
- `application.service.ts`'s `scheduleApplicationInterview`: the interview
  is created inside its own transaction (via `createInterview`), but the
  two follow-up writes — linking `interview.jobId`/`applicationId`, and
  advancing `round.status`/`round.interviewId` on the `Application` — run
  as two SEPARATE, non-transactional saves after that transaction has
  already committed. A crash in the narrow window between them could leave
  a confirmed interview holding a calendar slot with no application link,
  or an application stuck at `ready_to_book` for a slot that's already
  taken. A proper fix means threading an external Mongo session into
  `createInterview` (a public function many other callers use unmodified)
  — judged too invasive for a bug-fix pass; documented here as a known,
  narrow, low-probability risk rather than silently reworked.
* Recruiter portal has no dedicated mobile nav (`RecruiterNav.tsx` relies
  on horizontal scroll on narrow viewports) — unlike the candidate portal's
  `MobileTabBar`. Works, just a worse mobile UX than its candidate-side
  counterpart; a real fix means building a new mobile nav component, which
  is a UI feature addition, not a bug fix — documented as a recommendation,
  not implemented.
* `react-router-dom`'s "RSC Mode CSRF Bypass" advisory (`npm audit`) — this
  app is a client-only Vite SPA and never uses React Router's RSC data-
  loading mode, so this advisory's actual attack surface does not apply
  here. The only available `npm audit fix --force` path is a downgrade,
  which would be a real, unjustified regression risk for a vulnerability
  class this app doesn't use — left as-is, documented rather than
  "fixed" by a risky forced version change.

--------------------------------------------------
38.3 VERIFICATION PERFORMED (this pass)
--------------------------------------------------

Server: `tsc -b --noEmit`, `oxlint`, `npm test` (82/82 passing, including a
new DST regression test), `tsc -b` build — all clean, re-run after every
group of fixes, not just once at the end. Client: `tsc -b --noEmit`,
`oxlint`, `vite build` — all clean, likewise re-run incrementally. Live QA
(not just code review): register/login/logout/session-invalidation
behavior, login/register/change-password rate limiting, resume upload
size/mimetype rejection, resume orphan-delete guard (both the "should
succeed" and "should be blocked" cases), the full apply → shortlist →
AI-driven book → reschedule → cancel flow against the REAL OpenRouter
provider (not just scripted tests) including natural-language slot
selection ("the first one"), and MongoDB index verification (confirmed the
exact expected index set on a live database both before and after
`syncIndexes()`). **Not performed, and not falsely claimed as tested**:
real camera/microphone hardware verification with two simultaneous human
participants, and screenshot/GIF capture — no browser-automation or
screenshot tool was available in this environment; the WebRTC/Meeting Room
code path was verified by full code review plus the live API/socket-level
flows above, not a live two-person call.

--------------------------------------------------
38.4 THE AI_RATE_LIMITED ERROR (if you see this again)
--------------------------------------------------

`server/src/ai/providers/types.ts`'s `AiProviderRateLimitedError` (a
`AiProviderError` subclass, must be checked before the parent class in
`errorHandler.ts` — same "subclass before parent" `instanceof` ordering
`AiProviderNotConfiguredError` already required) is thrown specifically for
an OpenRouter 429 (free-tier daily cap — 50 requests/day without credits),
carrying the real reset time parsed from the response's
`X-RateLimit-Reset` header when present. Mapped to `503`/`AI_RATE_LIMITED`
with a `resetAt` field, surfaced client-side (`ApiRateLimitedError` in
`apiClient.ts`) as "back around [actual local time]" rather than the
generic "try again in a moment" every other AI-provider error still shows.
**How to apply**: if the AI assistant stops responding, check the error
`code` before assuming a bug — `AI_RATE_LIMITED` means wait for `resetAt`
or add OpenRouter credits, not a regression to chase in this codebase.
