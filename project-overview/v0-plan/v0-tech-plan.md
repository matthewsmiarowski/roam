# v0 — Technical Plan

**Last Updated: February 2026**
_Staff Engineering Plan — For Internal Use_

---

## Overview

This document describes how we will build v0 of Roam: a local web application that takes a natural-language ride description and returns a cycling route on a map with an elevation profile and GPX export.

The architecture is a single Next.js application — TypeScript from frontend to API routes. One language, one project, one `next dev` command to run locally. When we're ready to deploy, it's a push to Vercel. The backend logic orchestrates two external calls: one to Claude for language understanding and one to GraphHopper for route computation. Everything else is derived from those two calls.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js App                         │
│                                                         │
│  Pages (React + TypeScript)                             │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Prompt   │  │  MapLibre GL │  │    Elevation       │  │
│  │  Input    │  │  Map         │  │    Profile Chart   │  │
│  └──────────┘  └──────────────┘  └───────────────────┘  │
│                                                         │
│  ┌──────────┐  ┌──────────────┐                         │
│  │  Route   │  │  GPX         │                         │
│  │  Stats   │  │  Download    │                         │
│  └──────────┘  └──────────────┘                         │
│                                                         │
│  API Routes (TypeScript)                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  POST /api/generate-route                        │    │
│  │  1. Receive prompt                               │    │
│  │  2. Call Claude → structured params + waypoints   │    │
│  │  3. Geocode start location (Nominatim)           │    │
│  │  4. Generate loop waypoints                      │    │
│  │  5. Call GraphHopper → route geometry + elevation │    │
│  │  6. Validate distance, retry if needed           │    │
│  │  7. Return response (geometry, elevation, stats)  │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │
               ┌──────────┴──────────┐
               ▼                     ▼
      ┌────────────────┐    ┌────────────────┐
      │   Claude API   │    │  GraphHopper   │
      │   (Sonnet)     │    │  Directions    │
      │                │    │  API           │
      └────────────────┘    └────────────────┘
