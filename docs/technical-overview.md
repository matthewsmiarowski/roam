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
│  │  POST /api/route/segment (segment re-routing)    │    │
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
│       ├── chat/
│       │   └── route.ts         # POST handler — SSE streaming chat endpoint
│       └── route/
│           └── segment/
│               └── route.ts     # POST handler — single-segment re-routing for editing
├── components/                  # React components (chat UI, map, route cards, etc.)
├── lib/                         # Pure TypeScript modules (no framework dependency)
│   ├── llm.ts                   # Claude API — conversational streaming with tool_choice: auto
│   ├── conversation.ts          # Orchestrator — ties LLM, geocoding, and parallel route generation
│   ├── conversation-state.ts    # Reducer + actions for conversation state (pure logic)
│   ├── use-chat.ts              # Custom React hook — SSE connection + state dispatch
│   ├── routing.ts               # GraphHopper integration + loop generation + segment stitching
│   ├── geocoding.ts             # Nominatim geocoding
│   ├── gpx.ts                   # GPX XML generation
│   ├── geo.ts                   # Haversine, point projection, etc.
│   └── types.ts                 # Shared types (messages, route options, state, actions)
├── docs/                        # Project documentation
├── v2-plan/                     # v2 (interactive editing) PRD
├── project-overview/            # Product planning docs (PRD, tech plan)
└── public/                      # Static assets
```

All backend logic lives in `lib/` as pure TypeScript modules with no framework dependency (except `use-chat.ts` which is a React hook). The API routes in `app/api/` are thin orchestrators that call into these modules. This keeps the logic testable and portable.

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
     c. Generate 3 routes in parallel (segment-based stitching, ~4 GraphHopper calls each)
     d. Stream route options back to client

Browser → POST /api/route/segment (JSON)
  For editing operations (drag/add/remove waypoint):
  1. Client sends from/to coordinates for one segment
  2. Server routes via GraphHopper and returns geometry + stats
  3. Client stitches updated segments locally and dispatches state update
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

### Segment Re-routing Endpoint

**Endpoint:** `POST /api/route/segment`

Used by the client during visual editing to re-route individual segments. No LLM involvement — direct pass-through to GraphHopper.

**Request:**

```json
{
  "from": { "lat": 41.98, "lng": 2.82 },
  "to": { "lat": 42.01, "lng": 2.85 }
}
```

**Response:**

```json
{
  "geometry": [[41.98, 2.82, 150], ...],
  "distance_km": 4.2,
  "distance_mi": 2.6,
  "elevation_gain_m": 85,
  "elevation_gain_ft": 279
}
```

Error responses: 400 for invalid input, 500 for GraphHopper failures.

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
3. Merge named and bearing-based waypoints: named waypoints take priority, remaining slots filled by bearing waypoints (capped at 3 total)
4. Calculate waypoint radius: `radius_km = target_distance_km / (2π × stretch_factor)` where `stretch_factor ≈ 1.3` accounts for roads not being straight lines
5. Place bearing-based waypoints: project points at `radius_km` distance from start along each bearing
6. Route via **segment-based stitching**: each consecutive waypoint pair gets an independent GraphHopper call (`start → wp1`, `wp1 → wp2`, `wp2 → wp3`, `wp3 → start`), all run in parallel. This produces N+1 independent `RouteSegment` objects for N intermediate waypoints.
7. Stitch segments: concatenate geometries (deduplicating boundary points), sum distances and elevation gains
8. Return the stitched geometry, elevation data, stats, **and the individual segments and waypoints** for editing

Each variant gets ~4 GraphHopper calls (one per segment). Failed variants are excluded — at least 1 successful route is required or an error is thrown. Budget: ~40 conversations/day on the GraphHopper free tier (12 calls per generation × 500/day limit).

The full retry loop (distance validation, up to 3 iterations) is still available via the `generateRoute` function for future single-route use cases.

### Multi-leg stitching architecture

Routes are stored as independent segments rather than a single monolithic geometry. This enables **localized editing**: when a user drags one waypoint, only the 1-2 adjacent segments re-route. All other segments stay byte-identical.

```
Route structure:
  waypoints: [start, wp1, wp2, wp3, start]
  segments:  [seg0,  seg1, seg2, seg3]
             start→wp1, wp1→wp2, wp2→wp3, wp3→start
