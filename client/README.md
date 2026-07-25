# Client — The Ledger (Intelligent Time Canvas)

React + TypeScript + Vite + Tailwind CSS v4 frontend. See the repository root [README.md](../README.md) for the full project overview and [CLAUDE.md](../CLAUDE.md) for the approved architecture and design specification.

## Commands

```
npm install
npm run dev         # start the Vite dev server
npm run typecheck   # tsc -b --noEmit
npm run lint        # oxlint
npm run build       # production build to dist/
npm run preview     # preview the production build locally
```

## Structure

```
src/
├── app/            # App root
├── components/     # Shared layout/UI primitives (no feature-specific logic)
├── features/
│   ├── calendar/   # Time Canvas
│   └── ai/         # AI command ribbon
└── styles/         # Design tokens and global styles
```

Feature folders (`hooks/`, `lib/`, `services/`, `types/`, `features/appointments`, `features/admin`) are added when a later phase gives them a real consumer — see CLAUDE.md §27.
