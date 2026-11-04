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
| `src/lib/water.ts` | The browser's side of that API |
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

## Status

The backend and schema are written and verified against PostgreSQL 16 with
PostGIS 3.4: tiles decode with the right layers and features, out-of-range tiles
are refused, and the sealed Realtime query is produced. Nothing has been
deployed to Neon yet, and there is no frontend.
