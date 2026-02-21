# AI-Powered Cycling Route Generation

**Project Overview — February 2026**
_DRAFT — For Internal Planning_

---

## What We Are Building

We are building an application that lets cyclists describe the ride they want in plain language and receive a complete, rideable route in return. Instead of manually clicking waypoints on a map, adjusting settings, and visually inspecting road-by-road details, a cyclist should be able to say something like:

> _"I want a 60km hilly loop from my hotel in Girona. Include the climb up Rocacorba and keep me on quiet roads."_

…and receive a route they can review on a map, refine through conversation, and export to their GPS cycling computer.

The application combines a large language model for natural language understanding with a cycling-specific routing engine to translate human intent into optimized routes. Users interact through a conversational interface rather than traditional map-based point-and-click tools, though visual map editing is available for fine-tuning.

---

## Who We Are Building For

The primary audience is road cyclists who are serious about their riding but want to spend less time planning routes. Within that audience, two personas capture the core use cases:

### The Traveling Cyclist

A cyclist visiting an unfamiliar area — whether for a training camp, vacation, or event. They may know the name of a famous climb or have a general sense of what they want to ride, but they lack the local knowledge to construct a route themselves. Today, they spend significant time researching routes online, cross-referencing mapping tools, and hoping the roads they pick are safe and enjoyable. This product eliminates that friction entirely.

### The Daily Rider at Home

An experienced cyclist who rides regularly from the same starting location but is tired of the same routes. They want variety without the effort of planning. On any given morning, they might want a flat recovery spin or an aggressive climbing ride, and they want to describe that intention rather than manually build it. The product generates fresh routes that match their mood and fitness for the day.

### What Unites Both Personas

Both groups share a core frustration: existing route planning tools are powerful but require active, visual, manual effort. Every product in the market — Strava, Komoot, RideWithGPS — assumes the cyclist wants to open a map, click waypoints, drag routes, and fiddle with settings. For many riders, this is overhead they would rather skip. They want to describe the ride and go. Some products (like Strava) lean on their community to understand what routes are actually "for cyclists", but they still require users to discover routes and adjust them manually to get started.

---

## Long-Term Vision

The long-term vision is to become the default way cyclists discover and plan rides, both at home and while traveling. The product starts as a route generation tool and grows into a platform with compounding data advantages.

### Phase 1: The Best Way to Create a Route

Establish natural language route generation as a credible alternative to manual route planning. If a cyclist can describe a ride and get a result that's safe, rideable, and reasonably enjoyable within seconds, the core value proposition is proven. Success means that users choose this tool over opening Strava's route builder or Komoot's planner because it's faster and easier.

### Phase 2: The Smartest Route Planner

Layer in segment awareness, popular climb databases, and integration with cycling data platforms to produce routes that aren't just safe but genuinely great. The product should understand that a ride near Girona should include Els Angels, that a ride from Nice should consider the Col de la Madone, and that a Sunday morning loop in Milton should avoid the industrial roads near the 401. This knowledge comes from a combination of curated data, community input, and cycling platform integrations.

### Phase 3: A Platform with a Data Moat

Build proprietary data advantages that compound over time. User-contributed road quality ratings create a dataset no competitor can replicate. Ride-back data (comparing generated routes against actual GPS traces) continuously improves routing quality. Community route sharing creates a network effect. Training plan integration and weather-aware routing deepen engagement. The product evolves from a tool into an ecosystem.

### A Note On The Phases

It might take us a long time to build through all of the phases and it's possible that we build this product and very few people use it. That's ok. I'd just love for it to be a useful app for myself and I believe that we build something useful for me, there will be other people that will find it useful too. If we never reach the size of community we need to build a data moat, that is okay.

---

## Technical Challenges

The concept is straightforward, but several technical challenges will require careful iteration to solve well.

### Generating High-Quality Circular Routes

Most routing engines are optimized for point-to-point navigation: get from A to B as efficiently as possible. Cyclists usually want loops — leave from home, ride a certain distance with certain characteristics, and return to the same place. Generating loops that feel like intentional, enjoyable routes rather than arbitrary geometric shapes is a hard algorithmic problem. It becomes harder still when the loop must pass through specific waypoints (like a named climb) while hitting a target distance. No off-the-shelf routing API solves this well. This is the core technical challenge of the product and the primary risk to validate early. We don't have to solve every one of these problems from the start, but we will face them as we iteratively build the product.

### Road Cycling Route Safety and Quality

