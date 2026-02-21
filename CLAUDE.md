# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is Roam

AI-powered cycling route generation. Users describe a ride through conversational chat, get 3 route options to compare on a map, then select one for detailed stats, elevation profile, and GPX export. Single Next.js app (TypeScript, App Router) — frontend and API routes in one process.

For full architecture, algorithms, API contracts, and technical decisions, see [docs/technical-overview.md](docs/technical-overview.md). For UI design tokens, layout rules, and component guidelines, see [docs/design-system.md](docs/design-system.md).

## Commands

| Task                   | Command                |
| ---------------------- | ---------------------- |
| Dev server (Turbopack) | `npm run dev`          |
| Production build       | `npm run build`        |
| Lint                   | `npm run lint`         |
| Format (write)         | `npm run format`       |
| Format (check only)    | `npm run format:check` |
| Run tests              | `npm test`             |
| Run tests (watch)      | `npm run test:watch`   |

For testing philosophy and conventions, see [docs/test-framework.md](docs/test-framework.md). Tests are co-located with source files (`*.test.ts`). Focus on pure logic in `lib/` — no component tests.

## Key Directories

- `app/` — Next.js App Router pages and API routes
- `app/api/chat/route.ts` — SSE streaming chat endpoint (single API endpoint)
- `lib/` — Pure TypeScript modules: LLM streaming, conversation orchestrator, state reducer, routing, geocoding, GPX, geo math, shared types
- `lib/use-chat.ts` — Custom React hook for SSE connection + state dispatch
- `components/` — React components (chat panel, route cards, map, elevation profile)
- `docs/` — Technical overview, design system, and product vision
- `project-overview/` — PRD and tech plan for v0

## External Services

| Service            | Env var                        |
| ------------------ | ------------------------------ |
| Claude (Anthropic) | `ANTHROPIC_API_KEY`            |
| GraphHopper        | `GRAPHHOPPER_API_KEY`          |
| MapTiler           | `NEXT_PUBLIC_MAPTILER_API_KEY` |
| Nominatim (OSM)    | None (free, 1 req/sec limit)   |

## Code Style

- TypeScript strict mode
- Single quotes, semicolons, 2-space indent, 100 char line width, ES5 trailing commas
- Tailwind CSS v4 (classes auto-sorted by prettier-plugin-tailwindcss)
- Path alias: `@/*` maps to repo root

## Documentation Maintenance

After completing changes to the app, evaluate whether project documentation needs updating. The `/update-docs` skill handles this — it scans the codebase and updates all relevant docs:

- [docs/technical-overview.md](docs/technical-overview.md) — architecture, algorithms, API contracts, external services
- [docs/design-system.md](docs/design-system.md) — UI tokens, layout rules, component guidelines
- [docs/test-framework.md](docs/test-framework.md) — testing philosophy and conventions
- [CLAUDE.md](CLAUDE.md) — commands, directories, env vars, code style
- `.claude/skills/*/SKILL.md` — skill definitions

Only document what exists in the code. Don't add speculative features.
