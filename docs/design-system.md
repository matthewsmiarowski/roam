# Roam Design System

## Design Principles

1. **Map is the hero.** The route visualization is the product. Every UI element exists to support the map, not compete with it. Chrome stays lean; data stays close.

2. **Confidence through clarity.** A cyclist needs to trust the route before riding it. Stats are bold and scannable. Elevation is honest. The UI never obscures critical information.

3. **Energy, not noise.** The brand is athletic and direct — high contrast, strong type, decisive color. But restraint matters: every element earns its place.

4. **Speed matches the sport.** Interactions feel immediate. Loading states communicate progress. Transitions are quick and purposeful — no lazy fades or decorative animation.

5. **One screen, one job.** Single-page app. No navigation, no settings sprawl. Chat → Compare → Ride.

---

## Color System

Colors are defined as CSS custom properties on `:root` for light mode. The system is structured so a `[data-theme="dark"]` override can be added later without changing component code.

### Core Palette

| Token                    | Light Value | Usage                            |
| ------------------------ | ----------- | -------------------------------- |
| `--color-bg`             | `#FAFAFA`   | Page background                  |
| `--color-surface`        | `#FFFFFF`   | Cards, panels, input fields      |
| `--color-surface-raised` | `#F5F5F5`   | Hover states, secondary surfaces |
| `--color-border`         | `#E0E0E0`   | Dividers, input borders          |
| `--color-border-strong`  | `#BDBDBD`   | Focused input borders            |

### Text

| Token                    | Light Value | Usage                           |
| ------------------------ | ----------- | ------------------------------- |
| `--color-text-primary`   | `#1A1A1A`   | Headings, primary content       |
| `--color-text-secondary` | `#616161`   | Labels, supporting text         |
| `--color-text-tertiary`  | `#9E9E9E`   | Placeholders, disabled text     |
| `--color-text-inverse`   | `#FFFFFF`   | Text on accent/dark backgrounds |

### Accent — Electric Coral

The primary accent is a vivid red-orange that reads as energetic and athletic. It has strong contrast on both light UI surfaces and map tiles (terrain greens, road grays, water blues).

| Token                   | Light Value | Usage                                      |
| ----------------------- | ----------- | ------------------------------------------ |
| `--color-accent`        | `#E8503A`   | Primary buttons, route line, active states |
| `--color-accent-hover`  | `#D4402C`   | Button hover, interactive hover            |
| `--color-accent-subtle` | `#FDF0EE`   | Accent backgrounds, selected states        |
| `--color-accent-text`   | `#C13A27`   | Accent-colored text (meets AA on white)    |

### Semantic

| Token             | Light Value | Usage                               |
| ----------------- | ----------- | ----------------------------------- |
| `--color-success` | `#2E7D32`   | Positive feedback                   |
| `--color-warning` | `#F57C00`   | Caution states                      |
| `--color-error`   | `#D32F2F`   | Error messages, destructive actions |

### Route Options

Three distinct colors for the 3-route comparison view. Each route option gets a consistent color across the route card, map polyline, and detail view.

| Token                    | Light Value | Usage                       |
| ------------------------ | ----------- | --------------------------- |
| `--color-route-option-1` | `#E8503A`   | First route option (coral)  |
| `--color-route-option-2` | `#2979FF`   | Second route option (blue)  |
| `--color-route-option-3` | `#7B1FA2`   | Third route option (purple) |

### Chat

| Token                      | Light Value                   | Usage                        |
| -------------------------- | ----------------------------- | ---------------------------- |
| `--color-chat-user-bubble` | `var(--color-accent-subtle)`  | User message background      |
| `--color-chat-ai-bubble`   | `var(--color-surface-raised)` | Assistant message background |

### Map-Specific

| Token                        | Light Value | Usage                                            |
| ---------------------------- | ----------- | ------------------------------------------------ |
| `--color-route-line`         | `#E8503A`   | Route polyline on map (single-route mode)        |
| `--color-route-line-outline` | `#FFFFFF`   | Route line outer stroke (legibility on any tile) |
| `--color-route-start`        | `#2E7D32`   | Start marker                                     |
| `--color-route-end`          | `#E8503A`   | End marker (same as start for loops)             |
| `--color-elevation-fill`     | `#E8503A`   | Elevation chart area fill (at ~20% opacity)      |
| `--color-elevation-stroke`   | `#E8503A`   | Elevation chart line                             |

---

## Typography

Use the system font stack for performance and native feel. The type scale is compact — a cycling app, not a blog.

### Font Stack

```css
--font-sans:
  ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
  sans-serif;
--font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
```

### Type Scale

| Name         | Size | Weight | Line Height | Usage                                      |
| ------------ | ---- | ------ | ----------- | ------------------------------------------ |
| `display`    | 28px | 800    | 1.1         | App title / brand                          |
| `heading`    | 20px | 700    | 1.2         | Section headings                           |
| `subheading` | 14px | 700    | 1.3         | Stat labels, card headers                  |
| `body`       | 15px | 400    | 1.5         | General text, descriptions                 |
| `body-small` | 13px | 400    | 1.4         | Secondary info, captions                   |
| `stat-value` | 24px | 800    | 1.1         | Numeric stat display (distance, elevation) |
| `stat-unit`  | 13px | 600    | 1.1         | Unit labels (km, m, %)                     |
| `mono`       | 13px | 500    | 1.4         | Coordinates, technical values              |