```

### Why Next.js Instead of a Separate Backend?

The original plan used a Python/FastAPI backend and a React/Vite frontend — two processes, two languages, two dependency systems. We reconsidered this against the full product trajectory:

- **We will deploy this as a web app.** Next.js on Vercel is a push-to-deploy story. A separate Python backend requires its own hosting (Railway, Fly.io, etc.), CORS configuration, and operational overhead.
- **The geo operations we need are simple.** The case for Python was library convenience (shapely, gpxpy, geopy). But our actual needs are: project a point along a bearing (basic trig), compute haversine distance (~10 lines), generate GPX XML (~30 lines), and make HTTP calls to Nominatim and GraphHopper. None of this requires Python-specific libraries.
- **Shared types eliminate bugs.** The route response shape, the request payload, the error format — all defined once in TypeScript, used by both the API route and the UI components. No Pydantic model that drifts from the frontend type definition.
- **One process for local dev.** `next dev` runs everything. No "start the backend in one terminal, the frontend in another."

The Anthropic SDK has a first-class TypeScript client. GraphHopper and Nominatim are HTTP APIs. There is no technical reason to introduce a second language.

---

## Tech Stack

| Layer           | Choice                                 | Rationale                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | Next.js (TypeScript)                   | Fullstack in one project. API routes for backend logic, React for UI. One `next dev` for local, one push for Vercel deployment.                                                                                                                                  |
| Map             | MapLibre GL JS + react-map-gl          | Open-source vector tile renderer (BSD license, fork of Mapbox GL v1). Smooth zoom, custom styling, path to 3D terrain. No vendor lock-in. react-map-gl (by Vis.gl) supports both MapLibre and Mapbox — we can switch renderers without touching component code.  |
| Map tiles       | MapTiler (free tier)                   | Vector tiles for MapLibre. Free tier provides 100k tile requests/month — more than enough for v0 and early deployment. Clean integration with MapLibre's style spec.                                                                                             |
| Elevation chart | Recharts                               | Lightweight React charting library. Simple area chart for the elevation profile — nothing more complex needed.                                                                                                                                                   |
| LLM             | Claude API (claude-sonnet-4-6)         | Sonnet for speed and cost. We need structured output, not deep reasoning. Tool use for clean parameter extraction. Anthropic TypeScript SDK.                                                                                                                     |
| Routing engine  | GraphHopper Directions API (free tier) | Cycling profile built in, returns elevation data with the route, native round-trip support, 500 req/day free tier. Used in production by Wahoo/ELEMNT. Clean REST API with straightforward migration path to self-hosted.                                        |
| Geocoding       | Nominatim (OpenStreetMap)              | Free, no API key, sufficient for resolving city names and landmarks to coordinates. One geocoding call per route generation — rate limits are irrelevant at our volume. Upgrade path: MapTiler Geocoding (same ecosystem as our tile source, adds autocomplete). |
| GPX generation  | TypeScript utility function            | GPX is simple XML — a `<trk>` with `<trkpt>` elements. ~30 lines of TypeScript to template coordinates into a valid GPX string. No library needed.                                                                                                               |

### Alternatives Considered: Routing Engine

The routing engine was the most carefully evaluated choice. Here's what we looked at:

| Engine                | Type                        | Cycling profiles                    | Loop generation                     | Elevation in response             | Integration effort                              |
| --------------------- | --------------------------- | ----------------------------------- | ----------------------------------- | --------------------------------- | ----------------------------------------------- |
| **GraphHopper**       | Hosted API + self-hostable  | Yes (bike, racing bike, MTB)        | Yes — native `round_trip` algorithm | Yes                               | Low — clean REST API                            |
| **BRouter**           | Self-host only (Java)       | Best in class — deeply customizable | No — A-to-B only                    | Yes                               | Medium — quirky API, Java dependency            |
| **Valhalla**          | Self-host or via Mapbox ($) | Good (bicycle profile)              | No — A-to-B only                    | Yes                               | Medium — requires Docker or Mapbox subscription |
| **OSRM**              | Self-host only              | Limited — car-centric               | No                                  | No — needs separate elevation API | Low API complexity, but limited cycling support |
| **Google Directions** | Hosted API                  | Basic cycling mode                  | No                                  | Yes                               | Low, but expensive ($5-10/1000 requests)        |

What production cycling apps use:

- **Wahoo/ELEMNT**: GraphHopper (production partnership)
- **Komoot**: Custom engine on OSM data
- **Strava**: Custom engine with heatmap data
- **RideWithGPS**: Custom engine on OSM data

The serious cycling platforms all run custom routing. That's the right long-term play but out of scope for v0. Among off-the-shelf options, GraphHopper wins because: (1) it's the only one with native round-trip support, (2) Wahoo validates the cycling profile at scale, and (3) the self-hosted migration is a base URL change.

**Fallback note:** If GraphHopper's cycling profile proves insufficient during tuning, BRouter is the alternative. Its profile customization is unmatched — granular control over road surface, elevation preference, traffic avoidance. But it requires self-hosting Java, which we want to avoid in v0.

### Alternatives Considered: Maps

| Library            | Rendering    | 3D terrain | Custom styling       | License           | Cost                               |
| ------------------ | ------------ | ---------- | -------------------- | ----------------- | ---------------------------------- |
| **MapLibre GL JS** | Vector tiles | Yes        | Built-in style spec  | BSD (open source) | Free (library), tile source varies |
| **Leaflet**        | Raster tiles | No         | Requires tile server | BSD               | Free                               |
| **Mapbox GL JS**   | Vector tiles | Yes        | Built-in             | Proprietary (v2+) | $0.60/1000 loads after free tier   |

For a cycling route app, the map is the product. Leaflet with raster tiles has choppy zoom transitions and limited styling — it looks and feels dated next to a vector tile map. MapLibre gives us the same rendering quality as Mapbox without the proprietary license or usage-based pricing. The marginal setup cost over Leaflet is an hour (add a MapTiler API key and style URL).

### Alternatives Considered: Geocoding

| Service                | Cost                   | Fuzzy matching | Autocomplete     | Rate limit |
| ---------------------- | ---------------------- | -------------- | ---------------- | ---------- |
| **Nominatim**          | Free                   | Adequate       | No               | 1 req/sec  |
| **MapTiler Geocoding** | Free tier (100k/month) | Good           | Yes              | Reasonable |
| **Google Geocoding**   | $5/1000 requests       | Best in class  | Yes (Places API) | High       |
| **OpenCage**           | Free tier (2500/day)   | Good           | No               | 1 req/sec  |

Nominatim is sufficient for v0 — we make one geocoding call per route generation, and the LLM helps by extracting specific location strings (e.g., "Richmond Park, London, UK" rather than just "Richmond"). When we deploy and want input autocomplete, MapTiler Geocoding is the natural upgrade — same ecosystem as our tile source.

---

## Key Technical Decisions

### 1. How the LLM Is Used

The LLM does **two jobs**, not one:

**Job 1: Parameter extraction.** Parse the natural-language prompt into structured data — start location, target distance, elevation character, road preferences. This is a straightforward structured output task using Claude's tool use.

**Job 2: Geographic reasoning for waypoint direction.** This is the less obvious use. When a user asks for a "hilly ride from Girona," the LLM knows that the hills are north and west (toward the Pyrenean foothills), not east (toward the coast). We ask Claude to suggest **directional bias for waypoint placement** — not exact coordinates, but compass bearings or named areas to route through.

This geographic knowledge is the core value the LLM adds beyond a simple form. A traditional UI would need a terrain database and pathfinding heuristics. The LLM has internalized enough geographic context to make reasonable directional suggestions for well-known cycling areas worldwide.

**Implementation: a single tool-use call.**

We define a tool schema that Claude fills in:

```json
{
  "name": "generate_route_parameters",
  "description": "Extract cycling route parameters from a natural language ride description.",
  "input_schema": {
    "type": "object",
    "properties": {
      "start_location": {
        "type": "string",
        "description": "The starting location as described by the user — a city, address, landmark, or area. As specific as possible for geocoding."
      },
      "target_distance_km": {
        "type": "number",
        "description": "Target ride distance in kilometers. Convert from miles if the user specified miles. Default to 50 if not specified."
      },
      "elevation_character": {
        "type": "string",
        "enum": ["flat", "rolling", "hilly", "mountainous"],
        "description": "The desired elevation character of the ride. Default to 'rolling' if not specified."
      },
      "road_preference": {
        "type": "string",
        "enum": ["quiet_roads", "bike_paths", "no_preference"],
        "description": "Road surface/type preference. Default to 'quiet_roads' if not specified."
      },
      "waypoint_bearings": {
        "type": "array",
        "items": { "type": "number" },
        "description": "Suggested compass bearings (0-360 degrees, 0=north) for waypoint placement, based on geographic knowledge of the area. For hilly rides, bias toward known hilly terrain. For flat rides, bias toward known flat terrain. Provide 4-6 bearings distributed to form a coherent loop."
      },
      "reasoning": {
        "type": "string",
        "description": "Brief explanation of why these waypoint directions were chosen, based on knowledge of the area's geography."
      }
    },
    "required": [
      "start_location",
      "target_distance_km",
      "elevation_character",
      "road_preference",
      "waypoint_bearings"
    ]
  }
}
```

The `waypoint_bearings` field is the key insight. Rather than asking the LLM for coordinates (which it would hallucinate), we ask for **directions** — compass bearings that reflect terrain knowledge. The backend then uses these bearings with a calculated radius to place actual waypoints.

### 2. Loop Generation Algorithm

This is the hardest problem in the system. Most routing engines only do A-to-B. We need to synthesize a loop.

**Algorithm:**

```
1. Geocode start_location → (lat, lng)

