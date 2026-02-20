# v0 — Proof of Concept: Product Requirements Document

**Last Updated: February 2026**
_DRAFT — For Internal Planning_

---

## Goal

Validate a single hypothesis: **can an LLM combined with a cycling-tuned routing engine produce rideable routes from natural language input?**

This is not a product launch. It is the smallest thing we can build to answer that question with real routes on real roads. Everything that is not essential to answering that question is out of scope.

---

## What We Are Building

A web application where a cyclist types a plain-language description of a ride they want, and the system returns a route displayed on a map with an elevation profile and a downloadable GPX file.

**Example input:**

> "A 60km hilly loop from central Girona on quiet roads."

**Example output:**

- A route drawn on an interactive map
- An elevation profile showing climbs and descents
- Total distance and elevation gain
- A button to download the route as a GPX file

---

## User Flow

1. User opens the app and sees a single text input
2. User types a natural language description of the ride they want
3. User submits the request
4. The system displays a loading state while it processes
5. The system returns a route displayed on a map with an elevation profile and key stats
6. User can download the route as a GPX file
7. User can enter a new prompt to generate a different route

There is no conversation, no follow-up refinement, no editing. One input, one output. When the user submits a new prompt, the previous route is cleared and replaced entirely — there is no route history or side-by-side comparison.

---

## Functional Requirements

### Natural Language Input

- A single text input field that accepts a free-form ride description
- The system must extract the following parameters from the input when provided:
  - **Start location** — a city, address, landmark, or general area
  - **Distance** — target ride distance (may be expressed in km or miles)
  - **Elevation character** — flat, rolling, hilly, or mountainous
  - **Road preferences** — quiet roads, avoiding highways, bike paths, etc.
- When no start location is provided, the system uses browser geolocation to detect the user's current location as the starting point. If geolocation is unavailable or denied, the system displays a message asking the user to include a location in their prompt.
- When other parameters are missing (distance, elevation character), the system should use sensible defaults rather than failing. For v0, we are not asking clarifying questions — the system does its best with what it's given.

### Route Generation

- The system sends the extracted parameters to a cycling-aware routing engine
- All routes are generated as loops (start and end at the same location). Point-to-point routes are out of scope for v0.
- The routing engine must use a cycling-specific profile that:
  - Avoids highways and high-speed roads
  - Avoids unpaved roads and gravel paths
  - Prefers roads with cycling infrastructure where available
  - Prefers lower-traffic roads where data is available — in practice this means using OpenStreetMap road classification as a proxy (preferring tertiary, residential, and unclassified roads over primary and trunk roads; favoring roads with lower speed limits, ideally under 70km/h). This is a best-effort heuristic and will be iteratively tuned.
- Generated routes must be actually rideable — no dead ends, no routing through buildings, no U-turns on highways

### Map Display

- The generated route is displayed on an interactive map
- The route is drawn as a colored line on the map
- The map is pannable and zoomable
- The start/end point is marked

### Elevation Profile

- An elevation profile chart is displayed below or alongside the map
- The profile shows elevation (vertical axis) over distance (horizontal axis)
- The profile should be visually clear enough to understand the character of the ride at a glance

### Route Stats

- Total distance (km and miles)
- Total elevation gain (meters and feet)

### GPX Export

- A download button exports the route as a standard GPX file
- The GPX file must be importable into common cycling GPS devices (Garmin, Wahoo) and platforms (Strava, Komoot, RideWithGPS)

---

## Non-Functional Requirements

### Performance

- Performance is not critical for v0, but in an ideal world:
  - Route generation should complete within 15 seconds for a typical request (after the LLM has parsed the user input and kicked off the route generation task)
  - The map and elevation profile should render within 2 seconds of receiving route data

### Reliability

- If route generation fails, display a clear error message suggesting the user try different parameters
- The system should handle edge cases gracefully (very short distances, very long distances, locations with limited road networks). There is no geographic restriction — if a user requests a route in an area with poor road data, the system should attempt it and fail gracefully if it can't produce a viable route.

### Device Support

- The app must work in modern desktop browsers (Chrome, Firefox, Safari, Edge)
- The app should be usable on mobile browsers but a fully optimized mobile layout is not required for v0

---

## Out of Scope for v0

The following are explicitly excluded from this version. They are important for the product but not necessary to validate the core hypothesis.

- **Conversational interaction** — no follow-up questions, no clarifying prompts from the system, no multi-turn chat
- **Route editing** — no dragging waypoints, no modifying the generated route
- **Multiple route options** — the system returns one route per request
- **Named climb/segment targeting** — no lookup of specific climbs by name (e.g. "include Rocacorba")
- **User accounts** — no sign-up, no login, no saved routes
- **Route history** — no persistence of previously generated routes
- **Specific waypoint support** — no "go through point X then point Y" (beyond the start location)
- **Weather or time-of-day awareness** — no consideration of current conditions
- **Training plan integration** — no connection to fitness platforms
- **Point-to-point routes** — all routes are loops; A-to-B routing is deferred to a later version
- **Mobile app** — web only
- **Deployment** — v0 runs locally for personal testing; deployment to a hosted environment is deferred

---

## Key Technical Decisions to Make

These are the technical choices that will need to be resolved during implementation planning. They are not product requirements but will shape how the requirements are met.

1. **Routing engine** — Which cycling routing engine or API will we use? (e.g. BRouter, GraphHopper, OSRM, Valhalla, or a commercial API). The engine must support road cycling profiles and ideally loop generation.
2. **LLM integration** — How do we structure the LLM call to extract route parameters from natural language? What model do we use? How do we handle ambiguity in user input?
3. **Loop generation strategy** — How do we generate circular routes? Most routing engines only support A-to-B. We may need to generate intermediate waypoints to create loops of the target distance and character.
4. **Map library** — Which map library for the frontend? (e.g. Mapbox GL JS, Leaflet, Google Maps)
5. **Elevation data** — Where does elevation data come from? Is it embedded in the routing engine's response, or do we need a separate elevation API?
6. **Frontend framework** — What framework for the web app?
7. **Backend architecture** — How are the LLM and routing engine orchestrated? A simple backend service that coordinates the two, or a more complex pipeline?

---

## Success Criteria

v0 is successful if:

1. **The system produces routes that a cyclist would actually ride.** When we generate a 60km loop from a known cycling area, the route should stick to roads that are safe and reasonable for road cycling. It should not route through highways, gravel paths, or dead-end streets.

2. **The system understands basic ride intent from natural language.** A request for a "hilly ride" should produce a route with meaningfully more elevation gain than a request for a "flat ride" from the same starting point.

3. **Generated loops feel intentional, not random.** A 60km loop should not be a weird out-and-back or a zigzag. It should feel like a route a local cyclist might actually choose to ride — a coherent loop that makes geographic sense.

4. **The GPX file works.** Downloaded GPX files should import cleanly into Garmin Connect, Wahoo, and Strava without errors.

5. **End-to-end flow works.** A user can type a request, see a route on a map with an elevation profile, and download it — all within a reasonable timeframe.

---

## How We Will Test

- Generate routes from 10-15 known cycling areas (Girona, Nice, Mallorca, Richmond Park London, Boulder CO, Milton ON, etc.)
- Manually review each route on a map for road safety, road surface, and overall coherence
- Compare elevation gain of "flat" vs "hilly" requests from the same location
- Import GPX files into Garmin Connect and Strava to verify compatibility
- Time the end-to-end flow from input to rendered result
- If possible, actually ride 2-3 of the generated routes and note where they fall short
