# The Ledger — Intelligent Time Canvas

AI-powered smart appointment booking system. The full engineering and design specification governing this project lives in [CLAUDE.md](./CLAUDE.md) — read it before making architectural or visual changes.

## Status

**Phases 1-6** complete: client/server scaffolding and design tokens, MongoDB models and validation, the timezone-aware availability engine, a transaction-safe booking engine (create/reschedule/cancel) with automated tests covering a real concurrent double-booking race, the Time Canvas wired to real data (Day/Week/Month, real appointments and blocked time, date navigation, a live current-time indicator), and real-time sync — booking mutations broadcast over Socket.IO so every connected client's calendar updates live, with a brief highlight pulse on the affected appointment, never a page refresh.

The calendar read endpoint (and the real-time events) are intentionally public-safe (time/status only, no name/email/purpose) since there's no authentication yet — Phase 9 adds an authenticated admin view with full appointment detail and history. No AI integration or admin functionality exists yet — those are later phases (see CLAUDE.md §28).

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

Each project has the same three checks:

```
npm run typecheck
npm run lint
npm run build
```

## Design system

The approved visual direction is "The Ledger — Intelligent Time Canvas" (CLAUDE.md §4–§10): a continuous time canvas is the primary interface, not a dashboard with a calendar widget bolted on. Design tokens (color, type scale, spacing, radius, shadow) live in `client/src/styles/tokens.css`.