2. Calculate waypoint radius from target distance:
   - Approximate: radius_km = target_distance_km / (2π × stretch_factor)
   - stretch_factor accounts for roads not being straight lines (start with 1.3, tune empirically)

3. Place waypoints using LLM-suggested bearings:
   - For each bearing in waypoint_bearings:
     - Project a point at (radius_km) distance from start along that bearing
     - These become intermediate waypoints

4. Route through waypoints:
   - Call GraphHopper with: start → wp1 → wp2 → ... → wpN → start
   - Use the cycling profile (road bike)

5. Validate total distance:
   - If actual_distance is within ±20% of target: accept
   - If too short: increase radius by proportional factor, re-route
   - If too long: decrease radius by proportional factor, re-route
   - Max 3 retry iterations to converge

6. Return the final route geometry, elevation data, and stats
```

**Why compass bearings + radius, not arbitrary coordinates?**

- Placing points at a fixed radius along different bearings naturally creates a loop shape
- The LLM only needs to reason about _direction_ (which it can do from geographic knowledge), not _distance_ (which it would get wrong)
- The radius is a pure function of the target distance — simple math, not LLM inference
- This approach degrades gracefully: even if the LLM's directional suggestions are mediocre, the geometric constraint still produces a coherent loop

**Elevation character tuning:**

The primary mechanism for elevation control is the LLM's waypoint bearing suggestions (routing through hilly vs flat terrain). As a secondary mechanism, GraphHopper supports an `elevation` weighting parameter in its cycling profile — we can bias toward or away from elevation change. We pass:

- `flat` → `avoid_elevation=true` (if supported) or use `shortest` optimization
- `hilly/mountainous` → use default cycling profile which tends to find interesting roads

This is a v0 heuristic. Proper elevation targeting would require iterative optimization or a terrain-aware waypoint placement algorithm — both out of scope.

### 3. GraphHopper Configuration

**API call structure:**

```
POST https://graphhopper.com/api/1/route
{
  "points": [[lng1, lat1], [lng2, lat2], ...],
  "profile": "bike",
  "points_encoded": false,
  "elevation": true,
  "instructions": false,
  "calc_points": true
}
```

Key parameters:

- `profile: "bike"` — road cycling profile, avoids highways and unpaved surfaces
- `elevation: true` — returns elevation data with the geometry (3D coordinates)
- `points_encoded: false` — returns raw coordinate arrays instead of encoded polylines (simpler to work with)
- We pass the start point, intermediate waypoints, and end point (same as start) as the `points` array

The cycling profile inherently handles the road preference requirements from the PRD: it avoids highways, prefers cycling infrastructure, and penalizes high-traffic roads. GraphHopper's bike profile uses OSM road classification as its primary heuristic — exactly what the PRD describes.

### 4. Frontend Component Structure

```
app/
├── page.tsx              # Main page — prompt input, loading, results, errors
├── components/
│   ├── PromptInput.tsx   # Text input + submit button
│   ├── LoadingState.tsx  # Shown during route generation
│   ├── RouteMap.tsx      # MapLibre GL map with route polyline and start marker
│   ├── ElevationProfile.tsx  # Recharts area chart
│   ├── RouteStats.tsx    # Distance and elevation gain
│   ├── GpxDownload.tsx   # Download button
│   └── ErrorDisplay.tsx  # Shown on failure
```

State is minimal — managed with React useState/useReducer at the page level:

```typescript
type AppState =
  | { status: 'idle' }
  | { status: 'loading'; prompt: string }
  | { status: 'success'; route: RouteData }
  | { status: 'error'; message: string };
