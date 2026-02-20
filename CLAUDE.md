# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is Roam

AI-powered cycling route generation. Users describe a ride in natural language, get a rideable cycling route on a map with elevation profile and GPX export. Single Next.js app (TypeScript, App Router) — frontend and API routes in one process.

For full architecture, algorithms, API contracts, and technical decisions, see [docs/technical-overview.md](docs/technical-overview.md).

## Commands

| Task | Command |
|------|---------|
| Dev server (Turbopack) | `npm run dev` |
| Production build | `npm run build` |
| Lint | `npm run lint` |
| Format (write) | `npm run format` |
| Format (check only) | `npm run format:check` |

No test framework is configured yet.

## Key Directories

- `app/` — Next.js App Router pages and API routes
- `app/api/generate-route/route.ts` — Single API endpoint, thin orchestrator
- `lib/` — Pure TypeScript modules (no framework dependency): LLM, routing, geocoding, GPX, geo math, shared types
- `components/` — React components
- `docs/` — Technical overview and product vision
- `project-overview/` — PRD and tech plan for v0

## External Services

| Service | Env var |
|---------|---------|
| Claude (Anthropic) | `ANTHROPIC_API_KEY` |
| GraphHopper | `GRAPHHOPPER_API_KEY` |
| MapTiler | `NEXT_PUBLIC_MAPTILER_API_KEY` |
| Nominatim (OSM) | None (free, 1 req/sec limit) |

## Code Style

- TypeScript strict mode
- Single quotes, semicolons, 2-space indent, 100 char line width, ES5 trailing commas
- Tailwind CSS v4 (classes auto-sorted by prettier-plugin-tailwindcss)
- Path alias: `@/*` maps to repo root

## Documentation Maintenance

After completing changes to the app, evaluate whether [docs/technical-overview.md](docs/technical-overview.md) needs updating. If architecture, API contracts, components, algorithms, or external service usage changed, update that document to reflect what was built, refactored, or removed.