```

Key functions in `lib/routing.ts`:
- **`callGraphHopperSegment(from, to)`** — point-to-point routing between 2 points (no loop closure)
- **`routeViaSegments(waypoints)`** — parallel segment routing for an ordered waypoint list
- **`stitchSegments(segments)`** — concatenates segment geometries, sums stats, deduplicates boundary points

### Visual editing (v2)

After selecting a route, users can visually edit it by manipulating waypoints on the map:

- **Drag a waypoint** — re-routes only the 2 adjacent segments (2 API calls)
- **Click the route line** — inserts a new waypoint, splitting one segment into two (2 API calls)
- **Click the map** — appends a waypoint before the return-to-start segment (2 API calls)
- **Delete a waypoint** — merges two adjacent segments into one (1 API call)

Each edit calls `POST /api/route/segment` for the affected segments in parallel. The client splices results into the segment array, recomputes the stitched geometry, and updates stats. Unaffected segments are completely untouched.

Constraints: maximum 8 intermediate waypoints, minimum 1 (prevents degenerate out-and-back). Start/end point is not draggable — changing the start requires generating a new route through conversation.

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
  editing: EditingState | null;  // non-null when in detail phase with editable route
}

interface EditingState {
  waypoints: RouteWaypoint[];
  segments: RouteSegment[];
  geometry: Coordinate3D[];      // pre-computed stitched geometry
  isRerouting: boolean;
  selectedWaypointIndex: number | null;
}
```

Phase transitions:

```
chatting → [send message] → generating
generating → [AI asks question] → chatting
generating → [routes ready] → options
options → [select route] → detail (+ populate editing state from route segments)
options → [send message] → generating
detail → [drag/add/remove waypoint] → rerouting → detail (editing state updated)
detail → [back] → options (editing cleared)
detail → [send message] → generating (editing cleared)
```

The reducer (`lib/conversation-state.ts`) is pure logic with no React dependency — fully testable. The custom hook (`lib/use-chat.ts`) manages the SSE connection, dispatches actions, and handles the async re-routing workflow for editing (API calls, segment splicing, error recovery).

Editing actions in the reducer: `UPDATE_WAYPOINT`, `ADD_WAYPOINT`, `REMOVE_WAYPOINT`, `SELECT_WAYPOINT`, `START_REROUTING`, `FINISH_REROUTING`, `REROUTING_ERROR`. The `FINISH_REROUTING` action also updates the selected `RouteOption` in `routeOptions` with new geometry, stats, and regenerated GPX — so going back to options preserves edits.

No client-side routing. Single page, single flow.

### Components

- **ChatPanel** — left-side container (400px): message list, route cards, typing indicator, route detail, input bar
- **ChatMessage** — single message bubble (user right-aligned, assistant left-aligned). Can embed route cards.
- **ChatInput** — auto-resizing textarea + send button, pinned to bottom of chat panel
- **TypingIndicator** — three-dot pulse animation shown while waiting for AI response
- **RouteCardGroup** — container for 3 route option cards within a chat message
- **RouteCard** — compact card: color swatch, name, distance, elevation, time estimate, difficulty badge. Hover highlights route on map.
- **RouteDetail** — full stats, GPX download, "back to options" link. Shown inline in chat when a route is selected. In editing mode, shows editing controls: helper text, rerouting indicator, and delete waypoint button.
- **RouteMap** — MapLibre GL map supporting multi-route rendering with distinct colors and hover-highlight. In editing mode, renders per-segment route lines and draggable `WaypointMarker` components. Handles click-on-route-line to add waypoints via `queryRenderedFeatures` on segment layers.
- **WaypointMarker** — draggable marker for route waypoints. Start markers are green and non-draggable; via markers are numbered, colored to match the route, and draggable. Click to select, click again to deselect. Selected markers show a ring highlight.
- **ElevationProfile** — Recharts area chart (elevation vs distance). Docked to bottom of map area when a route is selected. Uses editing geometry when edits are active.
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
| Segment re-route fails  | Route preserved at previous state            | Waypoint reverts (drag) or edit discarded (add/remove)     |

---

## Known Limitations

- No caching — every conversation turn generates fresh routes
- No rate limiting on the API route
- No route persistence or database
- No user accounts or authentication
- Loop quality is heuristic — can feel geometric rather than organic
- Elevation targeting is indirect — relies on LLM geographic knowledge
- GraphHopper free tier: 500 req/day (~40 conversations at ~12 calls each due to segment-based stitching, plus ~2 calls per visual edit)
- Vercel Hobby plan: 10-second function timeout (may need Pro for deployment)
- Desktop-only layout — chat panel is fixed 400px, no responsive breakpoints yet
