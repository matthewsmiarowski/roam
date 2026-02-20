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
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Prompt   │  │  MapLibre GL │  │    Elevation       │  │
│  │  Input    │  │  Map         │  │    Profile Chart   │  │
│  └──────────┘  └──────────────┘  └───────────────────┘  │
│  ┌──────────┐  ┌──────────────┐                         │
│  │  Route   │  │  GPX         │                         │
│  │  Stats   │  │  Download    │                         │
│  └──────────┘  └──────────────┘                         │
│                                                         │
│  API Routes                                             │
│  ┌─────────────────────────────────────────────────┐    │
│  │  POST /api/generate-route                        │    │
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
│   ├── page.tsx                 # Main page — the entire UI
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Tailwind import
│   └── api/
│       └── generate-route/
│           └── route.ts         # POST handler — orchestrates LLM + routing
├── components/                  # React components
├── lib/                         # Pure TypeScript modules (no framework dependency)
│   ├── llm.ts                   # Claude API integration
│   ├── routing.ts               # GraphHopper integration + loop generation
│   ├── geocoding.ts             # Nominatim geocoding
│   ├── gpx.ts                   # GPX XML generation
│   ├── geo.ts                   # Haversine, point projection, etc.
│   └── types.ts                 # Shared types (request, response, route data)
├── docs/                        # Project documentation
├── project-overview/            # Product planning docs (PRD, tech plan)
└── public/                      # Static assets
```

All backend logic lives in `lib/` as pure TypeScript modules with no framework dependency. The API route in `app/api/generate-route/route.ts` is a thin orchestrator that calls into these modules. This keeps the logic testable and portable.

---

## Request Flow

When a user submits a prompt, the following happens:

```
Browser → POST /api/generate-route
  1. Claude API (tool use) → structured route params + waypoint bearings
  2. Nominatim geocoding → lat/lng from location string
  3. Loop generation: compass bearings + radius → waypoints
  4. GraphHopper Directions API → route geometry + elevation
  5. Distance validation, retry up to 3x if outside ±20%
  6. Return GeoJSON geometry + GPX string + stats
```

### API Contract

**Endpoint:** `POST /api/generate-route`

**Request:**
```json
{
  "prompt": "A 60km hilly loop from central Girona on quiet roads",
  "user_location": {
    "latitude": 41.9794,
    "longitude": 2.8214
  }
}
```

**Response:**
```json
{
  "route": {
    "geometry": [[lat, lng, elevation], ...],
    "distance_km": 62.3,
    "distance_mi": 38.7,
    "elevation_gain_m": 890,
    "elevation_gain_ft": 2920,
    "start_point": { "lat": 41.9794, "lng": 2.8214 }
  },
  "gpx": "<gpx>...</gpx>",
  "metadata": {
    "parsed_params": {
      "start_location": "Central Girona, Spain",
      "target_distance_km": 60,
      "elevation_character": "hilly",
      "road_preference": "quiet_roads"
    },
    "llm_reasoning": "Routing north and west from Girona toward the Gavarres hills..."
  }
}
```

Errors return `{ status: "error", message: string }`.

---

## External Services

| Service | Purpose | Env var | Notes |
|---------|---------|---------|-------|
| Claude (claude-sonnet-4-6) | NL → structured params via tool use | `ANTHROPIC_API_KEY` | Server-side only. ~$0.01-0.03 per route. |
| GraphHopper Directions API | Cycling route computation + elevation | `GRAPHHOPPER_API_KEY` | Server-side only. 500 req/day free tier. Cycling profile, returns 3D coordinates. |
| MapTiler | Vector map tiles for MapLibre GL | `NEXT_PUBLIC_MAPTILER_API_KEY` | Client-side. 100k tile requests/month free tier. |
| Nominatim (OpenStreetMap) | Geocoding (location string → lat/lng) | None | Free, rate-limited to 1 req/sec. |

---

## Core Algorithm: Loop Generation

This is the hardest problem in the system. Most routing engines only do A-to-B. We synthesize loops using compass bearings from the LLM.

### How the LLM is used

The LLM does two jobs in a single tool-use call:

1. **Parameter extraction** — parse the prompt into structured data (start location, target distance, elevation character, road preference)
2. **Geographic reasoning** — suggest compass bearings for waypoint placement based on terrain knowledge of the area (e.g., knowing hills are north of Girona, not east toward the coast)

The key insight: we ask for **directions** (compass bearings), not coordinates. The LLM can reason about direction from geographic knowledge. It would hallucinate exact coordinates.

### The algorithm

1. Geocode `start_location` → `(lat, lng)`
2. Calculate waypoint radius: `radius_km = target_distance_km / (2π × stretch_factor)` where `stretch_factor ≈ 1.3` accounts for roads not being straight lines
3. Place waypoints: for each bearing in `waypoint_bearings`, project a point at `radius_km` distance from start along that bearing
4. Route through waypoints via GraphHopper: `start → wp1 → wp2 → ... → wpN → start` using the cycling profile
5. Validate total distance: if within ±20% of target, accept. Otherwise adjust radius proportionally and retry (max 3 iterations)
6. Return the final route geometry, elevation data, and stats

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

No state library. Page-level `useState`/`useReducer` with a discriminated union:

```typescript
type AppState =
  | { status: 'idle' }
  | { status: 'loading'; prompt: string }
  | { status: 'success'; route: RouteData }
  | { status: 'error'; message: string };
