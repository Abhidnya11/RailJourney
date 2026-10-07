# RailJourney

Live Indian Railways train tracking in the browser. Search any train, watch it move on a map, and see its delay,
next halts, the weather and the terrain along the route.

React + Vite front end, Fastify API. Real data from [RailRadar](https://railradar.in/docs), OpenWeather,
OpenTopography and MapTiler. The UI follows the Stitch designs in [`design/stitch`](design/stitch).

## Features

- **Search** any Indian Railways train by number or name, with recent searches and starred (pinned) trains.
- **Live tracking** — position on a dark MapLibre map, delay, ETA to the next halt, distance to go, progress along
  the corridor, and the list of halts with platforms. Diversions and cancellations show as a banner.
- **Weather & Terrain** — one switch: weather at the current station, next halt and destination, or an elevation
  graph of the whole route with the train's position.
- **ETA alerts** — an opt-in browser notification when the next halt's ETA moves by 5 minutes or more
  (works while the page is open).
- **Share** a trip with a link (kept in memory, 48 hours).
- **Responsive** — phone to desktop, with the same top navigation everywhere.

## Quick start

Needs Node 24 or newer.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:5173. The API runs on port 8787 and Vite proxies `/api` to it.

With no keys, `TRAIN_PROVIDER=mock` serves 8 simulated trains (try `12951`), so everything works offline.
To use real data, fill in `.env` as below.

### Real data

```bash
TRAIN_PROVIDER=railradar
RAILRADAR_BASE_URL=https://api.railradar.in/v1
RAILRADAR_API_KEY=...
OPENWEATHER_API_KEY=...
OPENTOPOGRAPHY_API_KEY=...
VITE_MAPTILER_KEY=...
```

| Variable | Used for | Where to get it |
| --- | --- | --- |
| `RAILRADAR_API_KEY`, `RAILRADAR_BASE_URL` | Train search, schedule, route and live status | [railradar.in](https://railradar.in/docs) developer dashboard |
| `OPENWEATHER_API_KEY` | Current weather at stations and under the train | [openweathermap.org/api](https://openweathermap.org/api) |
| `OPENTOPOGRAPHY_API_KEY` | 30 m ground elevation for stations | [opentopography.org](https://opentopography.org) |
| `VITE_MAPTILER_KEY` | Basemap tiles (no key = plain dark canvas) | [maptiler.com](https://www.maptiler.com) |

Server keys never reach the browser. **`VITE_MAPTILER_KEY` does** — restrict it to your domains in the MapTiler
dashboard. Never commit `.env` (it is git-ignored). Restart the dev servers after editing it.

All other settings (cache lifetimes, poll interval, rate limits, freshness thresholds) are documented in
[`.env.example`](.env.example).

## Free-tier limits

| Service | Limit | What the app does |
| --- | --- | --- |
| RailRadar | 1,000 requests / month | Caches search, schedules and routes for hours and live data for seconds. One open live page still polls about twice a minute, so raise `CLIENT_LIVE_POLL_MS` and `LIVE_CACHE_TTL_SECONDS` (and the `FRESHNESS_*` values with them) if you run out. |
| OpenTopography | 50 calls / day | Used only for the few fixed station altitudes, cached on disk in `.cache/`. Once the limit is hit it is not called again for an hour. |
| Open-Meteo (no key) | free for non-commercial use ([terms](https://open-meteo.com/en/terms)) | Serves the terrain graph (60 points in one request) and the train's own altitude, and fills in for OpenTopography. Set `ELEVATION_FALLBACK=false` to use OpenTopography only. |

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Web (Vite, :5173) and API (tsx watch, :8787) together |
| `npm run dev:web` / `npm run dev:api` | Either one on its own |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (server and client unit tests) |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run preview:prod` | Build, then serve the build on :4173 with the API |
| `npm run format` | Prettier |

CI (`.github/workflows/ci.yml`) runs type-check, lint, tests and build on every push and pull request.

## How it fits together

```
src/                 React app
  features/          live-journey, home, search, journey-map, alerts, favourites, …
  components/        layout (header, footer), ui atoms
  styles/            tokens, layout, components, home (plain CSS)
server/              Fastify API
  providers/         railradar, openweather, opentopography, openmeteo, mock
  modules/           journeys (live, route, terrain), trains, sharing
shared/              Types and Zod schemas used by both sides
design/stitch/       HTML + screenshots of the Stitch screens
```

The browser only talks to `/api/*`. The API calls the data providers, validates every response with Zod, caches it,
and returns the app's own types — provider-specific fields never leave `server/providers`. Route geometry work
(splitting the route at the train, sampling points for the terrain graph) uses [Turf.js](https://turfjs.org).

## Known limitations

- **No live speed.** RailRadar does not report a speed for running trains (it sends 0 or nothing), so the speed
  tile shows "—" rather than a made-up number.
- **Alerts need the page open.** There is no push notification service.
- **Shared links live in memory.** They are lost when the API restarts.
- **No deployment setup yet.** The API does not serve the built front end, and there is no Docker or hosting config.
- **Nearby places** (the Overpass provider) are declared but not implemented.

## License

No license has been chosen yet.
