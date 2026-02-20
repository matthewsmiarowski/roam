# Roam

AI-powered cycling route generation. Describe the ride you want in plain language, get a rideable route back.

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template and add your API keys:
   ```bash
   cp .env.example .env.local
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

| Variable                       | Service                                                         | Required |
| ------------------------------ | --------------------------------------------------------------- | -------- |
| `ANTHROPIC_API_KEY`            | [Anthropic Console](https://console.anthropic.com/)             | Yes      |
| `GRAPHHOPPER_API_KEY`          | [GraphHopper Dashboard](https://www.graphhopper.com/dashboard/) | Yes      |
| `NEXT_PUBLIC_MAPTILER_API_KEY` | [MapTiler Cloud](https://cloud.maptiler.com/account/keys/)      | Yes      |

### Scripts

| Command                | Description                      |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Start dev server with Turbopack  |
| `npm run build`        | Production build                 |
| `npm run start`        | Start production server          |
| `npm run lint`         | Run ESLint                       |
| `npm run format`       | Format code with Prettier        |
| `npm run format:check` | Check formatting without writing |

## Tech Stack

- **Framework:** Next.js (TypeScript, App Router)
- **Map:** MapLibre GL JS + react-map-gl
- **Map tiles:** MapTiler
- **Charts:** Recharts
- **LLM:** Claude (Anthropic SDK)
- **Routing:** GraphHopper Directions API
- **Geocoding:** Nominatim (OpenStreetMap)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel
