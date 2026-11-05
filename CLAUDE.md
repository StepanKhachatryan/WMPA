# WMPA — working notes for Claude

Water Management Platform Armenia. Two clients will talk to one backend: this
web map, and a QGIS plugin (Python, its own repo). They share an HTTP API and a
PostGIS schema, never code — the languages do not meet.

Split off from the GeoGeeks site (`stepankhachatryan/geogeeks`), which links to
this platform from its tools menu but does not host it.

**Hosting.** The map is a static build on Netlify at `https://wmpa.geogeeks.am`
(`netlify.toml`); the API and PostGIS are on Neon, in `aws-eu-central-1`. Steps
in `docs/deploy.md`. A new address for the map means a new entry in
`ALLOWED_ORIGINS`, or the map loads with no layers.

## Architecture

**Static-first.** Anything that can be a file served from object storage is one:
free tiers fail by sleeping, and a page that waits 30 seconds for a cold
database is worse than no page. The database holds only what must be queried.

**The layers never leave as files.** Rivers, lakes and canals live in PostGIS.
The browser receives vector tiles cut to the requested z/x/y, built by
`water_tile(z, x, y)`. There is deliberately no endpoint that returns a whole
layer.

Be honest about what that protection is: a commercial boundary, not a
cryptographic one. Tiles a browser can draw are tiles a determined visitor can
collect. What it does buy: no bulk download, token and rate limiting, reduced
precision at low zoom, and provenance if the data turns up elsewhere. If the
requirement ever becomes "the data must not leave our control at all", the
answer is not a map — it is computing server-side and returning only results.

## Services (Neon)

Declared in `neon.ts`. Provision with `neon login`, then `neon deploy`, which
writes the variables below into `.env.local`.

| Variable | What |
| --- | --- |
| `DATABASE_URL` | Pooled connection, injected into Functions |
| `DATABASE_URL_UNPOOLED` | Direct, for session-level features |
| `NEON_FUNCTION_WATER_BASE_URL` | The `water` Function's public URL |
| `NEON_REALTIME_URL` | WebSocket endpoint for the browser client |
| `NEON_REALTIME_SECRET` | Server-only; seals live queries. Never ship it to a browser |

`neon deploy` writes all of these into `.env.local`, but the deployed Functions
runtime does not inject all of them: the first deploy (2026-11-04) failed to
load with `NEON_REALTIME_SECRET is missing`. So the Function requires only
`DATABASE_URL` and treats Realtime as optional (`/live/layers` answers 503
without it). Anything else made required at module load can fail the same way;
when a deploy shows `failed`, `neon functions get <slug> --output json` has the
load error.

Read them through `parseEnv(config, [...])` from `@neon/env` rather than
`process.env` directly: the names come from `neon.ts` and stay in step with it.

**Driver rule.** Inside Neon Functions use `pg` (node-postgres) with the pool at
module scope and `attachDatabasePool(pool)` — the isolate is long-lived and
reuses it. The `@neondatabase/serverless` driver is for edge runtimes, which
this is not.

**Region.** Functions, Realtime and Object Storage exist only in
`aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, `aws-ap-southeast-1`.
Check the project's region before promising any of them.

## Status

Written and verified against a local PostGIS 3.4:

- `neon/water/schema.sql` — `water_layer` table and `water_tile(z, x, y)`,
  returning one MVT with `rivers`, `lakes` and `canals` as separate layers.
- `neon/water/index.ts` — Hono app: `/health`, `/layers`, `/tiles/:z/:x/:y`,
  `/live/layers` (a sealed Realtime query).
- `neon/water/seed-demo.sql` — one invented river and one invented lake
  (`Պայմանական գետ`, `Պայմանական լիճ`) in Shirak. Placeholders, not data.
- `src/main.ts` — the web map (Vite + MapLibre GL). Water layers are in the
  initial style, not added on `load`, so a blocked basemap cannot hold them back.
- `src/lib/water.ts` — the browser's side of that API.

Deployed: the `water` Function on Neon, project `WMPA` (`aws-eu-central-1`,
branch `main`, PostGIS 3.6.4), with the demo river and lake applied by
`npm run db:apply`. `/health` and `/layers` answer from outside (2026-11-05):
`https://br-summer-haze-b9dii8xq-water.compute.c-7.eu-central-1.aws.neon.tech`.

Not done: Netlify has not been deployed (`docs/deploy.md`), Realtime has no
secret in the deployed runtime and has never connected, and the basemap is OpenStreetMap's own tile server, which its policy
allows for light use only — replace it before launch.

## Testing without Neon

Neon's hosts are blocked from some sandboxes, and a local PostGIS proves the SQL
either way:

```bash
apt-get install -y postgresql-16-postgis-3
initdb -D /var/tmp/pg/data -U postgres
pg_ctl -D /var/tmp/pg/data -o '-p 5433' start
createdb -h 127.0.0.1 -p 5433 -U postgres water
psql -h 127.0.0.1 -p 5433 -U postgres -d water -f neon/water/schema.sql
```

Then point `DATABASE_URL` at it and `npm run dev:api` serves the same Hono app
on Node, with a request log; `npm run dev` serves the map on :3000, the dev
origin the API's CORS list allows. A
Realtime secret for local use must be well-formed or `createRealtime` throws:
`nrt_live_1` followed by 32 random bytes as base64url.

In a headless browser here, `load` waits on the blocked basemap; abort its
requests (Playwright `page.route`) rather than waiting out tunnel failures.

Decode a tile to check it rather than trusting its byte count —
`@mapbox/vector-tile` with `pbf` reports the layers and their features.

## Conventions

Comments explain why, not what. Keep them where the reasoning is not obvious
from the code, and leave the obvious alone.
