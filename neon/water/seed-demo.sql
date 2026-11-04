-- Demo features: one invented river and one invented lake, so the map has
-- something to draw before real layers are loaded. Neither exists. They sit in
-- Shirak, over the area of the 2022 qgis2web map, and are named as placeholders
-- so they cannot be mistaken for surveyed data.
--
-- Safe to run repeatedly: it replaces only these two rows. Do not run it on a
-- branch that holds real data you intend to publish.

begin;

delete from water_layer
where name in ('Պայմանական գետ', 'Պայմանական լիճ');

-- The river's last vertex is the lake's westernmost vertex, so it visibly
-- flows into the lake rather than stopping short of it.
insert into water_layer (kind, name, geom) values
(
  'lake',
  'Պայմանական լիճ',
  st_geomfromtext(
    'POLYGON((43.874 40.661, 43.878 40.666, 43.886 40.669, 43.894 40.667,
              43.898 40.661, 43.895 40.655, 43.887 40.652, 43.879 40.654,
              43.874 40.661))',
    4326)
),
(
  'river',
  'Պայմանական գետ',
  st_geomfromtext(
    'LINESTRING(43.800 40.700, 43.812 40.694, 43.821 40.696, 43.833 40.688,
                43.842 40.684, 43.851 40.676, 43.858 40.672, 43.866 40.666,
                43.874 40.661)',
    4326)
);

commit;
