# Technical Overview

**Last Updated: February 2026**

This document describes the architecture, technical decisions, and implementation details of Roam. A new engineer should be able to read this and understand how everything works.

For product vision and long-term roadmap, see [AI_Cycling_Route_App_Project_Overview.md](./AI_Cycling_Route_App_Project_Overview.md). For v0 product requirements, see [../project-overview/v0-plan/PRD.md](../project-overview/v0-plan/PRD.md). For UI design tokens, color system, typography, layout, and component guidelines, see [design-system.md](./design-system.md).

---

## Architecture

Roam is a single Next.js application (App Router, TypeScript) that serves both the React frontend and API route handlers. No separate backend process. One `npm run dev` to run locally, one push to Vercel to deploy.

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js App                         │
│                                                         │
│  Frontend (React)                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Chat Panel   │  │  MapLibre GL │  │  Elevation    │  │
│  │  (messages,   │  │  Map (multi- │  │  Profile      │  │
│  │   route cards,│  │  route w/    │  │  Chart        │  │
│  │   input)      │  │  hover)      │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  API Routes                                             │
│  ┌─────────────────────────────────────────────────┐    │
│  │  POST /api/chat (SSE streaming)                  │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │
               ┌──────────┴──────────┐
               ▼                     ▼
      ┌────────────────┐    ┌────────────────┐
      │   Claude API   │    │  GraphHopper   │
      │   (Sonnet)     │    │  Directions    │
      └────────────────┘    └────────────────┘
```

### Why a single Next.js app?

- Shared TypeScript types between API and frontend — no type drift
- One process for local dev (`next dev`)
- Push-to-deploy on Vercel
- The backend logic is just HTTP calls to external APIs + lightweight math — no need for Python or a separate server

---

## Directory Structure

```
roam/
├── app/
│   ├── page.tsx                 # Main page — chat panel + map layout
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Tailwind + design system tokens (CSS custom properties)
│   └── api/
│       └── chat/
│           └── route.ts         # POST handler — SSE streaming chat endpoint
├── components/                  # React components (chat UI, map, route cards, etc.)
├── lib/                         # Pure TypeScript modules (no framework dependency)
│   ├── llm.ts                   # Claude API — conversational streaming with tool_choice: auto
│   ├── conversation.ts          # Orchestrator — ties LLM, geocoding, and parallel route generation
│   ├── conversation-state.ts    # Reducer + actions for conversation state (pure logic)
│   ├── use-chat.ts              # Custom React hook — SSE connection + state dispatch
│   ├── routing.ts               # GraphHopper integration + loop generation
│   ├── geocoding.ts             # Nominatim geocoding
│   ├── gpx.ts                   # GPX XML generation
│   ├── geo.ts                   # Haversine, point projection, etc.
│   └── types.ts                 # Shared types (messages, route options, state, actions)
├── docs/                        # Project documentation
├── project-overview/            # Product planning docs (PRD, tech plan)
└── public/                      # Static assets
```

All backend logic lives in `lib/` as pure TypeScript modules with no framework dependency (except `use-chat.ts` which is a React hook). The API route in `app/api/chat/route.ts` is a thin orchestrator that calls into these modules. This keeps the logic testable and portable.

---

## Request Flow

The app uses a conversational model. The user sends messages, and the LLM decides whether to ask clarifying questions (text response) or generate routes (tool call). The frontend sends the full conversation history with each request; the server is stateless.

```
Browser → POST /api/chat (SSE streaming)
  For each conversation turn:
  1. Claude API (streaming, tool_choice: auto) → text deltas OR tool call
  2. If text: stream text chunks back to client
  3. If tool call (generate_routes):
     a. Resolve start coordinates (explicit coords → GPS → geocoding)
     b. Geocode named waypoints across all 3 variants
     c. Generate 3 routes in parallel (single GraphHopper call each)
     d. Stream route options back to client
```

### API Contract

**Endpoint:** `POST /api/chat`

**Request:**

```json
{
  "messages": [{ "role": "user", "content": "60km hilly loop from Girona" }],
  "user_location": { "latitude": 41.9794, "longitude": 2.8214 },
  "start_coordinates": { "lat": 41.9794, "lng": 2.8214 }
}
```

**Response:** Server-Sent Events stream:

```
event: text
data: {"chunk": "Great choice! Girona has amazing cycling..."}

event: generating
data: {"message": "Generating route options..."}

event: routes
data: {"options": [
  {
    "id": "uuid",
    "name": "Northern Hills Loop",
    "description": "Climbs toward the Gavarres hills...",
    "route": { "geometry": [...], "distance_km": 62.3, ... },
    "gpx": "<gpx>...</gpx>",
    "color": "#E8503A"
  },
  ...
]}