### Type Principles

- **Stats are the loudest text.** `stat-value` is extra-bold and large — a cyclist glances at distance and elevation first.
- **Labels are quiet.** `subheading` and `stat-unit` use weight, not size, to establish hierarchy.
- **All caps sparingly.** Permitted for `stat-unit` and short labels (e.g., "DISTANCE", "ELEVATION"). Never for sentences.
- **Tabular numerals.** Use `font-variant-numeric: tabular-nums` on all stat values so numbers don't shift width during loading.

---

## Spacing

An 8px base grid with a 4px half-step for tight adjustments.

| Token       | Value | Usage                                          |
| ----------- | ----- | ---------------------------------------------- |
| `--space-1` | 4px   | Tight gaps (icon-to-label, stat value-to-unit) |
| `--space-2` | 8px   | Default inner padding, compact gaps            |
| `--space-3` | 12px  | Input padding, small card padding              |
| `--space-4` | 16px  | Standard card padding, section gaps            |
| `--space-5` | 20px  | Panel padding                                  |
| `--space-6` | 24px  | Section separation                             |
| `--space-8` | 32px  | Major section breaks                           |

---

## Border Radius

| Token           | Value  | Usage                                |
| --------------- | ------ | ------------------------------------ |
| `--radius-sm`   | 6px    | Buttons, badges, small elements      |
| `--radius-md`   | 10px   | Cards, panels, inputs                |
| `--radius-lg`   | 16px   | Modal-like containers, prompt input  |
| `--radius-full` | 9999px | Circular elements (markers, avatars) |

---

## Shadows

Minimal shadows. The bold type and strong borders carry hierarchy — shadows are reserved for elements that float above the map.

