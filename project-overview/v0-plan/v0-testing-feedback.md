# v0 Testing Feedback

Observations from manual testing of the v0 build, with hypotheses on root causes.

---

## 1. Routes are "star-shaped" instead of continuous loops

**Observation:** Generated routes tend to look like several out-and-back spokes radiating from the start point, rather than one smooth loop.

**How routing works today:** The pipeline sends GraphHopper 5 points in order: `start → wp1 → wp2 → wp3 → start`. GraphHopper treats this as a sequential A-to-B problem — it finds the shortest/best cycling path between each consecutive pair of points. There is no "loop optimization" or circuit-level reasoning.

**Hypotheses:**

- **Shared road segments between legs.** GraphHopper independently routes each leg (start→wp1, wp1→wp2, wp2→wp3, wp3→start). If two waypoints are in roughly the same direction from the start, or if the road network is sparse, multiple legs will converge on the same roads near the starting point. Visually this creates a star/spoke pattern where the route leaves on one road, reaches a waypoint, comes back along the same road, then goes out again.

- **Waypoints too close to start relative to their spacing.** The radius formula (`target_distance_km / (2π × 1.3)`) places waypoints ~7 km out for a 60 km ride. Three points at 7 km with ~120° separation may not be far enough apart for GraphHopper to find distinct connecting roads between them — especially in areas with limited road density. The router's shortest path between adjacent waypoints may route back through the center rather than around the perimeter.

- **Road network topology.** In many areas, the road network is hub-and-spoke itself (roads radiate from a town center). GraphHopper will naturally route through the hub when connecting waypoints on different spokes, reinforcing the star shape. A loop-shaped route needs roads that connect the waypoints around the perimeter without passing through center, and those roads may not exist or may be much longer.

- **Only 3 waypoints, no intermediate shaping.** With just 3 waypoints forming a triangle, there's nothing forcing the route to stay on the triangle's edges. More intermediate waypoints along the desired loop perimeter could guide GraphHopper to trace the loop shape instead of cutting through the middle.

**Potential directions:**

- Add intermediate waypoints between each pair (e.g., midpoints along the circle arc) to guide GraphHopper along the perimeter
- Use GraphHopper's `algorithm=alternative_route` or heading parameters to discourage backtracking
- Detect star-shaped results (e.g., road segment reuse near start) and re-route with adjusted waypoints
- Increase the stretch factor or waypoint count to push waypoints further out

---

## 2. Vague starting locations fail, especially in remote areas

**Observation:** Giving a vague or colloquial starting location often fails to resolve, particularly in less populated areas.

**How geocoding works today:** The LLM extracts a location string from the user's natural language input, then `geocode()` sends it to Nominatim (OpenStreetMap's free geocoder). If the full string fails, it progressively drops leading comma-separated segments and retries (e.g., "Historic District, Girona, Spain" → "Girona, Spain" → "Spain").

**Hypotheses:**

- **LLM location extraction is unreliable for vague inputs.** When a user says "somewhere near the mountains outside Boulder" or "from my cabin in Vermont," the LLM has to synthesize a geocodable string. It's instructed to produce "City, Country" format, but vague inputs may cause it to output something Nominatim can't resolve (a trail name, a regional description, a neighborhood that doesn't exist in OSM data).

- **Nominatim has poor coverage in remote areas.** OSM data density varies hugely by region. A small village, rural crossroads, or informal place name that locals use may simply not exist in Nominatim's index. The progressive simplification fallback helps, but it can overshoot — dropping from "Trailhead near Lake Tahoe" to just "Lake Tahoe" gives a point in the middle of a lake rather than a usable cycling start.

- **No feedback loop to the user.** When geocoding fails or resolves to a poor location, the user has no way to correct it short of rephrasing their entire request. The system either succeeds silently (possibly at a wrong location) or fails with a generic error.

- **Single result from Nominatim.** The geocoder uses `limit=1`, taking only the top result. For ambiguous names (e.g., "Springfield" exists in 30+ US states), the user gets whatever Nominatim ranks first with no ability to disambiguate.

**Potential directions:**

- Add a "drop a pin" feature so users can set their start location precisely on the map, bypassing geocoding entirely
- Use the browser's geolocation API (already wired up as `user_location`) as a default starting point
- Show the resolved start location on the map before generating the route, letting users confirm or adjust
- Fall back to reverse-geocoding the user's current location when the text input is too vague

---

## 3. LLM failures with no recourse when the provider is down

**Observation:** Sometimes the LLM call fails entirely. Retries help for transient issues, but a sustained outage leaves the app non-functional.

**How error handling works today:** The Anthropic SDK is configured with `maxRetries: 5` which handles transient 429 (rate limit) and 529 (overloaded) errors with exponential backoff. If all retries are exhausted, the error propagates to the API route's catch block, which pattern-matches error messages and returns a user-facing string like "Our AI service is temporarily busy" or "An unexpected error occurred."

**Hypotheses:**

- **Single provider dependency.** The app is hardcoded to use Claude (Anthropic) via the SDK. There is no fallback to an alternative LLM provider. If Anthropic's API is down or degraded, the entire route generation pipeline is blocked because the LLM is the first step — it produces the waypoint bearings that everything else depends on.

- **5 retries may not be enough for extended degradation.** The SDK's retry logic handles brief blips, but during a sustained partial outage (intermittent 500s, elevated latency causing timeouts), the retries may exhaust quickly and the user just sees an error. There's no queuing or delayed-retry mechanism.

- **No graceful degradation path.** The architecture requires LLM output to proceed — there's no way to generate a route without it. A "default route" mode (e.g., a simple circular route using only the start point and distance without LLM reasoning) could serve as a fallback.

- **Error messages don't set expectations.** When the LLM is down, the user sees a brief error but has no indication of whether to retry in 30 seconds or come back tomorrow. There's no status page link or retry-after guidance.

**Potential directions:**

- Add a secondary LLM provider as fallback (e.g., OpenAI, Google) with the same tool-use schema
- Implement a "dumb route" fallback that generates evenly-spaced bearings (0°, 120°, 240°) without LLM input when the AI service is unavailable
- Surface more actionable error messages with retry guidance
- Add client-side retry with a "Try Again" button so users don't have to re-enter their prompt

---

## Spike: GraphHopper `algorithm=round_trip` (Option A for issue #1)

Tested whether GraphHopper's built-in round trip algorithm works on the free tier as an alternative to our waypoint-based approach for fixing star-shaped routes.

### Test setup

Called GraphHopper with `algorithm=round_trip` and `round_trip.distance` set to the target distance. Tested across 3 locations (urban, suburban, rural), 2 distances (30km, 60km), and multiple `round_trip.seed` values. Compared against the current waypoint method (3 bearings at 0/120/240 degrees).

### Raw results

| Location      | Target | Method               | Actual | Error | Elevation |
| ------------- | ------ | -------------------- | ------ | ----- | --------- |
| Girona, Spain | 30km   | round_trip (seed=0)  | 23.6km | -21%  | 278m      |
| Girona, Spain | 30km   | round_trip (seed=42) | 25.7km | -14%  | 281m      |
| Girona, Spain | 30km   | round_trip (seed=99) | 38.3km | +28%  | 1145m     |
| Girona, Spain | 30km   | waypoints            | 31.3km | +4%   | 515m      |
| Girona, Spain | 60km   | round_trip (seed=0)  | 66.2km | +10%  | 1292m     |
| Boulder, CO   | 30km   | round_trip (seed=0)  | 45.9km | +53%  | 2108m     |
| Boulder, CO   | 30km   | round_trip (seed=42) | 39.9km | +33%  | 572m      |
| Boulder, CO   | 30km   | round_trip (seed=99) | 25.7km | -14%  | 182m      |
| Boulder, CO   | 30km   | waypoints            | 30.9km | +3%   | 1069m     |
| Boulder, CO   | 60km   | round_trip (seed=0)  | 84.2km | +40%  | 3687m     |
| Rural Vermont | 30km   | round_trip (seed=0)  | 24.6km | -18%  | 502m      |
| Rural Vermont | 30km   | waypoints            | 26.4km | -12%  | 498m      |
| Rural Vermont | 60km   | round_trip (seed=0)  | 70.8km | +18%  | 1815m     |
| Rural Vermont | 60km   | waypoints            | 58.9km | -2%   | 1246m     |

### Key findings

1. **round_trip works on the free tier.** No errors related to the algorithm itself — all failures were rate limiting (429), not permission/tier errors.

2. **Distance accuracy is significantly worse.** The current waypoint method consistently lands within ±12% of target. Round trip ranged from -21% to +53% — highly unpredictable. Our current approach has a distance retry loop that adjusts radius proportionally, but there's no equivalent tuning lever for round_trip (we can't adjust `round_trip.distance` iteratively because the relationship between input distance and output distance isn't proportional the same way).

3. **Seed variation is extreme and unpredictable.** In Boulder at 30km, three seeds produced 25.7km, 39.9km, and 45.9km — a 20km spread. In Girona at 30km, seed=99 produced 38.3km with 1145m of climbing while seed=0 produced 23.6km with 278m of climbing. The seed doesn't offer fine control; it produces wildly different routes.

4. **No directional control on the free tier.** The `headings` parameter that could steer the round trip toward specific terrain requires `ch.disable=true` (paid tier only). Without it, we can't implement the LLM's "head toward the hills" reasoning — the route goes wherever GraphHopper's algorithm decides.

5. **Rate limiting is aggressive.** The free tier's per-minute limit is very tight. Our current approach already uses up to 4 calls per route (distance retry loop). Round trip doesn't reduce call count since we'd likely need multiple seeds or a distance retry loop of our own.

### Conclusion: Option A is not viable as a standalone fix

While `algorithm=round_trip` does work on the free tier and likely produces better loop shapes, it introduces two new problems that are worse than the one it solves:

- **Distance accuracy regresses badly.** Going from ±4% to ±53% is not acceptable. We'd need our own retry loop on top of round_trip, but there's no proportional adjustment lever — we'd just be trying different seeds and hoping one lands close, which is wasteful and unreliable.
- **We lose the LLM's directional intelligence.** The inability to use `headings` on the free tier means we can't steer the route toward terrain the user asked for. This is a core differentiator of Roam.

### Revised recommendation

Given that Option A doesn't hold up, the path forward is likely:

- **Short term (free tier): Option C — smarter waypoint geometry.** Adjusting how we place and connect the 3 waypoints we already have. Ideas: increase the stretch factor to push waypoints further out, offset waypoints tangentially so the router prefers perimeter paths, or add a simple post-hoc check for road segment reuse near the start.
- **Medium term: Upgrade to GraphHopper Starter (€89/mo) and implement Option B.** This unlocks more waypoints (30 max), `ch.disable`, `headings`, and `pass_through`. With 6-8 waypoints along the arc plus heading constraints, we can guide GraphHopper to trace a proper loop while preserving the LLM's directional reasoning. This is the architecturally sound solution once we're ready to invest in infrastructure.