```

No client-side routing. Single page, single flow.

### Components

- **PromptInput** — text input + submit button
- **LoadingState** — shown during route generation
- **RouteMap** — MapLibre GL map with route polyline and start marker (via react-map-gl)
- **ElevationProfile** — Recharts area chart (elevation vs distance)
- **RouteStats** — distance and elevation gain display
- **GpxDownload** — triggers browser download via `URL.createObjectURL`
- **ErrorDisplay** — shown on failure

### Geolocation fallback

When no start location is in the prompt, the frontend requests browser geolocation. If denied, the user is asked to include a location in their prompt.

### GPX export

GPX XML is returned inline in the API response. The frontend creates a Blob and triggers download. No separate endpoint, no server-side storage.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js (TypeScript, App Router) | Fullstack in one project. Turbopack for fast dev. |
| Map | MapLibre GL JS + react-map-gl | Open-source vector tiles (BSD). Smooth zoom, custom styling. |
| Map tiles | MapTiler | Free tier, clean MapLibre integration. |
| Elevation chart | Recharts | Lightweight React charting. |
| LLM | Claude API (claude-sonnet-4-6) | Structured output via tool use. TypeScript SDK. |
| Routing engine | GraphHopper Directions API | Cycling profile, elevation data, 500 req/day free. |
| Geocoding | Nominatim (OpenStreetMap) | Free, sufficient for one call per route generation. |
| Styling | Tailwind CSS v4 | Utility-first, auto-sorted by prettier plugin. |
| Deployment | Vercel | Push-to-deploy for Next.js. |

---

## Error Handling

| Failure | User message | Server behavior |
|---------|-------------|-----------------|
| LLM can't parse prompt | "I couldn't understand that request..." | Log raw prompt and LLM response |
| Geocoding fails | "I couldn't find that location..." | Log the location string |
| No route found | "Couldn't generate a route in that area..." | Log waypoints and engine response |
| Routing engine timeout | "Route generation timed out..." | 30-second timeout on GraphHopper calls |
| Distance can't converge | Return best attempt with a note | "Route is Xkm — couldn't exactly match your target of Ykm" |
| API rate limit | "Service is temporarily busy..." | Log for monitoring |

---

## Known Limitations (v0)

- No caching — every identical prompt generates a new route
- No rate limiting on the API route
- No route persistence or database
- No user accounts or authentication
- Loop quality is heuristic — can feel geometric rather than organic
- Elevation targeting is indirect — relies on LLM geographic knowledge
- GraphHopper free tier: 500 routes/day
- Vercel Hobby plan: 10-second function timeout (may need Pro for deployment)