event: done
data: {}
```

Error events: `event: error` with `{"message": "..."}`.
Non-streaming errors return `{ status: "error", message: string }` with HTTP 400.

---

## External Services

| Service                    | Purpose                                         | Env var                        | Notes                                                                             |
| -------------------------- | ----------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| Claude (claude-sonnet-4-6) | Conversational routing via streaming + tool use | `ANTHROPIC_API_KEY`            | Server-side only. ~$0.01-0.03 per conversation turn.                              |
| GraphHopper Directions API | Cycling route computation + elevation           | `GRAPHHOPPER_API_KEY`          | Server-side only. 500 req/day free tier. Cycling profile, returns 3D coordinates. |
| MapTiler                   | Vector map tiles for MapLibre GL                | `NEXT_PUBLIC_MAPTILER_API_KEY` | Client-side. 100k tile requests/month free tier.                                  |
| Nominatim (OpenStreetMap)  | Geocoding (location string → lat/lng)           | None                           | Free, rate-limited to 1 req/sec.                                                  |

---

## Core Algorithm: Loop Generation

This is the hardest problem in the system. Most routing engines only do A-to-B. We synthesize loops using compass bearings from the LLM.

### How the LLM is used

Claude operates in conversational mode (`tool_choice: auto`), deciding per turn whether to ask clarifying questions (text response) or generate routes (tool call). The system prompt instructs it to act like a knowledgeable cycling friend and generate immediately when enough info exists (at minimum: a location).

When Claude calls the `generate_routes` tool, it outputs:

1. **Ride parameters** — start location, target distance, elevation character, road preference
2. **3 route variants** — each with a name, description, and 3 compass bearings for waypoint placement based on terrain knowledge. Variants are meaningfully different (vary direction, difficulty, local knowledge).
3. **Named waypoints** (optional) — when the user mentions specific places or climbs, Claude includes geocodable location strings that the routing system uses.
4. **Start precision classification** — `"exact" | "general"` to indicate whether the start is a specific address or a general area.

The key insight: we ask for **directions** (compass bearings), not coordinates. The LLM can reason about direction from geographic knowledge. It would hallucinate exact coordinates.

When `start_precision` is "general", the LLM produces simple, geocoder-friendly location strings ("City, Country" format). When "exact", it preserves the user's specific address or landmark verbatim for accurate geocoding. The Anthropic SDK is configured with `maxRetries: 5` to handle transient 529 overloaded errors.

Conversation history (capped at 20 messages) is sent with each request. Route results in history are summarized as text (names + stats, not full geometry) to keep tokens reasonable.

### Start coordinate resolution

The API route resolves the start point using a three-tier priority:

1. **Explicit coordinates** (`start_coordinates` in request body) — used directly, skips geocoding. Intended for map-click start pickers.
2. **GPS + self-reference** — when `start_precision` is "exact" and `user_location` GPS is available (user said "from here"), GPS coordinates are used directly.
3. **Geocoding fallback** — the `start_location` string is geocoded via Nominatim. When precision is "exact", the LLM passes the address verbatim for better accuracy; when "general", it simplifies the name.

### The algorithm

For each of the 3 route variants (generated in parallel):

1. Resolve start coordinates via the priority above → `(lat, lng)` (shared across all variants)
2. Geocode named waypoints (if any) across all variants — deduplicated to avoid redundant geocoding calls
3. Merge named and bearing-based waypoints: named waypoints take priority, remaining slots filled by bearing waypoints (capped at 3 total to stay within GraphHopper free tier's 5-point limit: start + 3 waypoints + start)
4. Calculate waypoint radius: `radius_km = target_distance_km / (2π × stretch_factor)` where `stretch_factor ≈ 1.3` accounts for roads not being straight lines
5. Place bearing-based waypoints: project points at `radius_km` distance from start along each bearing
6. Route through waypoints via GraphHopper: `start → wp1 → wp2 → wp3 → start` using the cycling profile
7. Return the route geometry, elevation data, and stats

Each variant gets a single GraphHopper call (no retry loop in comparison mode). Failed variants are excluded — at least 1 successful route is required or an error is thrown. This conserves the GraphHopper free tier budget (~160 conversations/day at 3 calls each).

The full retry loop (distance validation, up to 3 iterations) is still available via the `generateRoute` function for future single-route use cases.

### Geocoding

Nominatim geocoding includes a progressive fallback: if the full location string fails (e.g., "Historic District, Girona, Spain"), it tries progressively simpler versions by stripping leading comma-separated parts ("Girona, Spain", then "Spain"). This handles cases where the LLM generates overly specific location names.

### Elevation character

Primary mechanism: the LLM's bearing suggestions route through hilly vs flat terrain. Secondary: GraphHopper's elevation weighting parameter.

### GraphHopper configuration

```json
{
  "points": [[lng1, lat1], [lng2, lat2], ...],
  "profile": "bike",
  "points_encoded": false,
  "elevation": true,
  "instructions": false,
  "calc_points": true
}
```

The `bike` profile avoids highways, prefers cycling infrastructure, and penalizes high-traffic roads using OSM road classification.

---

## Frontend

### State management

No state library. A `useReducer` with a conversation state machine manages the entire UI:

```typescript
interface ConversationState {
  phase: 'chatting' | 'generating' | 'options' | 'detail';
  messages: Message[];
  streamingText: string | null;
  routeOptions: RouteOption[] | null;
  selectedRouteIndex: number | null;
  userLocation: { latitude: number; longitude: number } | null;
  startPoint: { lat: number; lng: number } | null;
}
```

Phase transitions:

```
chatting → [send message] → generating
generating → [AI asks question] → chatting
generating → [routes ready] → options
options → [select route] → detail
options → [send message] → generating
detail → [back] → options
detail → [send message] → generating
```

The reducer (`lib/conversation-state.ts`) is pure logic with no React dependency — fully testable. The custom hook (`lib/use-chat.ts`) manages the SSE connection and dispatches actions.

No client-side routing. Single page, single flow.

### Components

- **ChatPanel** — left-side container (400px): message list, route cards, typing indicator, route detail, input bar
- **ChatMessage** — single message bubble (user right-aligned, assistant left-aligned). Can embed route cards.
- **ChatInput** — auto-resizing textarea + send button, pinned to bottom of chat panel
- **TypingIndicator** — three-dot pulse animation shown while waiting for AI response
- **RouteCardGroup** — container for 3 route option cards within a chat message
- **RouteCard** — compact card: color swatch, name, distance, elevation, time estimate, difficulty badge. Hover highlights route on map.
- **RouteDetail** — full stats, GPX download, "back to options" link. Shown inline in chat when a route is selected.
- **RouteMap** — MapLibre GL map supporting multi-route rendering with distinct colors and hover-highlight. Also handles map-click start point.
- **ElevationProfile** — Recharts area chart (elevation vs distance). Docked to bottom of map area when a route is selected.
- **RouteStats** — distance and elevation gain display (used inside RouteDetail)
- **GpxDownload** — triggers browser download via `URL.createObjectURL`. Supports custom filename per route.

### Geolocation

The `useChat` hook requests browser geolocation once on mount. If denied, the user can still provide a location in their message or click the map.

### GPX export

GPX XML is returned inline with each route option. The frontend creates a Blob and triggers download with a route-name-based filename (e.g., `roam-northern-hills.gpx`). No separate endpoint, no server-side storage.

---

## Tech Stack

| Layer           | Choice                           | Rationale                                                    |
| --------------- | -------------------------------- | ------------------------------------------------------------ |
| Framework       | Next.js (TypeScript, App Router) | Fullstack in one project. Turbopack for fast dev.            |
| Map             | MapLibre GL JS + react-map-gl    | Open-source vector tiles (BSD). Smooth zoom, custom styling. |
| Map tiles       | MapTiler                         | Free tier, clean MapLibre integration.                       |
| Elevation chart | Recharts                         | Lightweight React charting.                                  |
| LLM             | Claude API (claude-sonnet-4-6)   | Structured output via tool use. TypeScript SDK.              |
| Routing engine  | GraphHopper Directions API       | Cycling profile, elevation data, 500 req/day free.           |
| Geocoding       | Nominatim (OpenStreetMap)        | Free, sufficient for one call per route generation.          |
| Icons           | Lucide React                     | Open source, tree-shakable, consistent stroke style.         |
| Styling         | Tailwind CSS v4                  | Utility-first, auto-sorted by prettier plugin.               |
| Deployment      | Vercel                           | Push-to-deploy for Next.js.                                  |

---

## Error Handling

| Failure                 | User message                                | Server behavior                                            |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| LLM can't parse prompt  | "I couldn't understand that request..."     | Log raw prompt and LLM response                            |
| Geocoding fails         | "I couldn't find that location..."          | Log the location string; tries simplified variants first   |
| No route found          | "Couldn't generate a route in that area..." | Log waypoints and engine response                          |
| Routing engine timeout  | "Route generation timed out..."             | 30-second timeout on GraphHopper calls                     |
| Distance can't converge | Return best attempt with a note             | "Route is Xkm — couldn't exactly match your target of Ykm" |
| LLM overloaded (529)    | "The AI service is temporarily busy..."     | Anthropic SDK retries up to 5× with exponential backoff    |
| API rate limit (429)    | "Service is temporarily busy..."            | Log for monitoring                                         |

---

## Known Limitations

- No caching — every conversation turn generates fresh routes
- No rate limiting on the API route
- No route persistence or database
- No user accounts or authentication
- Loop quality is heuristic — can feel geometric rather than organic
- Elevation targeting is indirect — relies on LLM geographic knowledge
- GraphHopper free tier: 500 routes/day (~160 conversations at 3 routes each)
- Vercel Hobby plan: 10-second function timeout (may need Pro for deployment)
- Desktop-only layout — chat panel is fixed 400px, no responsive breakpoints yet
