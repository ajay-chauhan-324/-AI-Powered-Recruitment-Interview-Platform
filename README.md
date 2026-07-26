# The Ledger — Interview Scheduling & Management Platform

An AI-powered interview scheduling and management platform: a company/recruiter/interviewer publishes interview availability, candidates book interview slots against it. This is not a generic calendar — the product was pivoted from an earlier general-purpose appointment booking system into a dedicated interview scheduling product (see CLAUDE.md's "PRODUCT PIVOT" notice for the exact scope of that transformation). The full engineering and design specification governing this project lives in [CLAUDE.md](./CLAUDE.md) — read it before making architectural or visual changes.

## Status

**All phases are complete**, including the interview-domain transformation. Client/server scaffolding and design tokens, MongoDB models and validation, the timezone-aware availability engine (now with configurable buffer time / minimum notice / maximum booking window), a transaction-safe interview booking engine (create/reschedule/cancel, with reschedule history) with automated tests covering a real concurrent double-booking race, the Time Canvas wired to real interview data with real-time sync over Socket.IO, a full candidate booking flow (interview type selector, explicit timezone picker, expanded candidate fields, rich confirmation with calendar export), a recruiter/interviewer admin workspace (dashboard, calendar, candidate management, schedule settings), notifications (candidate- and interviewer-facing confirmation/reschedule/cancellation email) with a reminder abstraction, a real AI conversation layer, a full test suite, a completed security audit, and production-readiness hardening (see "Known notes" below for specifics).

### Interview domain

Every interview has a `title`, `interviewType` (HR screening / technical / coding / system design / behavioral / managerial / final / panel / custom), `round`, `locationType` (video/phone/onsite/custom) with a `meetingUrl` or `address`, an optional `interviewerName`/`interviewerEmail`, and candidate detail (`candidateName`/`candidateEmail`/`candidatePhone`/`candidateLinkedIn`/`candidateGithub`/`candidatePortfolioUrl`/`candidateResumeUrl` — a **link**, not a file upload, since no file-storage infrastructure exists in this project — /`candidateNotes`), on top of the original scheduling core (startAt/endAt/duration/timezone/status/source/manageTokenHash) and a `rescheduleHistory` array. `AvailabilityService`, `ScheduleConfig`, `BlockedSlot`, and `BookingLock` are unchanged from the original appointment system — they were already correct and generic. Existing production data was migrated with `npm run migrate:interviews` (see `server/src/scripts/migrate-appointments-to-interviews.ts`) rather than discarded.

### Candidate experience

The public flow (`/`) is the Time Canvas — tap an available slot (or use the AI ribbon) to open the booking panel: pick an interview type, confirm your detected timezone (or choose another from the full IANA list), enter your name/email (phone/LinkedIn/GitHub/portfolio/resume link/notes are optional, tucked behind a disclosure), and confirm. The confirmation screen shows the interview type, time, timezone, a manage link, and an "Add to calendar" button (a hand-rolled minimal .ics generator, `client/src/features/booking/lib/ics.ts` — no dependency needed). The manage page (`/manage/:token`) shows a live status badge (Upcoming / Starting soon / In progress / Completed, computed from the actual scheduled times) and a "Join interview" action once it's within 15 minutes of start — this always means opening the meeting link the recruiter/interviewer configured, **never** an in-house video call (see "Known notes" on real-time video).

### Recruiter/interviewer workspace

`/admin` is now a dashboard (today/upcoming/total/cancelled/rescheduled counts, quick actions, an upcoming-interviews timeline) — not the raw calendar. `/admin/calendar` has the day view with interview-type/round/candidate-name tags. `/admin/candidates` lists every candidate who's booked (searchable), with a click-through to their full interview history. `/admin/schedule` adds booking rules (buffer time between interviews, minimum notice, maximum booking window) alongside working hours/breaks/blocked time — all enforced by `AvailabilityService`, never duplicated in the AI layer or the frontend.

### AI conversation layer

Backed by [OpenRouter](https://openrouter.ai) through a provider abstraction (`server/src/ai/providers/`) — adding Gemini/OpenAI/Ollama later means adding one sibling file, never touching `ai/tools.ts`, `ai/conversation.service.ts`, or any booking/availability service. The AI never touches MongoDB or duplicates booking logic: every tool call (`check_availability`, `schedule_interview`, `reschedule_my_interview`, admin-only `list_interviews`/`reschedule_interview_by_id`/etc.) is Zod-validated and routed through the exact same `AvailabilityService`/`InterviewService` the human-facing forms use. Authorization is enforced in code, not by prompt instructions: a guest conversation can only ever act on the one interview tied to its own manage token (never an ID the model or user supplies in chat — verified by a dedicated test), and admin-only tools are never even offered to a guest conversation, let alone executed if requested by name. A hard 6-iteration cap on the tool-call loop guards against runaway/manipulated conversations. Set `OPENROUTER_API_KEY` in `server/.env` to enable it — without it, `/api/v1/ai/chat` and `/api/v1/admin/ai/chat` respond 503 rather than the whole server failing to boot (see `server/.env.example`).

### Real-time video — explicitly not implemented

The manage page and admin panel surface a "Join interview" action, but it only ever opens the meeting URL a recruiter/interviewer configured (Zoom/Meet/etc.) — there is **no** in-house video/audio calling. Building that correctly would need a third-party provider (e.g. Daily.co, Twilio Video, or a Zoom/Meet SDK) and credentials this project doesn't have. The integration point (where a real provider's client SDK would mount) is the "Join interview" action itself — swapping in a real provider means replacing that link with an SDK-launched call, not restructuring the domain model.

**46/46 automated tests passing** across 10 suites — InterviewService (11, including the concurrent double-booking race and reschedule-history tracking), AvailabilityService (15, including DST correctness across a real spring-forward transition and the buffer/minimum-notice/maximum-booking-window rules), notification.service (6), admin authorization (6, HTTP-level), real-time domain events (2), and the AI conversation loop (6, using a scripted mock provider — no live API calls in the automated suite). Run with `cd server && npm test` (pins `--test-concurrency=1` — see "Known notes").

The public calendar read endpoint and real-time events stay public-safe (time/status only, no candidate name/email/interview title) — only the authenticated `/admin/interviews` route returns full detail.

**Notifications default to logging their full content to the console**, not sending real email — no SMTP provider is configured (same reasoning as the AI key: rather than block on a credential, the notification service and its content are fully built and tested against a swappable transport interface; set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` in `server/.env` to send real email with no code changes). When an interviewer email is set on an interview, they get their own confirmation/reschedule/cancellation email addressed to them (naming the candidate), separate from the candidate's own notification. Reminders are an abstraction only (a real, tested `sendReminderEmail` function) — no automatic scheduler exists yet to call it on a schedule; that's future work, consistent with "don't over-engineer queues".

Reschedule/duration changes in the admin workspace happen through an edit panel's form fields (start time + duration), not a pointer-drag interaction — this gives full keyboard accessibility from the start rather than building a bespoke drag/resize handle and a separate keyboard path for it. Direct-manipulation drag could be added later as a progressive enhancement.

Run the server's test suite with `cd server && npm test` (requires the local MongoDB replica set — see "Local MongoDB" below).

## Structure

```
/
├── client/     # React + TypeScript + Vite + Tailwind CSS v4
├── server/     # Node.js + Express + TypeScript
├── README.md
└── CLAUDE.md   # Approved architecture, design, and phase plan (source of truth)
```

`client/` and `server/` are two independent npm projects (not npm workspaces) — run each from its own directory.

## Running locally

Two terminals:

```
cd server
cp .env.example .env
npm install
npm run dev      # http://localhost:4000
```

```
cd client
npm install
npm run dev      # http://localhost:5173
```

The server's `CLIENT_ORIGIN` env var must match the client's dev URL for CORS to work. The client's Vite dev server proxies `/api` to `http://localhost:4000` (see `client/vite.config.ts`), so the client always calls same-origin `/api/v1/...` paths regardless of environment.

## Admin account

There's no self-service admin signup. Create the first (or an additional) admin account with:

```
cd server
npm run admin:create -- you@example.com
```

This prints a randomly generated password once — store it securely; there is no password-reset flow yet. Sign in at `/admin/login`.

## Local MongoDB

Conflict-safe booking (CLAUDE.md §13) relies on multi-document transactions, which require a **replica set** — a standalone `mongod` will not work. In production, use MongoDB Atlas (a replica set by default) or a managed replica set; `MONGODB_URI` in `server/.env` just needs to point at one.

For local development, this project runs its own **dedicated** single-node replica-set instance on port 27018, separate from any other MongoDB install on the machine (a shared/standalone MongoDB on the default port 27017 is left untouched):

```
mongod --replSet rs0 --port 27018 --dbpath .mongo-data/db --bind_ip 127.0.0.1 --logpath .mongo-data/logs/mongod.log --logappend
# first time only, in another terminal:
mongo --port 27018 --eval "rs.initiate()"
```

`server/.env.example`'s `MONGODB_URI` already points at `mongodb://127.0.0.1:27018/booking_system?replicaSet=rs0` to match. `.mongo-data/` is gitignored.

## Verification

Each project has the same three checks (the server also has `npm test`, requiring the local MongoDB replica set above):

```
npm run typecheck
npm run lint
npm run build
```

## Known notes

- The Phase 13/14 notes below predate the interview-domain rename and still refer to the original route names (`/api/v1/appointments`, `/api/v1/admin/appointments`) — the findings and fixes described are still accurate, just at what are now `/api/v1/interviews` and `/api/v1/admin/interviews`. Kept as-written since they're historical records of what was audited and when.
- `react-router-dom`/`react-router` are pinned to an exact version, `7.18.1` (no `^` range) — re-checked during the Phase 13 security audit, since an earlier phase's pin to `7.11.0` turned out to be based on stale advisory information. Current reality (verified via `npm audit` against the live registry): **every** published `react-router` version has an open high-severity advisory one way or the other — `7.11.0` and below carry a bundle of SSR/data-router/RSC issues (open redirect, DoS via inefficient route matching, single-fetch DoS, Server Action CSRF, prerendered-redirect XSS), while `7.12.0` and above carry one narrower advisory, GHSA-qwww-vcr4-c8h2 (an RSC-mode CSRF bypass). This app uses only the plain declarative `<BrowserRouter>`/`<Routes>`/`<Route>` API — no data router, no loaders/actions, no RSC mode (confirmed by grep: every `navigate()`/`<Link to>` target is a hardcoded literal, never derived from user input) — so GHSA-qwww-vcr4-c8h2 does not apply to this codebase, while several of the advisories on the older side plausibly could (route-matching DoS operates on any incoming URL, which is always attacker-controlled). `7.18.1` is the better side of that tradeoff. Re-run `npm audit` before ever changing this pin.
- Production deployment needs a server/reverse-proxy rewrite so deep links like `/manage/:token` serve `index.html` (Vite's dev server already does this automatically) — not yet configured, tracked for Phase 14.
- Accessibility (Phase 11) was audited at the code level — no browser tool was available this session, so nothing here was verified by an actual screen reader or a visual pass. Two real WCAG AA contrast violations and a missing keyboard path to create a new appointment (previously mouse/touch-only) were found and fixed; touch targets were brought to 44px on primary buttons throughout. Known remaining gaps, lower priority: native form controls in `/admin/schedule` (checkboxes, time inputs, selects) rely on browser-default touch sizing rather than an explicit 44px target, and the header's narrowest-phone-width layout (≈320px) hasn't been visually confirmed to avoid horizontal scroll.
- **Phase 14 (Production Readiness) is complete.** Findings fixed: (1) `/api/v1/health` always returned HTTP 200 even when MongoDB was disconnected — useless as an orchestrator/load-balancer health check, since those read the status code, not the JSON body; now returns 503 when the DB is down. (2) no graceful shutdown existed — a `SIGTERM`/`SIGINT` handler now closes every open socket, then the HTTP server, then the Mongoose connection (in that order, via `io.close()` which closes both sockets and the underlying HTTP server, confirmed from socket.io's own source), with a 10s force-exit timer as a backstop; verified the process still exits cleanly, though actually observing the graceful-vs-forced code path live wasn't possible in this Windows dev environment (Windows has no real POSIX signals — `taskkill`/`Stop-Process` don't deliver an actual `SIGTERM` the way `docker stop`/Kubernetes pod termination do on the real Linux deployment target). (3) the admin appointments list endpoint (`GET /api/v1/admin/appointments`) had no maximum date-range guard, unlike the public calendar/availability views — an authenticated-but-still-unbounded query is a real memory/performance risk; capped at 366 days (wider than the public 62-day cap, since admins need full historical visibility per CLAUDE.md §8). (4) added a minimal dependency-free request logger (method/path/status/duration) — this project's scale doesn't justify morgan/winston, and (5) added a `TRUST_PROXY_HOPS` env var (default `0`) wired to Express's `trust proxy` setting, needed for `req.ip`/rate-limiting to resolve the real client IP correctly once deployed behind a reverse proxy or load balancer — deliberately left unset-by-default rather than guessed, since trusting a proxy hop that isn't actually there would let a client spoof `X-Forwarded-For` to bypass rate limiting. Already in good shape, no changes needed: database indexes (every real query pattern — status/date-range overlap, manage-token lookup, singleton configs — already had a matching index), environment configuration (fail-fast Zod validation since Phase 1), and the build process (`tsc -b` / `vite build`, both verified clean).
- **Phase 13 (Security Audit) is complete.** Findings fixed: (1) the public booking-creation endpoint (`POST /api/v1/appointments`) had no rate limit — since it emails whatever address is supplied, this was an email-bombing/abuse vector, not just a spam-booking one; now limited to 20/15min per IP. (2) the guest manage-token routes (`GET`/`PATCH`/`DELETE /api/v1/appointments/manage/:token`) had no rate limit either — token brute-forcing is cryptographically infeasible (256-bit random token, hashed at rest), but unlimited scripted scanning of an unauthenticated endpoint is still worth limiting; now 60/15min per IP. (3) the calendar and availability services' "query range too wide" guards threw a plain `Error`, which the error handler couldn't distinguish from a genuine server fault — they fell through to a generic 500 in production, masking what was actually a 400-worthy client input problem; both now throw `BookingValidationError`, mapped to 400. (4) the `react-router-dom` version pin (see above). No issues found with: JWT session handling (12h expiry, httpOnly/sameSite cookie, `secure` in production, no revocation list — a documented and accepted tradeoff), admin login rate limiting (already in place since Phase 9), password hashing (bcrypt, cost 12), input validation (Zod schemas with explicit length caps on every public-facing field), CORS (specific origin + credentials, no wildcard), security headers (`helmet()`), secrets handling (`.env` correctly gitignored and never committed, verified via `git ls-files`), or XSS/injection surface (no `dangerouslySetInnerHTML`, no `eval`/`Function`/`child_process` usage anywhere in the codebase).

## Design system

The approved visual direction is "The Ledger — Intelligent Time Canvas" (CLAUDE.md §4–§10): a continuous time canvas is the primary interface, not a dashboard with a calendar widget bolted on. Design tokens (color, type scale, spacing, radius, shadow) live in `client/src/styles/tokens.css`.