A route that is technically bikeable is not necessarily a route a road cyclist would want to ride. The difference between a quiet country lane and a busy highway with no shoulder is the difference between a great ride and a dangerous one — but both may appear nearly identical in map data. Road surface is similarly critical: ending up on a gravel path while riding a road bike with 25mm tires is at best frustrating and at worst a crash risk. The product must build a routing profile that aggressively filters for road cyclist safety (blocking gravel, dirt, highways, and high-speed roads) while preferring roads with cycling infrastructure, lower speed limits, and official cycling network designation. Without access to proprietary ride popularity data like that held by Strava, achieving route quality comparable to established products will require careful tuning of open map data signals.

### Translating Natural Language to Route Parameters

When a cyclist says they want a "hilly" ride, that means something specific: sustained climbing, elevation gain appropriate to the distance, and ideally roads that go up and down rather than one long out-and-back climb. Translating subjective human descriptions into the numeric parameters a routing engine requires (elevation gain targets, gradient preferences, distance constraints) is a mapping problem that will require extensive tuning. The system must also handle ambiguity gracefully — asking the right follow-up questions when a request is underspecified without making the interaction feel like filling out a form.

### Named Location and Segment Lookup

Cyclists refer to roads and climbs by name: "Rocacorba," "Alpe d'Huez," "the Zwift route through Richmond Park." No major cycling data API supports searching segments by name. The product will need a combination of geocoding, curated databases of famous climbs and routes, and bounding-box segment exploration to resolve natural language references to specific geographic coordinates. Building and maintaining this lookup layer is a meaningful ongoing effort.

### Conversational Route Editing with Spatial Context

Allowing users to refine routes through conversation ("avoid that busy section," "make the middle part hillier") requires the system to have spatial awareness of the current route. It needs to understand which section the user means by "that busy part" and translate the edit intent into specific waypoint or parameter changes. This is a fundamentally harder natural language problem than initial route generation because it requires reasoning about a specific route in geographic context.

### Third-Party API Constraints and Data Access

The cycling data ecosystem is increasingly restrictive. Major platforms have tightened API access, limited data sharing with third parties, and explicitly prohibited use of their data in AI applications. Building popularity signals and route quality indicators will need to rely primarily on open data sources (OpenStreetMap cycling networks, official cycling route designations) rather than proprietary ride data from other platforms. Segment-level integration with cycling platforms remains possible through user-authenticated API access, but is constrained in scope and subject to ongoing policy changes.

---

## Data Strategy: Closing the Route Quality Gap

The biggest risk to route quality is the absence of proprietary ride data. Platforms like Strava know which roads cyclists actually ride because millions of users generate GPS traces every day. We will not have that data at launch, and may never have it at the scale incumbents do. Rather than trying to replicate a proprietary dataset, our strategy is to assemble a "good roads" signal from multiple public and inferential sources, layered so that each one adds value independently and they compound when combined.

### Layer 1: OSM Road Intelligence