```

No state management library. No client-side routing. No global store. One page, one flow.

### 5. API Contract

**Single endpoint:**

```
POST /api/generate-route
Content-Type: application/json

Request:
{
  "prompt": "A 60km hilly loop from central Girona on quiet roads",
  "user_location": {              // optional, from browser geolocation
    "latitude": 41.9794,
    "longitude": 2.8214
  }
}

Response:
{
  "route": {
    "geometry": [[lat, lng, elevation], ...],  // array of 3D coordinates
    "distance_km": 62.3,
    "distance_mi": 38.7,
    "elevation_gain_m": 890,
    "elevation_gain_ft": 2920,
    "start_point": { "lat": 41.9794, "lng": 2.8214 }
  },
  "gpx": "<gpx>...</gpx>",        // GPX XML string, downloaded client-side
  "metadata": {
    "parsed_params": {
      "start_location": "Central Girona, Spain",
      "target_distance_km": 60,
      "elevation_character": "hilly",
      "road_preference": "quiet_roads"
    },
    "llm_reasoning": "Routing north and west from Girona toward the Gavarres hills and pre-Pyrenean foothills for elevation. Avoiding the flat coastal plain to the east."
  }
}
```

The `metadata` field is included for debugging and tuning during v0. It lets us see what the LLM understood and why it made its directional choices. This is critical for iterating on prompt engineering and waypoint logic.

**GPX download:** The GPX XML is returned inline in the response. The frontend creates a Blob and triggers a download via `URL.createObjectURL`. No separate download endpoint, no server-side route storage. Simpler architecture — one request, one response, everything the client needs.

### 6. GPX File Format

The GPX file will contain a single `<trk>` with one `<trkseg>` containing `<trkpt>` elements with lat, lon, and elevation. This is the simplest valid format and is universally supported.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Roam v0">
  <trk>
    <name>Roam Route — 60km hilly loop from Girona</name>
    <trkseg>
      <trkpt lat="41.9794" lon="2.8214"><ele>78</ele></trkpt>
      <!-- ... -->
    </trkseg>
  </trk>
</gpx>
```

