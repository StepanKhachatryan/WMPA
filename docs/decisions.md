# Decisions

Reasoning worth keeping, so it is not argued twice. Each entry says what was
chosen and what it costs.

## The layers live in PostGIS, not in files

The data must not be downloadable, and it must support GIS logic later
(catchments, routing, overlays). Files in object storage give neither. PostGIS
gives both: `ST_AsMVT` serves the map, and the same tables answer spatial
queries.

Cost: a database that can sleep on a free plan. Mitigated by keeping anything
static in object storage, so a cold database degrades one feature rather than
the whole map.

## Tiles, not GeoJSON

A GeoJSON layer is one file, and one file is one download. Vector tiles are cut
per request, carry only what is on screen, and lose precision at low zoom.

Under ~5 MB a GeoJSON would be simpler, and for a basemap-style layer that never
changes, PMTiles in object storage is cheaper than a database round trip. Both
remain open for layers that do not need protection.

## Neon over Supabase and Aiven

Supabase's free plan allows two projects and both were already used by other
work; the converter's backend already shares one, which is a compromise that
should not be repeated. Aiven's free plan stops instances it considers unused.

Neon: PostGIS on every plan, branches (a dev branch costs nothing and cannot
break production data), no card. Verified figures conflicted between Neon's own
pages — 0.5 GB and 1 GB per project — so confirm before relying on either.

## This repo is separate from the GeoGeeks site

The site is static marketing plus one browser-only tool; this is a client-heavy
map with a backend and a data pipeline. Different cadence, different weight, and
a broken map build must not block a site deploy that carries a paid tool.

What is shared is branding, not code. Copy the colour tokens; do not build a
monorepo for two applications.

## The QGIS plugin is a third repo

Python and TypeScript share no code. The plugin's integration point is this
backend's HTTP API and schema, which it would use identically from any repo. Its
packaging (a `metadata.txt` at the root, releases tied to QGIS versions) wants
its own release rhythm.

Consequence for the API: keep endpoints general-purpose (GeoJSON, MVT) rather
than shaped around the web map's UI, and authenticate with a token the plugin
can send too. CORS covers only browsers; the plugin has none.

## Catchment delineation: precomputed topology, not DEM at request time

Running flow direction and accumulation over a DEM on every click is raster work
— seconds to minutes, large memory, impossible inside a Function.

Instead the river network is split into reaches, each knowing its downstream
reach (`next_down`) and its own unit catchment. A click snaps to the nearest
reach, and the catchment is a recursive walk upstream plus a union — milliseconds
in Postgres:

```sql
with recursive snapped as (
  select id from river_reach
  order by geom <-> st_setsrid(st_makepoint($1, $2), 4326)
  limit 1
),
upstream as (
  select id from snapped
  union all
  select r.id from river_reach r join upstream u on r.next_down = u.id
)
select st_asgeojson(st_union(c.geom)) as watershed,
       round(sum(c.area_km2)::numeric, 1) as area_km2
from upstream u
join river_reach r on r.id = u.id
join unit_catchment c on c.id = r.catchment_id;
```

The index on `next_down` is what makes the walk fast.

Cost: accuracy is bounded by the unit catchment. A click mid-reach returns the
whole containing catchment, not the part above the click. Say so in the
interface rather than implying precision that is not there.

Start from HydroSHEDS (HydroRIVERS already carries `NEXT_DOWN` and `UPLAND_SKM`,
HydroBASINS level 12 gives the polygons) to get the chain working, then replace
it with catchments derived from Copernicus DEM 30 m for Armenia. The table shape
does not change, so the swap touches no application code.

## Canals break natural catchment logic

Catchment delineation assumes water follows terrain. A canal can carry water
across a basin divide, which makes the water balance wrong rather than
imprecise. Keep canals as their own layer with their own topology, show them
with the catchment, and do not fold them into the natural calculation. At
minimum, warn when a catchment is crossed by one.

## Free data worth starting from

HydroSHEDS / HydroRIVERS (river network, basins), JRC Global Surface Water
(surface water 1984 onward), Copernicus DEM, Copernicus Data Space (Sentinel-1
and -2 for flood and water extent), ERA5 (reanalysis). All free, all better
preprocessed once than fetched per request.

## Coordinate systems

DXF has no coordinate system — the format has no group code for a datum or a
projection, only units in later versions. That is why GIS exports write a
companion `.prj`. The same applies here: whatever leaves this platform for CAD
carries its CRS beside it or not at all.

Store in EPSG:4326, reproject to 3857 per tile. Armenian data arrives in
Armenian 1942; do not reproject it silently anywhere a user will measure from.
