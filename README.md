# The Ledger — Intelligent Time Canvas

AI-powered smart appointment booking system. The full engineering and design specification governing this project lives in [CLAUDE.md](./CLAUDE.md) — read it before making architectural or visual changes.

## Status

**Phase 1 — Foundation** complete: client/server scaffolding, design tokens, and the static app shell. No database, authentication, booking logic, availability logic, AI integration, real-time sync, or admin functionality exists yet — those are later phases (see CLAUDE.md §28).

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

The server's `CLIENT_ORIGIN` env var must match the client's dev URL for CORS to work.

## Verification

Each project has the same three checks:

```
npm run typecheck
npm run lint
npm run build
```

## Design system

The approved visual direction is "The Ledger — Intelligent Time Canvas" (CLAUDE.md §4–§10): a continuous time canvas is the primary interface, not a dashboard with a calendar widget bolted on. Design tokens (color, type scale, spacing, radius, shadow) live in `client/src/styles/tokens.css`.