OpenStreetMap contains rich cycling-relevant metadata that most routing tools underutilize. Beyond basic road classification (which GraphHopper's bike profile already uses), OSM tags encode surface type, road width, speed limits, cycling infrastructure, and official cycling network designations. We can build a road-quality scoring model that penalizes high-traffic arterials, rewards designated cycling routes, prefers paved surfaces, and accounts for road width and speed limits — all without any proprietary data. This is deterministic, available today, and gets us a significant portion of the way toward "roads cyclists would actually ride."

**What exists today:** GraphHopper's `bike` profile provides baseline OSM-aware routing, but we pass no custom weighting parameters. The `road_preference` field (quiet roads, bike paths) is extracted by the LLM but not yet connected to the routing engine.

**Next step:** Expose GraphHopper's custom model parameters to translate road preference into actual routing behavior, and explore querying OSM directly for richer road metadata to inform waypoint selection.

### Layer 2: LLM as Cycling Local

Large language models have been trained on vast amounts of cycling-specific content: forum posts, ride reports, route reviews, segment descriptions, cycling blog recommendations, and guidebook text. This means the LLM already "knows" that in Boulder you ride up Flagstaff, that in the Bay Area you take Paradise Loop through Tiburon, and that in Girona you climb Rocacorba via the south side. This collective cycling knowledge has never been structured for routing — but we can extract it.

**What exists today:** The system prompt positions Claude as a knowledgeable cycling friend, and the named waypoint system already supports geocoding specific roads and climbs. However, the LLM is primarily used to suggest compass bearings (directions), not specific roads. Named waypoints only activate when the user explicitly mentions a place.

**Next step:** Enrich the prompt chain so the LLM proactively suggests specific roads, named climbs, and known cycling corridors — even for general queries like "50-mile ride from Mill Valley." The named waypoint and geocoding pipeline already supports this; the LLM just needs to be prompted to use it more aggressively. This turns the LLM from a direction-picker into something closer to asking a local club rider for a recommendation.

### Layer 3: Public GPX Aggregation

A large corpus of cycling routes is already publicly available: Ride With GPS public routes, cycling club websites, gran fondo and event routes, and tourism board cycling itineraries. We can build a pipeline that ingests publicly shared GPX files, extracts the road segments they use, and creates a popularity-weighted overlay on the road network. Roads that appear in many public routes get a higher routing score. This is essentially building our own heatmap from public data. It will not match Strava's coverage, but it will capture the most important roads in popular cycling areas — which is where most users will be generating routes.

**What exists today:** Nothing. This requires a data ingestion pipeline.

**Next step:** Build a prototype scraper for a single source (e.g., publicly shared routes from a popular cycling region) and validate whether the resulting road-frequency data meaningfully improves route quality compared to OSM signals alone.

### Layer 4: User-Contributed Routes Over Time

Every GPX that users export and actually ride is a signal. Over time, if users can optionally share routes back — or even just confirm "I rode this and it was good" — we build our own proprietary dataset. The key insight is that we do not need this layer to launch. It is a flywheel that compounds as the user base grows, and it is what the Phase 3 vision of "community data moat" is built on.

**What exists today:** Nothing. Requires user accounts (v4) and a feedback mechanism.

**Next step:** Design the data model for route feedback early, even if the collection mechanism comes later. Understanding what signals we want to capture (rode it, liked it, modified it, avoided a section) informs decisions made in earlier layers.

### The Segment Library Concept

A concrete implementation that ties these layers together: build a curated library of "known-good segments" — specific roads or stretches that are popular with cyclists. These segments are seeded from public GPX data (Layer 3), LLM knowledge (Layer 2), and OSM cycling route designations (Layer 1). When generating a route, the system tries to route through as many known-good segments as possible, rather than just finding the shortest or flattest path between generic waypoints.

The mental model: instead of asking GraphHopper "get me from A to B on a bike," we ask the LLM "what are the best roads to ride between A and B?", get back specific waypoints on known-good roads, then use GraphHopper to connect them. This is a meaningful shift from direction-based routing to road-quality-based routing.

### Sequencing

Layers 1 and 2 can be improved immediately with prompt engineering and routing parameter changes — no new infrastructure required. Layer 3 requires a data pipeline but can start small (one region, one source). Layer 4 requires user accounts and a feedback loop, aligning naturally with v4 and v5 of the product roadmap. The layers are independent: each one improves route quality on its own, and they compound when combined.

---

## Proposed Iterations

The product will be built in phases, each validating a specific assumption before investing in the next layer. Each version is functional on its own. If an assumption fails at any stage, the product can pivot without wasted effort on layers above.

| Version | Name                                           | Description                                                                                                                                                                                                                        |
| ------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0      | Proof of Concept                               | Validate whether an LLM combined with a cycling-tuned routing engine can produce rideable routes from natural language input. Single text input, route displayed on a map with elevation profile, GPX download.                    |
| v1      | Conversational Route Generation                | Introduce a proper chat interface where the system asks clarifying questions and generates multiple route options. Validate whether conversational UX is a better interaction model than forms and filters.                        |
| v2      | Interactive Route Editing                      | Add drag-to-edit waypoints on the map alongside conversational refinement. Validate whether users can refine generated routes to their satisfaction through a combination of visual and conversational editing.                    |
| v3      | Segments and Points of Interest                | Integrate popular cycling segment data and curated climb databases. Enable route generation that targets specific climbs or popular roads. Validate whether segment-aware routing unlocks the key use case for traveling cyclists. |
| v4      | Accounts, Saved Routes, and Device Integration | Add user accounts, route library, saved preferences, and direct push to GPS cycling computers. Validate whether users build habits and return to the product.                                                                      |
| v5+     | Community Data and Moat Building               | Introduce user-contributed road quality ratings, social route sharing, training integration, weather-aware routing, and a mobile app. Build proprietary data advantages that deepen over time.                                     |

### Sequencing Principle

Each iteration validates the riskiest remaining assumption before adding complexity:

- **v0:** Can we generate rideable routes at all?
- **v1:** Is conversation the right interaction model?
- **v2:** Can users refine routes to their satisfaction?
- **v3:** Does segment targeting unlock the killer use case?
- **v4:** Will people build habits and return?
- **v5+:** Can we build defensible data advantages?

The earliest versions prioritize speed and learning over polish. The goal is to put routes in front of real cyclists as quickly as possible and learn from what they ask for, what they complain about, and where generated routes fall short.
