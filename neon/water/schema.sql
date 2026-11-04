-- Layers for the water GIS tool.
--
-- The geometry never leaves the database as a file: the Function returns vector
-- tiles cut to the requested z/x/y, so there is no endpoint that hands over a
-- whole layer. Everything is stored in EPSG:4326 and reprojected to 3857 per
-- tile, which is what the MVT spec expects.

create extension if not exists postgis;

create table if not exists water_layer (
  id         bigserial primary key,
  kind       text not null check (kind in ('river', 'lake', 'canal')),
  name       text,
  -- Mixed geometry: rivers and canals are lines, lakes are polygons.
  geom       geometry(Geometry, 4326) not null,
  updated_at timestamptz not null default now()
);

create index if not exists water_layer_geom_idx on water_layer using gist (geom);
create index if not exists water_layer_kind_idx on water_layer (kind);

-- One tile, all three layers. Each kind becomes its own MVT layer inside the
-- tile, so the map can style and toggle them separately. Written out per kind
-- rather than grouped: ST_AsMVT takes the layer name as an argument, and the
-- row it aggregates must not carry the discriminator as a property.
create or replace function water_tile(z integer, x integer, y integer)
returns bytea
language sql
stable
parallel safe
as $$
  with env as (
    select st_tileenvelope(z, x, y) as g
  ),
  rivers as (
    select st_asmvt(q, 'rivers', 4096, 'geom') as mvt
    from (
      select w.id, w.name,
             st_asmvtgeom(st_transform(w.geom, 3857), env.g, 4096, 64, true) as geom
      from water_layer w, env
      where w.kind = 'river' and w.geom && st_transform(env.g, 4326)
    ) q
    where q.geom is not null
  ),
  lakes as (
    select st_asmvt(q, 'lakes', 4096, 'geom') as mvt
    from (
      select w.id, w.name,
             st_asmvtgeom(st_transform(w.geom, 3857), env.g, 4096, 64, true) as geom
      from water_layer w, env
      where w.kind = 'lake' and w.geom && st_transform(env.g, 4326)
    ) q
    where q.geom is not null
  ),
  canals as (
    select st_asmvt(q, 'canals', 4096, 'geom') as mvt
    from (
      select w.id, w.name,
             st_asmvtgeom(st_transform(w.geom, 3857), env.g, 4096, 64, true) as geom
      from water_layer w, env
      where w.kind = 'canal' and w.geom && st_transform(env.g, 4326)
    ) q
    where q.geom is not null
  )
  select coalesce((select mvt from rivers), ''::bytea)
      || coalesce((select mvt from lakes),  ''::bytea)
      || coalesce((select mvt from canals), ''::bytea);
$$;
