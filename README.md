# The Ledger — Intelligent Time Canvas

AI-powered smart appointment booking system. The full engineering and design specification governing this project lives in [CLAUDE.md](./CLAUDE.md) — read it before making architectural or visual changes.

## Status

**Phases 1-6 and 8-14 are complete** (Phase 7 excepted — see below): client/server scaffolding and design tokens, MongoDB models and validation, the timezone-aware availability engine, a transaction-safe booking engine (create/reschedule/cancel) with automated tests covering a real concurrent double-booking race, the Time Canvas wired to real data with real-time sync over Socket.IO, a working public guest booking experience (manage link at `/manage/:token`, no login), an authenticated admin workspace (`/admin`) — full appointment detail and history, create/reschedule/resize/cancel, and working-hours/breaks/blocked-time configuration (`/admin/schedule`) — notifications (confirmation/reschedule/cancellation email) with a reminder abstraction ready for a future scheduler, a full test suite, a completed security audit, and production-readiness hardening (see "Known notes" below for the specifics of the last two).

**Phase 12 (Testing) is complete: 35/35 tests passing** across 8 suites — AppointmentService (10, including the concurrent double-booking race), AvailabilityService (12, including DST correctness across a real spring-forward transition and working-hours/break/blocked-slot exclusion), notification.service (5), admin authorization (6, HTTP-level against real Express routes — no session cookie, an invalid cookie, wrong password, a successful login, logout's cookie-clearing behavior, and confirming the public calendar route needs no auth), and real-time domain events (2, a self-contained http+socket server in-process asserting `appointment.created`/`appointment.cancelled` broadcast public-safe payloads with no name/email). Run with `cd server && npm test` — the script now pins `--test-concurrency=1` after a real test-isolation race surfaced between files sharing the global `ScheduleConfig` singleton.

**Phase 7 (AI conversation layer) is on hold**, blocked on an Anthropic API key (not something this assistant can generate) — see `server/.env.example`'s `ANTHROPIC_API_KEY`. Until it's provided, the public booking path (direct calendar interaction) stands in for the AI-driven entry point CLAUDE.md's flow describes; both are meant to converge on the same `AppointmentService`, so adding the AI layer later won't change this work.

The public calendar read endpoint and real-time events stay public-safe (time/status only, no name/email/purpose) — only the authenticated `/admin/appointments` route returns full detail.

**Notifications default to logging their full content to the console**, not sending real email — no SMTP provider is configured (same reasoning as the AI key: rather than block on a credential, the notification service and its content are fully built and tested against a swappable transport interface; set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` in `server/.env` to send real email with no code changes). Reminders are an abstraction only (a real, tested `sendReminderEmail` function) — no automatic scheduler exists yet to call it on a schedule; that's future work, consistent with "don't over-engineer queues" (CLAUDE.md §23).

Reschedule/duration changes in the admin workspace happen through an edit panel's form fields (start time + duration), not a pointer-drag interaction — this gives full keyboard accessibility (CLAUDE.md §24) from the start rather than building a bespoke drag/resize handle and a separate keyboard path for it. Direct-manipulation drag could be added later as a progressive enhancement.

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

- `react-router-dom`/`react-router` are pinned to an exact version, `7.18.1` (no `^` range) — re-checked during the Phase 13 security audit, since an earlier phase's pin to `7.11.0` turned out to be based on stale advisory information. Current reality (verified via `npm audit` against the live registry): **every** published `react-router` version has an open high-severity advisory one way or the other — `7.11.0` and below carry a bundle of SSR/data-router/RSC issues (open redirect, DoS via inefficient route matching, single-fetch DoS, Server Action CSRF, prerendered-redirect XSS), while `7.12.0` and above carry one narrower advisory, GHSA-qwww-vcr4-c8h2 (an RSC-mode CSRF bypass). This app uses only the plain declarative `<BrowserRouter>`/`<Routes>`/`<Route>` API — no data router, no loaders/actions, no RSC mode (confirmed by grep: every `navigate()`/`<Link to>` target is a hardcoded literal, never derived from user input) — so GHSA-qwww-vcr4-c8h2 does not apply to this codebase, while several of the advisories on the older side plausibly could (route-matching DoS operates on any incoming URL, which is always attacker-controlled). `7.18.1` is the better side of that tradeoff. Re-run `npm audit` before ever changing this pin.
- Production deployment needs a server/reverse-proxy rewrite so deep links like `/manage/:token` serve `index.html` (Vite's dev server already does this automatically) — not yet configured, tracked for Phase 14.
- Accessibility (Phase 11) was audited at the code level — no browser tool was available this session, so nothing here was verified by an actual screen reader or a visual pass. Two real WCAG AA contrast violations and a missing keyboard path to create a new appointment (previously mouse/touch-only) were found and fixed; touch targets were brought to 44px on primary buttons throughout. Known remaining gaps, lower priority: native form controls in `/admin/schedule` (checkboxes, time inputs, selects) rely on browser-default touch sizing rather than an explicit 44px target, and the header's narrowest-phone-width layout (≈320px) hasn't been visually confirmed to avoid horizontal scroll.
- **Phase 14 (Production Readiness) is complete.** Findings fixed: (1) `/api/v1/health` always returned HTTP 200 even when MongoDB was disconnected — useless as an orchestrator/load-balancer health check, since those read the status code, not the JSON body; now returns 503 when the DB is down. (2) no graceful shutdown existed — a `SIGTERM`/`SIGINT` handler now closes every open socket, then the HTTP server, then the Mongoose connection (in that order, via `io.close()` which closes both sockets and the underlying HTTP server, confirmed from socket.io's own source), with a 10s force-exit timer as a backstop; verified the process still exits cleanly, though actually observing the graceful-vs-forced code path live wasn't possible in this Windows dev environment (Windows has no real POSIX signals — `taskkill`/`Stop-Process` don't deliver an actual `SIGTERM` the way `docker stop`/Kubernetes pod termination do on the real Linux deployment target). (3) the admin appointments list endpoint (`GET /api/v1/admin/appointments`) had no maximum date-range guard, unlike the public calendar/availability views — an authenticated-but-still-unbounded query is a real memory/performance risk; capped at 366 days (wider than the public 62-day cap, since admins need full historical visibility per CLAUDE.md §8). (4) added a minimal dependency-free request logger (method/path/status/duration) — this project's scale doesn't justify morgan/winston, and (5) added a `TRUST_PROXY_HOPS` env var (default `0`) wired to Express's `trust proxy` setting, needed for `req.ip`/rate-limiting to resolve the real client IP correctly once deployed behind a reverse proxy or load balancer — deliberately left unset-by-default rather than guessed, since trusting a proxy hop that isn't actually there would let a client spoof `X-Forwarded-For` to bypass rate limiting. Already in good shape, no changes needed: database indexes (every real query pattern — status/date-range overlap, manage-token lookup, singleton configs — already had a matching index), environment configuration (fail-fast Zod validation since Phase 1), and the build process (`tsc -b` / `vite build`, both verified clean).
- **Phase 13 (Security Audit) is complete.** Findings fixed: (1) the public booking-creation endpoint (`POST /api/v1/appointments`) had no rate limit — since it emails whatever address is supplied, this was an email-bombing/abuse vector, not just a spam-booking one; now limited to 20/15min per IP. (2) the guest manage-token routes (`GET`/`PATCH`/`DELETE /api/v1/appointments/manage/:token`) had no rate limit either — token brute-forcing is cryptographically infeasible (256-bit random token, hashed at rest), but unlimited scripted scanning of an unauthenticated endpoint is still worth limiting; now 60/15min per IP. (3) the calendar and availability services' "query range too wide" guards threw a plain `Error`, which the error handler couldn't distinguish from a genuine server fault — they fell through to a generic 500 in production, masking what was actually a 400-worthy client input problem; both now throw `BookingValidationError`, mapped to 400. (4) the `react-router-dom` version pin (see above). No issues found with: JWT session handling (12h expiry, httpOnly/sameSite cookie, `secure` in production, no revocation list — a documented and accepted tradeoff), admin login rate limiting (already in place since Phase 9), password hashing (bcrypt, cost 12), input validation (Zod schemas with explicit length caps on every public-facing field), CORS (specific origin + credentials, no wildcard), security headers (`helmet()`), secrets handling (`.env` correctly gitignored and never committed, verified via `git ls-files`), or XSS/injection surface (no `dangerouslySetInnerHTML`, no `eval`/`Function`/`child_process` usage anywhere in the codebase).

## Design system

The approved visual direction is "The Ledger — Intelligent Time Canvas" (CLAUDE.md §4–§10): a continuous time canvas is the primary interface, not a dashboard with a calendar widget bolted on. Design tokens (color, type scale, spacing, radius, shadow) live in `client/src/styles/tokens.css`.