| Token         | Value                         | Usage                               |
| ------------- | ----------------------------- | ----------------------------------- |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.08)`  | Subtle lift (buttons, inputs)       |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.10)` | Panels overlaying the map           |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.12)` | Prompt input bar, floating controls |

---

## Layout

### Structure

The app is a single full-viewport screen with a chat panel on the left and a map filling the remaining space.

```
┌──────────────────────────────────────────────────┐
│  ┌─ Chat Panel (400px) ─┐  ┌─ Map ─────────────┐│
│  │ [Roam]         [New] │  │                    ││
│  │                      │  │  MapLibre GL       ││
│  │ AI: "Hey! Tell me.." │  │  (multi-route w/   ││
│  │ User: "60km from..." │  │   hover highlight) ││
│  │ AI: "Great! Here..." │  │                    ││
│  │ [RouteCard]          │  │                    ││
│  │ [RouteCard]          │  │                    ││
│  │ [RouteCard]          │  │                    ││
│  │                      │  │                    ││
│  │ ┌─ Input ──────────┐ │  │ ┌─ Elevation ────┐││
│  │ │ Describe ride... │ │  │ └────────────────┘││
│  │ └─────────────────┘ │  └────────────────────┘│
│  └──────────────────────┘                        │
└──────────────────────────────────────────────────┘
```

- **Chat panel:** Fixed 400px left side, full height. Contains message list (scrollable), route cards, route detail, and input pinned to bottom. `--shadow-md` border-right divider.
- **Map:** Fills the remaining viewport to the right. Shows all 3 route options in distinct colors (options phase), or a single selected route (detail phase). Hover over a route card highlights the corresponding route on the map.
- **Elevation profile:** Docked to bottom of the map area, spans the map width. ~140px tall. Appears when a route is selected (detail phase only).
- **Start point:** Map-click sets a start marker with a ping animation. Coordinates shown as a note above the input bar.

### Responsive Notes (Future)

Desktop-first. When mobile is added:

- Chat panel becomes a bottom sheet over the map.
- Elevation profile stacks below the map instead of overlaying.

### Z-Index Scale

| Layer    | z-index | Contents                      |
| -------- | ------- | ----------------------------- |
| Map      | 0       | MapLibre canvas               |
| Overlays | 10      | Elevation profile, chat panel |

---

## Component Guidelines

### Chat Panel

- Fixed 400px left-side container, full viewport height.
- Header: "Roam" heading + "New" reset button.
- Scrollable message area in the middle.
- Start point note (coordinates) shown above the input when set via map click.
- Chat input pinned to bottom with border-top divider.
- `--color-surface` background, `--shadow-md` on the right border.

### Chat Message

- User messages: right-aligned, `--color-chat-user-bubble` background.
- Assistant messages: left-aligned, `--color-chat-ai-bubble` background.
- Max width 85% of the chat panel. `--radius-md` corners.
- 14px body text, `whitespace-pre-wrap` to preserve newlines.
- Assistant messages with routes embed a `RouteCardGroup` below the text.

### Chat Input

- Auto-resizing textarea (1–4 rows, max 120px) + send button.
- `--radius-md` border, `--color-border` default, `--color-border-strong` on focus.
- Send button: accent-colored circle with Send icon. Disabled when empty or generating.
- Submit via button click or Enter key (Shift+Enter for newline).

### Typing Indicator

- Three-dot pulse animation shown while waiting for AI response.
- Dots are 7px circles, `--color-text-tertiary`, staggered animation (0.2s delay each).
- `aria-live="polite"` with screen-reader-only "Roam is thinking…" text.

### Route Card

- Compact button-style card for each of the 3 route options.
- Color swatch (12px circle) + route name in bold.
- Stats row: distance (km), elevation (m), estimated ride time, difficulty badge.
- One-line description below stats.
- Hover: border strengthens, subtle shadow, "Click to select" hint appears.
- Mouse enter/leave triggers route highlight on the map.

### Route Card Group

- Vertical stack of 3 RouteCard components with `--space-2` gap.
- Embedded within assistant chat messages that have route options.

### Route Detail

- Shown inline in the chat panel when a route is selected.
- "Back to options" link with chevron icon.
- Route name with color swatch, description, estimated ride time.
- Full route stats (distance km/mi, elevation m/ft).
- GPX download button with route-named filename.

### Difficulty Badge

- Color-coded pill on route cards indicating climbing difficulty.
- Based on elevation gain per km: Easy (< 10 m/km, green), Moderate (10-15, orange), Hard (15-20, coral), Brutal (> 20, red).
- 11px font, `--radius-full`, white text on colored background.

### Estimated Ride Time

- Shown on route cards and route detail.
- Formula: base speed 25 km/h, minus 1 km/h per 10 m/km climbing ratio (minimum 10 km/h).
- Displayed as "Xh Ym" or just "Ym" for short rides.

### Route Stats

- Displayed as a compact stat grid: distance (km/mi) and elevation gain (m/ft).
- Each stat: large `stat-value` number + small `stat-unit` label below.
- Use `font-variant-numeric: tabular-nums` so numbers are stable.
- Border divider between distance and elevation rows.

### Elevation Profile

- Area chart using Recharts.
- Fill: `--color-elevation-fill` at 20% opacity. Stroke: `--color-elevation-stroke` at 2px.
- X-axis: distance (km). Y-axis: elevation (m).
- Clean grid lines, minimal tick labels. No chart junk.
- Background: `--color-surface` with `--shadow-md` when overlaying the map.
- Docked to bottom of map area (not chat panel). Only visible in detail phase.

### Map

- MapLibre GL JS with MapTiler vector tiles.
- **Multi-route mode (options phase):** 3 routes displayed simultaneously, each in its route option color. Route outline 6px white, route line 4px colored.
- **Hover highlight:** When a route card is hovered, that route thickens (5px line, 8px outline) and others dim to 30% opacity.
- **Single-route mode (detail phase):** Only the selected route is shown; others hidden.
- Start marker: green circle (`--color-route-start`), shared across all routes.
- Start point marker (from map click): accent-colored circle with ping animation.
- Map-click sets start point only in `chatting` phase (cursor: crosshair).
- Auto-fit bounds to all visible routes with padding.

### GPX Download Button

- Secondary action — outlined style button. Accent color on hover/press.
- Icon + label: download icon + "Export GPX".
- Accepts optional `filename` prop for route-named downloads (e.g., `roam-northern-hills.gpx`).

---

## Motion

Keep it fast and functional. The sport is cycling, not ballet.

| Property                 | Duration | Easing        | Usage                           |
| ------------------------ | -------- | ------------- | ------------------------------- |
| Color, opacity           | 120ms    | `ease-out`    | Hover states, focus rings       |
| Transform (slide, scale) | 200ms    | `ease-out`    | Panel open/close, element entry |
| Layout (height, width)   | 250ms    | `ease-in-out` | Elevation profile expand        |

- No motion for route line drawing — let MapLibre handle map animations natively.
- Typing indicator dots: 1.4s cycle, `ease-in-out`, staggered 0.2s per dot.
- Start point ping: 1.5s cycle, `ease-out`, scales from 1x to 2.5x with opacity fade.
- `prefers-reduced-motion: reduce` — collapse all transitions to instant.

---

## Iconography

- Use Lucide icons (open source, tree-shakable, consistent stroke style).
- 20px default size, 1.5px stroke.
- Icons are always paired with text labels — no icon-only buttons except map controls and the chat send button (which uses `aria-label` for accessibility).

---

## Accessibility

- All interactive elements have visible focus rings: 2px `--color-accent` outline, 2px offset.
- Color contrast: minimum WCAG AA (4.5:1 for body text, 3:1 for large text and UI components).
- `--color-accent` (#E8503A) on white (#FFFFFF) = 4.0:1 — use `--color-accent-text` (#C13A27 = 4.9:1) for text.
- Elevation profile and route stats don't rely on color alone — values are always shown as text.
- Chat input has `aria-label="Chat message"`.
- Typing indicator uses `aria-live="polite"` with screen-reader-only "Roam is thinking…" text.
- Send and reset buttons have `aria-label` attributes.
- Chat panel auto-scrolls to latest message using smooth scrollIntoView.