Generated by a TypeScript utility function — simple string templating over the coordinate array.

---

## Geolocation Fallback

When no start location is specified in the prompt:

1. Frontend requests browser geolocation via `navigator.geolocation.getCurrentPosition()`
2. If granted, coordinates are sent in the `user_location` field of the API request
3. The API route reverse-geocodes to get a human-readable location name (for the GPX file name and metadata)
4. If geolocation is denied or unavailable, the frontend displays: _"Please include a starting location in your prompt (e.g., 'from central Girona')."_

This is a frontend concern — the API route always expects either a location in the prompt or coordinates in `user_location`.

---

## Error Handling

Errors in v0 are simple and user-facing. No retry queues, no error tracking services.

| Failure                               | User sees                                                                                                                   | Server behavior                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| LLM can't parse the prompt            | "I couldn't understand that request. Try describing your ride with a starting location and distance."                       | Log the raw prompt and LLM response for debugging           |
| Geocoding fails                       | "I couldn't find that location. Try being more specific (e.g., 'central Girona, Spain')."                                   | Log the location string                                     |
| Routing engine returns no route       | "Couldn't generate a route in that area. The road network may be too sparse. Try a different location or shorter distance." | Log the waypoints and engine response                       |
| Routing engine timeout                | "Route generation timed out. Try a shorter distance or different area."                                                     | 30-second timeout on GraphHopper calls                      |
| Distance can't converge after retries | Return best attempt with a note                                                                                             | "Route is Xkm — couldn't exactly match your target of Ykm." |
| GraphHopper API rate limit            | "Service is temporarily busy. Try again in a few minutes."                                                                  | Log for monitoring                                          |

All errors return a structured JSON response with a `status: "error"` field and a `message` for display.

---

## Project Structure

```
roam/
├── app/
│   ├── page.tsx                 # Main page — the entire UI
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Global styles
│   └── api/
│       └── generate-route/
│           └── route.ts         # POST handler — orchestrates LLM + routing
├── components/
│   ├── PromptInput.tsx
│   ├── LoadingState.tsx
│   ├── RouteMap.tsx
│   ├── ElevationProfile.tsx
│   ├── RouteStats.tsx
│   ├── GpxDownload.tsx
│   └── ErrorDisplay.tsx
├── lib/
│   ├── llm.ts                   # Claude API integration
│   ├── routing.ts               # GraphHopper integration + loop generation
│   ├── geocoding.ts             # Nominatim geocoding
│   ├── gpx.ts                   # GPX XML generation
│   ├── geo.ts                   # Haversine, point projection, etc.
│   └── types.ts                 # Shared types (request, response, route data)
├── next.config.ts
├── package.json
├── tsconfig.json
├── .env.local                   # API keys (ANTHROPIC_API_KEY, GRAPHHOPPER_API_KEY, MAPTILER_API_KEY)
├── project-overview/
│   └── v0-plan/
│       ├── PRD.md
│       └── v0-tech-plan.md
└── README.md
```

All backend logic lives in `lib/` — pure TypeScript modules with no framework dependency. The API route in `app/api/generate-route/route.ts` is a thin orchestrator that calls into these modules. This keeps the logic testable and portable if we ever need to move it.

---

## Implementation Sequence

Build in this order. Each step produces something testable.

### Phase 1: API Logic (the hard part)

**Step 1 — Project setup.**
Initialize Next.js with TypeScript. Install dependencies: `@anthropic-ai/sdk`, `react-map-gl`, `maplibre-gl`, `recharts`. Set up `.env.local` with API keys. Verify `next dev` runs.

**Step 2 — LLM integration.**
Build `lib/llm.ts`. Define the tool schema, write the system prompt, call Claude, parse the structured output. Test with 5-6 different natural-language prompts and verify the extracted parameters and waypoint bearings make sense. This is testable in isolation — no other services needed.

