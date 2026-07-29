# The Ledger — AI-Powered Recruitment & Interview Platform

An end-to-end recruitment platform: recruiters post jobs with a custom interview pipeline and their own calendar of working hours, candidates apply with an AI-analyzed resume, get shortlisted, book each interview round themselves once it unlocks — entirely by chatting with an AI assistant in plain language — and meet in the platform's own built-in video Meeting Room. No external scheduling links, no Zoom/Meet dependency, and the AI never invents availability — every slot it offers and every booking it makes comes from the same real, transaction-protected scheduling engine the rest of the app uses.

The full engineering specification (design system, phase history, and the standing rules every change in this repo follows) lives in [CLAUDE.md](./CLAUDE.md) — read it before making architectural or visual changes.

> **Screenshots** — _placeholder: add product screenshots here (landing page, job listing, application tracker, recruiter pipeline board, Meeting Room) before publishing._

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Features](#features)
- [Authentication](#authentication)
- [Recruiter Flow](#recruiter-flow)
- [Candidate Flow](#candidate-flow)
- [ATS (AI Resume Analysis)](#ats-ai-resume-analysis)
- [Interview Pipeline](#interview-pipeline)
- [Interview Scheduling](#interview-scheduling)
- [Interview Meeting Room](#interview-meeting-room)
- [AI Assistants](#ai-assistants)
- [API Overview](#api-overview)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [MongoDB Atlas Setup](#mongodb-atlas-setup)
- [OpenRouter Setup](#openrouter-setup)
- [Development](#development)
- [Testing](#testing)
- [Production Build](#production-build)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Future Roadmap](#future-roadmap)
- [Known Limitations](#known-limitations)
- [Contribution Guide](#contribution-guide)
- [License](#license)
- [Credits](#credits)

## Project Overview

A candidate applies to a job with a resume upload; an AI model scores their fit against the job description (ATS analysis). A recruiter reviews applications ranked by that score, shortlists a candidate, and the candidate's first interview round unlocks automatically — no manual "unlock" button anywhere in the product. The candidate books that round by chatting with the AI assistant in plain language ("I want to book my interview", "tomorrow morning", "3pm works") — the AI resolves natural language against the *real*, live availability of the round's own recruiter (every recruiter configures their own working hours) and books immediately on confirmation, using the exact same conflict-safe scheduling engine a manual picker would. Once booked, the platform auto-generates an in-platform video meeting (its own Meeting Room, not an external link). After the interview, the recruiter marks the round passed or failed; passing automatically unlocks the next round in the pipeline, and the cycle repeats until the candidate is hired or rejected. The AI never invents a slot or a booking — every offer and every confirmation comes from a real backend query, never a guess.

## Architecture

```
┌─────────────┐      HTTPS/REST       ┌──────────────┐      Mongoose       ┌───────────┐
│   Client    │ ───────────────────►  │    Server    │ ─────────────────► │  MongoDB  │
│ React + Vite│ ◄─────────────────── │ Express + TS │ ◄───────────────── │  (replica │
└─────────────┘   Socket.IO (WS)      └──────────────┘                    │    set)   │
       │          /calendar, /meeting        │                            └───────────┘
       │                                     │
       │                              ┌──────┴───────┐
       │                              │  AI Provider  │
       │                              │  (OpenRouter, │
       │                              │  behind an    │
       │                              │  abstraction) │
       │                              └──────────────┘
       │
       └── WebRTC (peer-to-peer video/audio/screen-share, signaled over Socket.IO)
```

- **Client** — React 19 + TypeScript + Vite + Tailwind CSS v4, feature-folder structure, TanStack Query for all server state, React Router for routing (with route-based code splitting via `React.lazy`).
- **Server** — Node.js + Express 5 + TypeScript, a clean routes → controllers → services → models layering. Every business rule (availability, booking conflicts, round progression, ATS scoring, meeting lifecycle) lives in a service, never in a controller — controllers stay thin.
- **Database** — MongoDB via Mongoose, run as a single-node **replica set** locally (multi-document transactions, used for conflict-safe booking, require one).
- **Real-time** — Socket.IO, two independent namespaces: `/calendar` (public, unauthenticated, broadcast-only invalidation signals — "something changed, re-fetch") and `/meeting` (authenticated, room-per-meeting, carries WebRTC signaling + chat + participant events).
- **AI** — a single provider-agnostic interface (`server/src/ai/providers/`) currently backed by OpenRouter; every AI tool call is Zod-validated and routed through the same services the human-facing REST routes use. The AI never queries MongoDB directly and never decides authorization.

## Tech Stack

| Layer | Technology |
|---|---|
| Client framework | React 19, TypeScript, Vite |
| Client styling | Tailwind CSS v4 (custom design tokens, dark mode via CSS custom properties) |
| Client state | TanStack Query (server state), local `useState`/`useReducer` (UI state) |
| Client routing | React Router 7 (declarative `<Routes>`, no data router/loaders) |
| Client animation | Motion (`motion/react`), Lenis (smooth scroll on the landing page) |
| Server framework | Node.js, Express 5, TypeScript |
| Database | MongoDB (Mongoose ODM), single-node replica set locally, Atlas or managed replica set in production |
| Real-time | Socket.IO (server + client) |
| Video | Native browser WebRTC APIs (`RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`) — no third-party video SDK |
| AI | OpenRouter (swappable via a provider abstraction) |
| Auth | JWT in an httpOnly, SameSite cookie; bcrypt password hashing |
| Validation | Zod (both client-adjacent input shapes and all server request bodies) |
| Email | Nodemailer, with a console-logging transport by default (no SMTP creds required for local dev) |
| Testing | Node's built-in `node:test` + `assert` (server only — no client test suite yet, see Known Limitations) |
| Linting | oxlint (both client and server) |

## Folder Structure

```
/
├── client/
│   └── src/
│       ├── app/            # App.tsx (routes, lazy-loaded per feature)
│       ├── components/     # Shared UI primitives (Button, Badge, Avatar, layouts…)
│       ├── features/       # One folder per domain — see below
│       ├── hooks/          # Cross-feature hooks (e.g. useRealtimeInvalidation, used by 6+ pages)
│       ├── lib/            # apiClient, dateContext, skillOverlap, etc.
│       └── styles/         # tokens.css (design system), global.css
├── server/
│   └── src/
│       ├── ai/              # Provider abstraction, tools.ts, conversation.service.ts, ATS analysis
│       ├── config/          # env.ts (Zod-validated env vars), db.ts, scheduleDefaults.ts
│       ├── controllers/     # Thin — parse input, call a service, shape the response
│       ├── events/          # interviewEvents.ts (domain event emitter feeding Socket.IO)
│       ├── middleware/      # userAuth, candidateAuth, recruiterAuth, adminAuth, errorHandler
│       ├── models/          # Mongoose schemas — the actual source of truth for shape
│       ├── routes/          # Route wiring + rate limiters, mounted in app.ts
│       ├── services/        # All business logic — availability, booking, applications, meetings…
│       ├── sockets/         # socketServer.ts (/calendar), meetingNamespace.ts (/meeting)
│       ├── validators/      # Zod schemas for every request body
│       └── scripts/         # CLI one-offs: create-admin, seed-dev-data, migrate-appointments
├── README.md
└── CLAUDE.md                # Engineering spec, standing rules, and current-implementation reference
```

Each `client/src/features/<domain>/` folder follows the same internal shape: `api/` (typed fetch functions), `components/`, `hooks/`, `pages/`. Domains: `auth`, `jobs`, `applications`, `interviews`, `meetings`, `calendar`, `ai`, `settings`, `dashboard`, `recruiter/*`, `admin/*`, `booking` (the legacy guest manage-link flow), `marketing`.

## Features

- Candidate & recruiter self-service accounts (one shared auth system, distinguished by `accountType`)
- Job posting with a custom, ordered interview-round pipeline per job
- Resume upload (PDF/plain-text) with AI-generated ATS match scoring against the job
- Candidate profile (headline, skills, education, experience, projects, photo, social links) — **optional**, never required to apply
- Company profile (logo, industry, size, founded year, benefits, culture, tech stack) with a public company page
- Automatic, non-AI interview booking against a fixed IST schedule, with real-time slot availability (no double-booking, no manual refresh needed)
- An in-platform WebRTC video Meeting Room — camera, mic, screen share, chat, participants, waiting room, connection status, copy-link, fullscreen
- Automatic round-unlock pipeline (shortlist → round 1 → pass → round 2 → … → hired), with zero manual "unlock" steps
- Email notifications (booking, reschedule, cancellation, "round ready to book", and 30/5-minute meeting reminders) — logged to console by default, real SMTP opt-in
- Two AI assistants (candidate-facing and recruiter-facing), strictly read-only for scheduling — see [AI Assistants](#ai-assistants)
- Full dark mode (CSS custom-property based, follows OS preference or an explicit toggle)
- Route-based code splitting, WCAG-AA-oriented accessibility pass, responsive mobile layouts throughout

## Authentication

Two independent auth systems, deliberately never sharing a cookie:

1. **Self-service (`user_session` cookie)** — candidates and recruiters both register/log in through the same system (`server/src/controllers/auth.controller.ts`), distinguished by `User.accountType`. Middleware (`requireCandidateAuth` / `requireRecruiterAuth`) always re-reads `accountType` fresh from the database — a 7-day JWT's claim is never trusted alone for authorization.
2. **Admin (`admin_session` cookie)** — a separate, CLI-provisioned account system (`npm run admin:create`) for the legacy single-tenant admin workspace (`/admin/*`), predating the recruiter multi-tenant model and kept for historical/generic-booking use cases.

Guest (anonymous) interview management uses a third mechanism entirely: a random 256-bit manage token, hashed at rest, emailed to the candidate — never a cookie/session at all.

## Recruiter Flow

1. Register as a recruiter (creates a `Company` record).
2. Set your own interview calendar — working hours, recurring breaks, timezone, and booking rules (buffer between interviews, minimum notice, maximum booking window) under **Settings → Interview calendar**. Auto-seeded with a sane default on first visit; every recruiter's calendar is independent — booking against one recruiter's jobs never checks or conflicts with another's.
3. Post a job with an ordered interview pipeline (e.g. Behavioral → Technical → Coding), each round with its own type, duration, and default location.
4. Publish the job (requires at least one pipeline round).
5. Review applications, ranked automatically by AI match score.
6. Shortlist a candidate — this **automatically** unlocks their first round; there is no separate "unlock" button anywhere in the UI.
7. Once the candidate books (through their own AI assistant, against your calendar) and the interview happens, mark the round **passed** or **failed**. Passing automatically unlocks the next round; failing marks the application rejected. The last round passing marks the application **selected**.
8. Join interviews from the recruiter calendar, in the same in-platform Meeting Room the candidate uses.
9. Ask the recruiter AI assistant things like "who's my best React candidate", "what's on my calendar tomorrow", or "reschedule this interview" — see [AI Assistants](#ai-assistants).

## Candidate Flow

1. Register (no profile fields are required to register or to apply — see [Known Limitations](#known-limitations) for the deliberate history here).
2. Browse and apply to jobs, attaching an uploaded resume.
3. Track every application's status and round-by-round progress on **My Applications**.
4. Once a recruiter shortlists you, your first round shows a **"Book with AI"** button — this opens the AI assistant, already knowing which round you mean, and you just describe when you're free: "tomorrow morning", "after 3pm", "any time this week". The AI checks the recruiter's real calendar, lists a few real options, and books immediately once you pick one — no slot-picker UI required. (A small "Pick a time manually" link next to it still opens a direct slot picker, kept as a fallback.)
5. Once booked, **My Applications** shows the meeting time, a countdown, and a **Join Interview** button that becomes active a few minutes before start — the AI chat also shows a compact booking confirmation with a direct Join link.
6. Reschedule or cancel directly from the same page, or just ask the AI assistant to do it ("move my interview to Friday", "cancel it") — either way goes through the same real scheduling service.
7. Ask the candidate AI assistant things like "have I been shortlisted", "when is my interview", or "where is my meeting" — it answers from real backend data, never invents one.

## ATS (AI Resume Analysis)

On application submission, `server/src/ai/atsAnalysis.service.ts` sends the candidate's extracted resume text plus the job's requirements to the AI provider and stores a structured result on the application: a 0–100 score, a confidence level, matched/missing skills, experience/education fit notes, strengths, gaps, and recommendations. This is **best-effort** — a failed or unavailable AI provider never blocks the application itself; the application is created either way, with `atsAnalysis: null` if scoring didn't complete. The score is recruiter-only — a candidate never sees their own ATS score or analysis, in the UI or through the AI assistant.

## Interview Pipeline

Each `Job` defines an ordered `pipeline` (round type, title, duration, default location). When a candidate applies, that pipeline is **snapshotted** onto the `Application` as `rounds[]`, all `locked` — editing the job's pipeline afterward never retroactively changes an already-submitted application. Round progression is a strict, automatic state machine, entirely server-side:

```
locked → ready_to_book → scheduled → passed / failed
```

- **Shortlisting** an application unlocks round 1 (`locked → ready_to_book`).
- **Booking** a `ready_to_book` round moves it to `scheduled` and creates a real `Interview` document.
- **Passing** a `scheduled` round unlocks the next round; passing the **last** round marks the application `selected`.
- **Failing** any round marks the whole application `rejected` immediately.

Only one round is ever unlockable at a time — there is no code path that lets a candidate see or book a round out of sequence.

## Interview Scheduling

**Every recruiter owns their own calendar** — working hours, recurring breaks, timezone, buffer between interviews, minimum booking notice, and maximum booking window, all independently configurable (`Settings → Interview calendar`). Recruiter A's bookings never check against, conflict with, or block Recruiter B's slots. A brand-new recruiter's calendar is auto-seeded with a sane starting pattern (Asia/Kolkata, Mon–Fri, 10–13 & 15–19) on first use, purely as a default — never enforced, unlike the legacy admin/guest booking widget below.

Every calendar, whichever recruiter it belongs to, is served by the same single centralized engine, `AvailabilityService` — nothing else in the codebase computes availability independently, and no booking path (AI, direct picker, guest widget) reimplements this logic. Booking is transaction-protected (MongoDB multi-document transactions) with a re-check inside the transaction, so two candidates racing for the same slot can never both win it — the loser gets a clean "that slot was just taken" response with real alternatives, and the UI refreshes automatically via the `/calendar` Socket.IO namespace, with no manual page refresh needed.

A separate, legacy global calendar (the original generic/non-recruitment booking product this platform pivoted from — `/admin/*`, the public guest booking widget, and their own AI tool) still runs on the original fixed Asia/Kolkata Mon–Fri 10–13/15–19 schedule, which *is* still a deliberate, non-admin-configurable product policy for that one legacy surface specifically — it was never merged into the per-recruiter model, by design.

## Interview Meeting Room

Every `video`-format interview automatically gets its own in-platform meeting (`Interview.meeting`: an opaque `meetingId`, a `status` state machine `not_started → waiting → in_progress → ended`, and a participants list with join/leave timestamps) — never an external Zoom/Meet link. `meetingUrl` is simply `/meeting/:meetingId`, a same-origin route, so every existing "Join interview" link across the app kept working unchanged once this was introduced.

The Meeting Room (`client/src/features/meetings/`) is a real 1:1 WebRTC video call:

- Camera, microphone, and screen share are all genuinely functional (not placeholders)
- Signaling (SDP offer/answer, ICE candidates) travels over a dedicated, authenticated Socket.IO namespace (`/meeting`) — a private room per meeting, joined only after the server re-verifies the connecting session actually owns that interview (the same ownership checks the REST reschedule/cancel routes use)
- Chat and a participants list are live over the same channel
- A waiting room state shows while only one side has joined; the call begins once both are present
- Copy-meeting-link, fullscreen, connection status, and a live meeting timer are all included
- **Raise Hand** is a real, working feature (signaled over the same `/meeting` namespace, reflected live in the other participant's UI). **Recording** is intentionally a UI-only stub — explicitly marked future-ready, not yet functional
- No TURN relay is configured (STUN only) — sufficient for most direct peer connections; a production deployment behind restrictive corporate NATs would need one

## AI Assistants

Two separate chat surfaces, both routed through the same provider-agnostic conversation loop (`server/src/ai/conversation.service.ts`) and the same Zod-validated, service-backed tool layer (`server/src/ai/tools.ts`) — never a second AI implementation per role.

**The candidate AI is the primary way an interview gets booked.** Say "I want to book my interview", "tomorrow morning works", "3pm", or "any available slot" and the assistant will: figure out which application/round you mean (asking you to clarify only if more than one is ready), check the owning recruiter's *real* calendar, interpret your natural-language time preference against the *actual* returned slots (never an invented one), present a few options, and book immediately once you confirm — through the exact same conflict-safe scheduling service a manual picker uses, never a second booking path. If the slot gets taken by someone else a moment before you confirm, the assistant treats it as a normal turn ("that time was just taken — here are the next options"), never a hard failure. It can also reschedule or cancel an *existing* interview the same conversational way.

- **Candidate assistant** — find a bookable round, check availability, **book an interview**, reschedule, cancel, application/round/interview status, upcoming interviews, meeting links. A candidate's own ATS score is never shown, in chat or anywhere else.
- **Recruiter assistant** — job/application listing, cross-job candidate ranking by ATS score or skill ("best React candidate", "top 10 candidates"), applications waiting for review, today's/tomorrow's interviews, reschedule, cancel. (The recruiter AI does not create bookings — interviews against a recruiter's calendar are only ever created by the candidate side, matching how a real interview invitation works.)

Every tool call is authorization-scoped server-side (never by anything the model claims) and every response is built from a real database query — the model is instructed to never guess or invent data it doesn't have a tool result for. See [CLAUDE.md §37](./CLAUDE.md) for the full technical detail of how this works, including a known, partially-mitigated quirk where the free-tier model occasionally emits literal Markdown syntax despite being told not to.

## API Overview

All routes are mounted under `/api/v1`. A non-exhaustive map (see `server/src/app.ts` for the authoritative, complete list):

| Prefix | Auth | Purpose |
|---|---|---|
| `/auth` | mixed | Register, login, logout, profile |
| `/jobs`, `/companies` | public | Published job/company listings |
| `/applications` | candidate | Apply, list own applications, schedule/reschedule/cancel |
| `/resumes`, `/me/photo` | candidate/user | File upload management |
| `/my/interviews`, `/my/ai` | candidate | Candidate's own interviews, candidate AI chat |
| `/recruiter/*` | recruiter | Jobs, applications, interviews, company, AI chat — all scoped to the recruiter's own company |
| `/admin/*` | admin | Legacy single-tenant admin workspace |
| `/meetings/:meetingId` | any signed-in user | Pre-join meeting metadata (ownership-checked both ways) |
| `/availability`, `/calendar` | public | Read-only availability/calendar views |
| `/health` | public | `200`/DB-connected or `503`/DB-disconnected |

## Environment Variables

Defined and Zod-validated in `server/src/config/env.ts`; see `server/.env.example` for the authoritative, in-sync list.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MONGODB_URI` | **Yes** | — | Must point at a replica set |
| `JWT_SECRET` | **Yes** | — | Minimum 32 characters |
| `NODE_ENV` | No | `development` | |
| `PORT` | No | `4000` | |
| `CLIENT_ORIGIN` | No | `http://localhost:5173` | Must match the client's dev/prod URL for CORS |
| `TRUST_PROXY_HOPS` | No | `0` | Set when deployed behind a reverse proxy/load balancer |
| `SMTP_HOST`/`PORT`/`USER`/`PASS`/`FROM` | No | — | Omit to log emails to the console instead of sending |
| `AI_PROVIDER` | No | `openrouter` | |
| `OPENROUTER_API_KEY` | No | — | Omit to have AI endpoints respond `503` instead of failing to boot |
| `OPENROUTER_MODEL` | No | a free-tier model | Swap if the configured model is ever deprecated |

The client has no environment variables of its own — Vite's dev server proxies `/api` to the server, so the client always calls same-origin paths in every environment.

## Installation

```
cd server && npm install
cd ../client && npm install
```

## MongoDB Atlas Setup

Conflict-safe booking uses multi-document MongoDB transactions, which require a **replica set** — a standalone `mongod` will connect fine but fail (with a real, driver-level error) the moment the first interview is booked. Atlas clusters are replica sets by default, so this is usually the simplest path to a production-ready database without self-hosting one:

1. Create a free or paid cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas) (any tier works — even the free M0 tier is a real replica set).
2. **Database Access** → add a database user with a strong, generated password (not your Atlas account password).
3. **Network Access** → add the IP address(es) your server will connect from (or `0.0.0.0/0` for local development only — never for production; scope this to your actual deployment's egress IP(s) instead).
4. **Connect → Drivers** → copy the `mongodb+srv://...` connection string, substitute in your database user's credentials, and set it as `MONGODB_URI` in `server/.env`. It already includes `retryWrites=true&w=majority`, which this project relies on but never overrides in code — don't strip those params if you hand-edit the string.
5. If `mongodb+srv://` fails to resolve from your machine/network with a DNS-looking error (`querySrv ECONNREFUSED`) even though the connection string is correct — this has been observed on some networks (notably mobile-hotspot-style connections) as a Node.js DNS-resolver quirk, not an Atlas or code problem. Verify with `nslookup -type=SRV _mongodb._tcp.<your-cluster-host>` — if that resolves fine but the app still can't connect, try a different network, or fall back to a local replica set for development (see [Development](#development)) and only point at Atlas from a network/host where the SRV lookup succeeds (e.g. most production hosting providers).

## OpenRouter Setup

The AI conversation layer (candidate assistant, recruiter assistant, ATS scoring) is optional at boot — omit `OPENROUTER_API_KEY` and the server still starts normally, with AI-touching endpoints responding `503` instead of failing to boot.

1. Create an account at [openrouter.ai](https://openrouter.ai) and generate a key at **Settings → Keys**.
2. Set it as `OPENROUTER_API_KEY` in `server/.env`.
3. The default model (`OPENROUTER_MODEL`, see `server/.env.example`) is a free-tier model with tool-calling support. Free models are capped at **50 requests/day** without purchasing credits — heavy manual testing or a real user base will exhaust this quickly. OpenRouter's own error message when this happens ("Add 10 credits to unlock 1000 free model requests per day") is surfaced to the end user as a specific `AI_RATE_LIMITED` error with the real reset time, not a generic failure — see [Troubleshooting](#troubleshooting).
4. If the configured model is ever deprecated or removed from OpenRouter's catalog, swap `OPENROUTER_MODEL` — no code change is needed as long as the replacement model supports tool/function calling.

## Development

Two terminals, plus a local MongoDB replica set (see below):

```
cd server
cp .env.example .env   # fill in MONGODB_URI / JWT_SECRET at minimum
npm run dev             # http://localhost:4000
```

```
cd client
npm run dev             # http://localhost:5173
```

**Local MongoDB** — conflict-safe booking relies on multi-document transactions, which require a replica set (a standalone `mongod` will not work):

```
mongod --replSet rs0 --port 27018 --dbpath .mongo-data/db --bind_ip 127.0.0.1 --logpath .mongo-data/logs/mongod.log --logappend
# first time only, in another terminal:
mongo --port 27018 --eval "rs.initiate()"
```

`server/.env.example`'s `MONGODB_URI` already points at this instance. On memory-constrained machines, add `--wiredTigerCacheSizeGB 0.25 --oplogSize 64` to bound its footprint.

**Useful server scripts**:

```
npm run admin:create -- you@example.com   # create the first admin account (legacy workspace)
npm run seed:dev                          # populate realistic recruiter/job/candidate/application dev data
npm run seed:dev:remove                   # remove everything the seed script created
npm run migrate:interviews                # one-time data migration from the pre-pivot appointment model
```

## Testing

Server only (no client test suite yet — see Known Limitations):

```
cd server
npm test
```

Requires the local MongoDB replica set above. Runs with `--test-concurrency=1` (tests share one database and rely on distinct fixture data/time windows to avoid collisions, not on parallel isolation).

## Production Build

```
cd server && npm run build && npm start
cd client && npm run build && npm run preview   # or serve dist/ with any static host
```

Both `tsc -b` (server) and `tsc -b && vite build` (client) must complete with zero errors before a build is considered passing — this project treats a clean typecheck as a hard build gate, not a lint-only nicety.

## Deployment

- The client is a static SPA (`client/dist/`) — deploy it behind any static host or CDN, with a rewrite rule so deep links (e.g. `/jobs/some-slug`, `/manage/:token`) serve `index.html` instead of 404ing.
- The server needs a Node.js runtime, a reachable MongoDB **replica set** (Atlas or a self-managed one — a standalone instance will not support the transactional booking path), and the required environment variables above.
- `GET /api/v1/health` reports `200`/`db: connected` or `503`/`db: disconnected` — wire it into your orchestrator's health check.
- The server already handles `SIGTERM`/`SIGINT` gracefully (drains sockets, then HTTP, then the DB connection, with a 10s force-exit backstop) — no extra shutdown wiring needed for standard container orchestration.
- No Dockerfile, docker-compose, or CI workflow exists in this repo yet — see Known Limitations.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Server fails to boot with a Mongo transaction/topology error | `MONGODB_URI` points at a standalone `mongod`, not a replica set — see [MongoDB Atlas Setup](#mongodb-atlas-setup) or the local replica-set instructions in [Development](#development). |
| `querySrv ECONNREFUSED` connecting to an Atlas `mongodb+srv://` URI | Usually a Node.js DNS-resolver quirk on the current network (observed on mobile-hotspot-style connections), not a bad connection string — verify with `nslookup -type=SRV _mongodb._tcp.<cluster-host>`; if that resolves but Node still can't connect, try a different network or use a local replica set for development. |
| AI assistant says something like "having trouble reaching its AI provider" | Check the response's error `code`. `AI_RATE_LIMITED` means the OpenRouter free-tier daily cap (50 requests/day) is exhausted — wait for the given reset time or add OpenRouter credits; this is expected behavior under load, not a bug. Any other code is a genuine provider/network issue — retry, and check `OPENROUTER_API_KEY` is set and valid. |
| AI assistant occasionally shows literal `**asterisks**` in a reply | A known, partially-mitigated quirk of the configured free-tier model not perfectly following the "plain text only" system-prompt instruction — see [CLAUDE.md §37.2](./CLAUDE.md). Not a client rendering bug. |
| A candidate can't book — "no interview currently ready to book" | The recruiter hasn't shortlisted them yet (round 1 only unlocks on shortlist), or every unlocked round is already scheduled/passed/failed. Check the application's round state on the recruiter's application-detail page. |
| Booking says a slot is unavailable that "should" be free | Check the *recruiter's own* calendar under their Settings — every recruiter has an independent calendar now; confirm working hours/breaks/buffer/minimum-notice actually cover the requested time, and that there isn't an existing interview or (for the legacy admin product only) a blocked period overlapping it once the buffer is applied. |
| Video call has no picture/audio from the other side | Confirm both participants granted camera/mic permission (check the browser's permission indicator, not just the app's own error banner) and that neither is behind a symmetric/restrictive NAT that STUN alone can't traverse — no TURN relay is configured, see Known Limitations. |
| `npm test` (server) fails immediately with a transaction-related error | The local MongoDB instance isn't running as a replica set, or isn't running at all — see the `mongod --replSet rs0 ...` instructions in [Development](#development). |
| A local MongoDB instance keeps crashing/OOMing | Bound its cache: add `--wiredTigerCacheSizeGB 0.25 --oplogSize 64` to the `mongod` command. |

## Future Roadmap

- TURN relay for the Meeting Room (WebRTC connections behind restrictive corporate NATs)
- Group/panel interviews in the Meeting Room (currently strictly 1:1)
- Recording, made functional (currently a UI-only stub — Raise Hand, previously also a stub, is now a real working feature)
- "Offline" interview meeting type (the schema already supports the enum value; no UI/logic exists for it yet)
- A password-reset flow (currently: admin accounts have no self-service recovery at all)
- CI (typecheck/lint/test on every push), a Dockerfile/docker-compose for one-command local spin-up
- A client-side automated test suite (server-only today)

## Known Limitations

- **Profile completion is intentionally NOT required to apply.** An earlier iteration of this product gated job applications behind a fully-completed candidate profile; this was explicitly reversed at product request — any newly registered candidate can apply immediately with just a resume. Profile fields remain fully available and encouraged, just never mandatory.
- **No TURN relay** for the Meeting Room — most direct peer connections will succeed via STUN alone, but connections behind symmetric/restrictive NATs may fail to establish video.
- **No client-side automated tests** — the server has a full `node:test` suite (82 tests); the client currently relies on typecheck/lint/manual verification only.
- **No CI/CD pipeline, Dockerfile, or docker-compose** — deployment today is manual (`npm run build && npm start`).
- **The admin (`/admin/*`) workspace is a separate, legacy single-tenant system**, predating the recruiter multi-tenant model, kept for generic/non-recruitment booking use cases (and its own fixed global calendar) rather than folded into the per-recruiter workspace.
- **No password-reset flow** for either the self-service or admin auth systems.
- **JWT sessions are not server-side revocable.** Logging out or changing your password clears the cookie client-side, but a copy of the old token (e.g. one already captured by an attacker) remains valid until its natural 7-day expiry either way. A real fix requires a session-versioning field checked on every request — a legitimate future hardening task, not implemented here.
- **Recruiters have no per-recruiter "blocked time" feature yet** — only the legacy admin workspace can block time, and that block is global (affects the one legacy calendar, not any recruiter's own calendar).
- **A narrow, low-probability crash-window exists in interview booking**: linking a newly-created interview back to its application round happens in two separate writes after the interview's own booking transaction has already committed, not inside one atomic operation. A crash in that exact window could leave an interview booked but not yet linked to its application. Documented as a known limitation rather than reworked, since a proper fix touches a transaction boundary several other code paths share.
- **AI provider free-tier daily limit.** The default OpenRouter model is capped at 50 requests/day without purchasing credits — see [OpenRouter Setup](#openrouter-setup) and [Troubleshooting](#troubleshooting).
- **The configured free-tier AI model occasionally emits literal Markdown** (e.g. `**bold**`) in a chat reply despite an explicit instruction not to — measurably reduced, not eliminated, by prompt tuning; a model-compliance limit, not a rendering bug in the client.
- **A `react-router-dom` security advisory** (`npm audit`, "RSC Mode CSRF Bypass") is currently unaddressed by design — this app is a client-only SPA that never uses React Router's RSC data-loading mode, so the advisory's actual attack surface doesn't apply here, and the only available automated fix is a downgrade that would introduce more risk than it removes.

## Contribution Guide

1. Read [CLAUDE.md](./CLAUDE.md) first — it is the binding engineering spec for this repo (design system, architecture rules, and the "current implementation reference" section documenting how the system actually works today).
2. Before changing anything, run both projects' `typecheck`, `lint`, and (server) `test` to confirm a clean baseline.
3. Reuse existing services/components/hooks wherever the functionality already exists — this codebase has a strong "no duplicate business logic" convention; a second implementation of an already-solved problem will be flagged in review.
4. Keep controllers thin — business logic belongs in `services/`.
5. Re-run `typecheck`/`lint`/`test`/`build` on both projects before considering a change complete.
6. Don't introduce a new dependency without checking it materially reduces complexity, is actively maintained, and can't be reasonably done without it.

## License

_No license file is currently present in this repository — add one (e.g. MIT, Apache-2.0, or a proprietary notice) before any public distribution or open-sourcing._

## Credits

Built with [React](https://react.dev/), [Vite](https://vite.dev/), [Tailwind CSS](https://tailwindcss.com/), [TanStack Query](https://tanstack.com/query), [Express](https://expressjs.com/), [Mongoose](https://mongoosejs.com/)/[MongoDB](https://www.mongodb.com/), [Socket.IO](https://socket.io/), and [OpenRouter](https://openrouter.ai/) for AI model access — see `client/package.json` and `server/package.json` for the complete, current dependency lists.
