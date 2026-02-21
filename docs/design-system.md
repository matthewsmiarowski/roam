# Roam Design System

## Design Principles

1. **Map is the hero.** The route visualization is the product. Every UI element exists to support the map, not compete with it. Chrome stays lean; data stays close.

2. **Confidence through clarity.** A cyclist needs to trust the route before riding it. Stats are bold and scannable. Elevation is honest. The UI never obscures critical information.

3. **Energy, not noise.** The brand is athletic and direct — high contrast, strong type, decisive color. But restraint matters: every element earns its place.

4. **Speed matches the sport.** Interactions feel immediate. Loading states communicate progress. Transitions are quick and purposeful — no lazy fades or decorative animation.

5. **One screen, one job.** v0 is a single-page app. No navigation, no settings sprawl. Prompt → Route → Ride.

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

### Map-Specific

| Token                        | Light Value | Usage                                            |
| ---------------------------- | ----------- | ------------------------------------------------ |
| `--color-route-line`         | `#E8503A`   | Route polyline on map                            |
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

The app is a single full-viewport screen. The map fills the available space; all other UI overlays or docks to the edges.

```
┌──────────────────────────────────────────┐
│  ┌─ Prompt Input ─────────────────────┐  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌─ Sidebar ──┐                          │
│  │ Stats      │         MAP              │
│  │ GPX btn    │     (fills viewport)     │
│  └────────────┘                          │
│                                          │
│  ┌─ Elevation Profile ───────────────┐   │
│  └───────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

- **Prompt input:** Floats at top-center, overlaying the map. Full width minus generous horizontal margin. `--shadow-lg`.
- **Sidebar:** Docked left, semi-transparent or solid surface background. Contains route stats and GPX download. Collapses or hides when no route is loaded.
- **Elevation profile:** Docked to bottom, spans full width. ~120–160px tall. Appears after route generation.
- **Map:** Fills the entire viewport behind all overlays. `z-index: 0`.

### Responsive Notes (Future)

Desktop-first for v0. When mobile is added:

- Prompt input goes full-width with reduced padding.
- Sidebar becomes a bottom sheet.
- Elevation profile stacks below the map instead of overlaying.

### Z-Index Scale

| Layer    | z-index | Contents                       |
| -------- | ------- | ------------------------------ |
| Map      | 0       | MapLibre canvas                |
| Overlays | 10      | Elevation profile, sidebar     |
| Controls | 20      | Prompt input, floating buttons |
| Modals   | 30      | Error displays, confirmations  |
| Loading  | 40      | Full-screen loading overlay    |

---

## Component Guidelines

### Prompt Input

- Large, inviting text input — this is the primary interaction point.
- Placeholder text sets the tone: _"Describe your ride — e.g., 60km hilly loop from Girona"_
- Submit via button or Enter key.
- `--radius-lg`, `--shadow-lg`. Feels like a search bar, not a form field.
- Disabled state with reduced opacity during route generation.

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

### Map

- MapLibre GL JS with MapTiler vector tiles.
- Route line: `--color-route-line`, 4px width, with 6px `--color-route-line-outline` behind for legibility.
- Start/end markers: simple circles with border, colored per `--color-route-start` / `--color-route-end`.
- Map controls (zoom, compass) use MapLibre defaults — don't fight the library.
- Auto-fit bounds to route with padding after generation.

### GPX Download Button

- Secondary action — not the hero. Positioned in the sidebar below stats.
- Outlined or ghost style button. Accent color on hover/press.
- Icon + label: download icon + "Export GPX".

### Loading State

- Displayed during route generation (can take 5–15 seconds).
- Sliding accent-colored progress bar in a centered card over a semi-transparent overlay.
- Status text: "Generating route…"
- Map stays visible underneath (don't blank the screen).

### Start Point Badge

- Pill-shaped badge that appears below the prompt input when the user clicks the map to set a start point.
- Shows coordinates in `lat, lng` format (4 decimal places) with a MapPin icon.
- Clear button (X) removes the start point.
- `--radius-full`, `--color-accent-subtle` background, `--color-accent-text` text.
- Only visible in `idle` and `error` states — hidden once a route is generated.

### Error Display

- Inline error banner, not a modal. Appears below the prompt input.
- `--color-error` left border or background tint.
- Concise message + optional retry button.
- Dismissible.

---

## Motion

Keep it fast and functional. The sport is cycling, not ballet.

| Property                 | Duration | Easing        | Usage                           |
| ------------------------ | -------- | ------------- | ------------------------------- |
| Color, opacity           | 120ms    | `ease-out`    | Hover states, focus rings       |
| Transform (slide, scale) | 200ms    | `ease-out`    | Panel open/close, element entry |
| Layout (height, width)   | 250ms    | `ease-in-out` | Elevation profile expand        |

- No motion for route line drawing — let MapLibre handle map animations natively.
- Loading spinner/pulse: continuous, 1.5s cycle, `ease-in-out`.
- `prefers-reduced-motion: reduce` — collapse all transitions to instant.

---

## Iconography

- Use Lucide icons (open source, tree-shakable, consistent stroke style).
- 20px default size, 1.5px stroke.
- Icons are always paired with text labels in v0 — no icon-only buttons except map controls and the prompt submit button (which uses `aria-label` for accessibility).

---

## Accessibility

- All interactive elements have visible focus rings: 2px `--color-accent` outline, 2px offset.
- Color contrast: minimum WCAG AA (4.5:1 for body text, 3:1 for large text and UI components).
- `--color-accent` (#E8503A) on white (#FFFFFF) = 4.0:1 — use `--color-accent-text` (#C13A27 = 4.9:1) for text.
- Elevation profile and route stats don't rely on color alone — values are always shown as text.
- Prompt input has a visible label (can be the placeholder if styled accessibly, but `aria-label` is required).
- Map: provide a text summary of the route below the map for screen readers.
- Loading state: `aria-live="polite"` on status text.
- Keyboard: Tab navigates prompt → submit → stats → GPX download. Escape dismisses errors.