**Step 3 — Geocoding.**
Build `lib/geocoding.ts`. Wrap Nominatim with a simple function: `locationString → { lat, lng }`. Handle common edge cases (ambiguous names, locations in multiple countries). Testable in isolation.

**Step 4 — Loop generation + routing.**
Build `lib/routing.ts` and `lib/geo.ts`. This is the core algorithm: take the LLM's output + geocoded start point, generate waypoints, call GraphHopper, validate distance, retry if needed. Test by logging waypoints and inspecting routes on geojson.io. This is the step most likely to need iteration.

**Step 5 — GPX generation.**
Build `lib/gpx.ts`. Take the route geometry and produce a valid GPX XML string. Test by saving to a file and importing into Garmin Connect and Strava.

**Step 6 — API route.**
Build `app/api/generate-route/route.ts` and `lib/types.ts`. Wire steps 2-5 together behind the POST handler. Test with curl.

### Phase 2: Frontend

**Step 7 — Map and route display.**
Build the MapLibre map component with react-map-gl. Hard-code a route response from Phase 1 testing and render it. Verify the route line, start marker, and pan/zoom work correctly.

**Step 8 — Elevation profile.**
Build the Recharts elevation chart. Render it from the same hard-coded data. Verify it reads clearly.

**Step 9 — Full integration.**
Build the prompt input, loading state, error display, stats, and GPX download button. Wire everything to the real API route. Test end-to-end.

### Phase 3: Tuning

**Step 10 — Route quality iteration.**
Generate routes from the 10-15 test areas listed in the PRD. Review each one. Tune:

- The LLM system prompt (waypoint bearing quality)
- The stretch factor in the radius calculation (distance accuracy)
- The retry logic (convergence behavior)
- GraphHopper profile parameters (road quality)

This is not a single task — it's ongoing for the life of v0. But we need at least one pass before considering v0 complete.

---

## API Keys Required

| Service            | Key                   | Free tier                                                        |
| ------------------ | --------------------- | ---------------------------------------------------------------- |
| Anthropic (Claude) | `ANTHROPIC_API_KEY`   | Pay-per-use, ~$0.01-0.03 per route generation                    |
| GraphHopper        | `GRAPHHOPPER_API_KEY` | 500 requests/day, sufficient for v0                              |
| MapTiler           | `MAPTILER_API_KEY`    | 100k tile requests/month, sufficient for v0 and early deployment |
| Nominatim          | None                  | Free, rate-limited to 1 req/sec (fine for our use)               |

Total cost for v0 testing: effectively zero beyond the Claude API usage, which will be a few dollars for hundreds of test routes.

---

## Known Limitations and Future Considerations

Things that are explicitly not solved in v0, documented here so we don't forget:

1. **Loop quality is heuristic.** The compass-bearing + fixed-radius approach produces reasonable loops, but they can feel geometric rather than organic. A future version could use local road network analysis to find natural loop corridors.

2. **Elevation targeting is indirect.** We rely on the LLM's geographic knowledge to point waypoints toward hilly or flat terrain. This works well for well-known cycling areas but may be poor for obscure locations. A future version could integrate terrain data directly into waypoint placement.

3. **No caching.** Every identical prompt generates a new route. Fine for v0, but we should cache LLM responses and routing results if we ever move beyond local use.

4. **No rate limiting.** The API route has no request throttling. Fine for a single local user, not suitable for any shared deployment.

5. **No route persistence.** GPX is generated per-request and returned inline. No database, no saved routes. If we need persistence, add a database — but not for v0.

6. **GraphHopper free tier dependency.** If we need more than 500 routes/day or want deeper profile customization, we'll need to self-host. The migration path is straightforward — same API, different base URL.

7. **Nominatim for geocoding.** Sufficient for v0. When we deploy, MapTiler Geocoding is the natural upgrade — same ecosystem as our tile source, adds autocomplete for input enhancement.

8. **Vercel function timeouts.** Route generation may take 10-15+ seconds (LLM call + routing + retries). Vercel's Hobby plan has a 10-second function timeout. For deployment, we'll need Pro plan (60 seconds) or streaming responses. Not a concern for local development.
