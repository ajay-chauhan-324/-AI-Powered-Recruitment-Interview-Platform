# The Ledger — Intelligent Time Canvas

AI-powered smart appointment booking system. The full engineering and design specification governing this project lives in [CLAUDE.md](./CLAUDE.md) — read it before making architectural or visual changes.

## Status

**Phases 1-6 and 8-9** complete: client/server scaffolding and design tokens, MongoDB models and validation, the timezone-aware availability engine, a transaction-safe booking engine (create/reschedule/cancel) with automated tests covering a real concurrent double-booking race, the Time Canvas wired to real data with real-time sync over Socket.IO, a working public guest booking experience (manage link at `/manage/:token`, no login), and an authenticated admin workspace (`/admin`) — full appointment detail and history, create/reschedule/resize/cancel, and working-hours/breaks/blocked-time configuration (`/admin/schedule`).

**Phase 7 (AI conversation layer) is on hold**, blocked on an Anthropic API key (not something this assistant can generate) — see `server/.env.example`'s `ANTHROPIC_API_KEY`. Until it's provided, the public booking path (direct calendar interaction) stands in for the AI-driven entry point CLAUDE.md's flow describes; both are meant to converge on the same `AppointmentService`, so adding the AI layer later won't change this work.

The public calendar read endpoint and real-time events stay public-safe (time/status only, no name/email/purpose) — only the authenticated `/admin/appointments` route returns full detail. Notifications (actual email delivery of the confirmation/manage link) are the next phase — for now the manage link is returned directly in the booking API response (see CLAUDE.md §28).

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

- `react-router-dom`/`react-router` are pinned to `7.11.0` — versions `7.12.0` through `8.2.0` have a disclosed high-severity CSRF advisory (GHSA-qwww-vcr4-c8h2) with no patched release yet at time of writing. Check before upgrading past this pin.
- Production deployment needs a server/reverse-proxy rewrite so deep links like `/manage/:token` serve `index.html` (Vite's dev server already does this automatically) — not yet configured, tracked for Phase 14.

## Design system

The approved visual direction is "The Ledger — Intelligent Time Canvas" (CLAUDE.md §4–§10): a continuous time canvas is the primary interface, not a dashboard with a calendar widget bolted on. Design tokens (color, type scale, spacing, radius, shadow) live in `client/src/styles/tokens.css`.
