# WMPA — Water Management Platform Armenia

A web GIS platform for water in Armenia: rivers, lakes and canals as live map
layers, with the spatial work done in PostGIS rather than in the browser.

Two clients are planned against one backend — this web map, and a QGIS plugin in
its own repository. They share an HTTP API and a database schema.

The platform is linked from the [GeoGeeks](https://geogeeks.am) tools menu and
opens as its own site.

## Layout

| Path | What |
| --- | --- |
| `neon.ts` | The Neon services: Postgres, the `water` Function, Realtime |
| `neon/water/schema.sql` | PostGIS tables and `water_tile(z, x, y)` |
| `neon/water/index.ts` | The backend: a Hono app on Neon Functions |
| `neon/water/seed-demo.sql` | Two invented features (a river and a lake) for an empty database |
| `index.html`, `src/main.ts`, `src/style.css` | The web map: MapLibre, layer toggles, popups |
| `src/lib/water.ts` | The browser's side of that API |
| `vite.config.ts` | Picks the API URL out of the env by name |
| `scripts/dev-api.ts` | Runs the `water` Function locally on Node |
| `CLAUDE.md` | Architecture, env vars, conventions, how to test without Neon |
| `docs/decisions.md` | Why things are the way they are |

## The API

| Route | Returns |
| --- | --- |
| `GET /health` | Whether the database answers, and its PostGIS version |
| `GET /layers` | Feature counts per layer |
| `GET /tiles/:z/:x/:y` | One vector tile: `rivers`, `lakes`, `canals` |
| `POST /live/layers` | A sealed live query for the Realtime client |

The geometry is only ever served as tiles cut to a request. No route returns a
whole layer.

## Getting it running

```bash
npm install
neon login
neon deploy                     # writes .env.local
psql "$DATABASE_URL" -f neon/water/schema.sql
```

Loading real layers, from shapefiles:

```bash
ogr2ogr -f PostgreSQL PG:"$DATABASE_URL" rivers.shp \
  -nln water_layer -append -t_srs EPSG:4326 \
  -sql "select 'river' as kind, name from rivers"
```

`CLAUDE.md` covers running against a local PostGIS when Neon is unreachable.

### The map, locally

```bash
psql "$DATABASE_URL" -f neon/water/seed-demo.sql   # optional: one river, one lake
npm run dev:api                                      # API on :8787
npm run dev                                          # map on :3000
```

`npm run build` needs `WATER_API_URL` (or `NEON_FUNCTION_WATER_BASE_URL` from
`neon deploy`) and refuses to build without it, so a build never ships pointing
at localhost. The output in `dist/` is static.

## Status

The backend and schema are verified against PostgreSQL 16 with PostGIS 3.4:
tiles decode with the right layers and features, out-of-range tiles are refused,
and CORS headers go only to allowed origins.

The web map draws the tiles in Chromium, toggles each layer, and opens a popup
per feature. It has been seen only against a local database with the demo
features, and without its basemap (the sandbox blocks OpenStreetMap).

Nothing has been deployed to Neon yet, and the Realtime subscription has never
connected.
