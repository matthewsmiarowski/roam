# v2 — Interactive Route Editing: Product Requirements Document

**Last Updated: February 2026**
_DRAFT — For Internal Planning_

---

## Goal

Validate a single hypothesis: **can users refine generated routes to their satisfaction through direct visual editing on the map?**

v1 proved that conversation is a good interaction model for generating routes. But once a route exists and is "almost right," conversation is a clumsy way to refine it. Describing spatial changes in words — "move the route a bit further north around the 30km mark" — is imprecise. Sometimes you just want to grab a point on the map and drag it.

v2 adds direct manipulation of routes on the map — draggable waypoints, click-to-add waypoints, and real-time re-routing. The user generates a route through conversation (as in v1), then switches to visual editing to fine-tune it.

---

## What We Are Building

An extension of the existing conversational route generation app that lets users visually edit routes by manipulating waypoints directly on the map. After selecting a route from the generated options, users can drag existing waypoints, add new ones by clicking the route or the map, and remove waypoints they don't want. Each edit triggers a localized re-route — only the segments adjacent to the changed waypoint are recalculated, so the rest of the route stays exactly as it was. The route line, stats, and elevation profile update in real time.

**Example flow:**

1. User asks for a "70km hilly loop from Nice"
2. System generates 3 options, user selects "Col d'Eze Loop"
3. User sees the route with waypoints visible on the map
4. User drags the easternmost waypoint further inland to avoid a coastal section they know is busy
5. Only the two segments touching that waypoint re-route — the rest of the loop is unchanged
6. Stats and elevation profile update to reflect the edit
7. User adds a waypoint by clicking on the route line near a road they want to include
8. User downloads the final GPX

---

## User Flow

### Generating routes (unchanged from v1)

1. User opens the app and starts a conversation
2. System asks clarifying questions or generates 3 route options
3. Routes are displayed on the map and as cards in the chat panel

### Entering edit mode

4. User clicks a route card to select it
5. The selected route enters **detail view** (existing behavior) with one addition: the waypoints used to generate the route are now visible on the map as draggable markers
6. The map zooms to fit the selected route with comfortable padding

### Visual editing

7. **Drag a waypoint** — user drags any intermediate waypoint marker to a new position. On release, the system re-routes only the segments adjacent to that waypoint (the segment before it and the segment after it). The rest of the route is unchanged.
8. **Add a waypoint** — user clicks on the route line to insert a new waypoint at that position (between the nearest existing waypoints). Alternatively, user can click anywhere on the map to add a waypoint appended to the route. Only the affected segments re-route.
9. **Remove a waypoint** — user clicks a waypoint to select it, then clicks a delete button (or presses Backspace/Delete). The two segments on either side of the removed waypoint merge into one and re-route as a single segment.
10. Start/end point is **not** draggable in this version — changing the start location requires generating a new route through conversation.

### Finishing

11. User downloads the GPX of the final edited route
12. User can go back to the route options to select a different route, or start a new conversation

---

## Functional Requirements

### Waypoint Display

- When a route is selected (detail view), the waypoints used to generate it are shown as markers on the map
- The start/end point marker is visually distinct from intermediate waypoints (different color or icon)
- Intermediate waypoints are numbered or otherwise ordered to show the route sequence
- Waypoint markers must be large enough to click and drag comfortably
- When hovering over a waypoint, the cursor changes to indicate it is draggable

### Drag to Edit

- Intermediate waypoints can be dragged to new positions
- While dragging, the waypoint follows the cursor in real time
- On drag end (mouse up / touch end), the system re-routes **only the two segments adjacent to the moved waypoint** — the segment from the previous waypoint to the dragged one, and the segment from the dragged one to the next waypoint. All other segments remain unchanged.
- During re-routing, a loading indicator is shown on the affected segments. The unaffected portions of the route remain fully visible and stable.
- If re-routing fails, the waypoint snaps back to its previous position and an error message is shown
- Dragging must be debounced — only the final position triggers a routing request, not intermediate positions during the drag

### Add Waypoint

- Clicking on the route line inserts a new waypoint at the click position, placed between the two nearest existing waypoints in the route sequence. This splits one segment into two and re-routes both new segments.
- Clicking on the map (not on the route line) appends a waypoint — the system re-routes the last segment (previous last waypoint → new waypoint) and adds a new segment (new waypoint → start). The segments before the new waypoint are unchanged.
- Newly added waypoints are immediately draggable
- There is a maximum of **8 intermediate waypoints**. This is a soft UX limit — beyond 8, the route is complex enough that starting a new conversation is a better approach. The limit can be adjusted based on testing.

### Remove Waypoint

- Clicking a waypoint selects it (visual highlight)
- A selected waypoint shows a delete action (small delete button on or near the marker, or keyboard shortcut)
- Removing a waypoint merges its two adjacent segments into one and re-routes that single new segment. All other segments are unchanged.
- The start/end point cannot be removed
- At least 1 intermediate waypoint must remain (a route with 0 intermediates would be a degenerate out-and-back)

### Multi-Leg Stitching

The route is stored as a sequence of **segments**, where each segment is an independent GraphHopper route between two consecutive waypoints:

```
start → wp1 (segment 1)
wp1 → wp2   (segment 2)
wp2 → wp3   (segment 3)
wp3 → start (segment 4)
```

The full route displayed on the map is the concatenation of all segments. Stats (distance, elevation gain) are the sum across segments. The elevation profile is the concatenation of segment elevation data.

This architecture means:
- **Initial route generation** requires N+1 GraphHopper calls for N intermediate waypoints (one per segment), run in parallel
- **Editing a waypoint** requires only 2 GraphHopper calls (the two adjacent segments), run in parallel
- **Adding a waypoint on the route line** requires 2 calls (the split segment becomes two new segments)
- **Removing a waypoint** requires 1 call (the two adjacent segments merge into one)
- Segments not involved in an edit are completely untouched — their geometry, elevation data, and contribution to stats remain identical

This is a change from v1, where each route variant is generated with a single GraphHopper call passing all waypoints at once. The stitching approach uses more API calls for initial generation but enables localized editing and removes the 5-point-per-request limit.

### Re-routing

- Every visual edit triggers re-routing of **only the affected segments** (1–2 GraphHopper calls)
- Re-routing should complete within 3 seconds for a typical edit
- While re-routing is in progress, the UI shows a loading state on the affected segments but the map remains interactive and unaffected segments remain fully visible
- After a successful re-route, the route line, distance, elevation gain, time estimate, and elevation profile all update
- Failed re-routes preserve the previous state for the affected segments and show an error message

### State Transitions

The existing phase model gets a minor addition:

```
options → [select route] → detail/editing
detail/editing → [drag/add/remove waypoint] → re-routing → detail/editing
detail/editing → [back] → options
detail/editing → [download GPX] → (stays in detail/editing)
```

When the user goes back to options from detail/editing, any visual edits to the selected route are **preserved** so they can return to them. If the user sends a new chat message that generates fresh route options, previous edits are discarded.

---

## Non-Functional Requirements

### Performance

- Re-routing after a waypoint edit should complete within 3 seconds (only 1–2 segment calls, not the full route)
- The map should remain responsive during re-routing (no UI freezes)
- Waypoint dragging must feel smooth — 60fps with no perceptible lag between cursor and marker

### API Budget

- Initial route generation with stitching costs N+1 GraphHopper calls per variant (3 intermediates = 4 calls). With 3 variants in parallel, that's 12 calls per generation vs. 3 today. This reduces the free tier budget from ~160 conversations/day to ~40 conversations/day.
- Each visual edit costs 1–2 calls, so a 5-edit session adds 10 calls on top. Still manageable for personal use.
- If the API budget becomes a constraint, we can explore caching segments that haven't changed, or upgrading to a paid tier. But we start with the free tier and see how far it gets us.

### Device Support

- Mouse-based drag-and-drop on desktop browsers (Chrome, Firefox, Safari, Edge)
- Touch-based drag on mobile/tablet is a nice-to-have but not required for v2. The primary interaction model is desktop.

---

## Out of Scope for v2

The following are explicitly excluded from this version:

- **Conversational refinement during editing** — once the user enters edit mode, route changes are made by manipulating waypoints on the map, not through chat. To make conversational changes, the user goes back to the chat and generates new route options. Combining the two is a natural follow-up but adds significant complexity (LLM needs spatial awareness of edits) and is not required to validate the core hypothesis.
- **Freeform route drawing** — drawing a route shape by hand and having the system snap it to roads. We are doing point-based editing, not path-based drawing.
- **Turn-by-turn editing** — modifying specific turns or road segments within a route. Edits are at the waypoint level; the routing engine decides the path between waypoints.
- **Route comparison after editing** — no side-by-side "before and after" view of visual edits. The route updates in place.
- **Undo/redo** — no ability to step backwards through edit history. The user can re-drag waypoints to adjust. (Undo is a natural follow-up feature.)
- **Collaborative editing** — single user only.
- **Changing the start/end point by dragging** — the start/end point is fixed once set. Users must start a new conversation to change it.
- **Multi-route editing** — only the selected route can be edited. To edit a different option, the user must select it first.
- **Offline editing** — all edits require a network connection to re-route via GraphHopper.
- **Mobile-optimized editing** — touch drag will work if feasible, but the UI will not be redesigned for small screens.
- **Persisted edit history** — no saving of edit sessions or route versions across page reloads.

---

## Key Technical Decisions to Make

1. **Map interaction library** — react-map-gl supports marker dragging and click events. Do we use its built-in capabilities or need a custom interaction layer for the drag-to-edit and click-to-add interactions?

2. **Re-routing feedback** — what does the loading state look like during a segment re-route? Options: ghost/dim the affected segments, show a spinner on the edited waypoint, show a subtle pulse animation on affected segments, or simply wait (if fast enough that no indicator is needed).

3. **Waypoint insertion logic** — when a user clicks the route line, how do we determine which segment they clicked on and where to insert the new waypoint in the sequence? This requires a nearest-segment calculation against the route geometry.

4. **Segment stitching seams** — when concatenating independently-routed segments, there may be minor visual discontinuities at waypoints (e.g., slightly different paths near the junction point). How do we handle this? Options: accept it (likely imperceptible), overlap segments slightly, or snap segment endpoints to exact waypoint coordinates.

5. **Migration from single-call to stitched routing** — the initial route generation currently uses a single GraphHopper call with all waypoints. Do we migrate to stitched routing for initial generation too (consistency, same code path) or keep single-call for generation and only use stitching for edits (fewer API calls, but two code paths)?

---

## Success Criteria

v2 is successful if:

1. **Visual edits produce valid routes.** Dragging a waypoint and re-routing should never produce a broken or unrideable result. If the routing engine can't find a path through the new waypoint, the system fails gracefully and preserves the previous route.

2. **Edits feel localized.** When a user drags one waypoint, only the segments adjacent to it change. The rest of the route remains identical. The user should feel confident that editing one part of the route won't unexpectedly alter another part.

3. **Edits feel fast and responsive.** Dragging a waypoint and seeing the route update should feel like direct manipulation — not like submitting a form and waiting. Target is under 3 seconds from drag-end to updated route.

4. **Users can refine a route to match their intent.** Given a generated route that's "almost right," a user should be able to drag and add waypoints to get a route they're happy with in under 2 minutes of editing.

5. **The system doesn't break existing v1 functionality.** Conversational route generation, route comparison, GPX download, and all existing features continue to work exactly as before. Visual editing is additive.

---

## How We Will Test

- Generate routes for 5 known areas, then make 3–5 visual edits per route and verify the re-routed result is rideable
- Verify that dragging a waypoint only changes the two adjacent segments — all other segments must remain byte-identical
- Test adding waypoints by clicking the route line and verify they are inserted at the correct sequence position
- Test removing waypoints and verify the adjacent segments merge and re-route correctly
- Test the full loop: generate → select → drag edit → add waypoint → download GPX → verify in Garmin/Strava
- Test edge cases: dragging a waypoint into the ocean, dragging to a location with no roads, removing all but one waypoint, adding 8 waypoints (the maximum)
- Verify that stitched segments produce a visually continuous route line with no gaps at waypoint junctions
- Verify that stitched elevation profiles are continuous with no jumps at segment boundaries
- Measure re-routing latency for single-waypoint edits (target: under 3 seconds)
- Compare API call budget: track total GraphHopper calls across a typical session (generate + 5 edits) and verify it stays within free tier limits for reasonable daily usage
