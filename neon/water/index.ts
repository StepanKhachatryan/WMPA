/**
 * The water GIS backend: the only thing that touches the layer geometry.
 *
 * The site is a static export with no server of its own, so the browser calls
 * this Function directly. It returns vector tiles cut to the requested z/x/y --
 * there is deliberately no route that hands back a whole layer, so the source
 * files stay inside the database.
 *
 * Postgres comes from the injected DATABASE_URL, Realtime from the injected
 * secret; both names are derived from `neon.ts` by `parseEnv`, not hard-coded.
 */

import { attachDatabasePool } from '@neon/functions';
import { parseEnv } from '@neon/env';
import { createRealtime, rawSql } from '@neon/realtime/server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Pool } from 'pg';
import config from '../../neon';

const { postgres, realtime } = parseEnv(config, ['DATABASE_URL', 'NEON_REALTIME_SECRET']);

// Module scope: the isolate is long-lived, so the pool is reused across
// requests. `max` stays small because every isolate keeps its own.
const pool = new Pool({ connectionString: postgres.databaseUrl, max: 5 });
attachDatabasePool(pool);

const live = createRealtime({ secret: realtime.secret, db: 'neondb' });

/** Only the site may call this from a browser; anything else gets no CORS. */
const ALLOWED_ORIGINS = [
  'https://geogeeks.am',
  'https://www.geogeeks.am',
  'http://localhost:3000',
];

type LayerKind = 'river' | 'lake' | 'canal';
type LayerRow = { kind: LayerKind; features: number; updated_at: string | null };

const app = new Hono();

app.use('/*', cors({ origin: ALLOWED_ORIGINS, allowMethods: ['GET', 'POST', 'OPTIONS'] }));

/** Proves the function is up and the database answers, without leaking schema. */
app.get('/health', async (c) => {
  const { rows } = await pool.query<{ postgis: string }>('select postgis_version() as postgis');
  return c.json({ ok: true, postgis: rows[0]?.postgis ?? null });
});

/** What the map can draw, and how much of it there is. */
app.get('/layers', async (c) => {
  const { rows } = await pool.query<LayerRow>(
    `select kind, count(*)::int as features, max(updated_at) as updated_at
     from water_layer group by kind order by kind`,
  );
  return c.json({ layers: rows });
});

/**
 * One vector tile. The bytes are built in Postgres by `water_tile`, so the
 * geometry is cut, simplified and stripped of anything the map does not draw
 * before it ever leaves the database.
 */
app.get('/tiles/:z/:x/:y', async (c) => {
  const z = Number(c.req.param('z'));
  const x = Number(c.req.param('x'));
  const y = Number(c.req.param('y').replace(/\.(mvt|pbf)$/, ''));

  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22) {
    return c.json({ error: 'bad tile' }, 400);
  }
  const span = 2 ** z;
  if (x < 0 || x >= span || y < 0 || y >= span) return c.json({ error: 'bad tile' }, 400);

  const { rows } = await pool.query<{ tile: Buffer }>('select water_tile($1, $2, $3) as tile', [
    z,
    x,
    y,
  ]);
  const tile = rows[0]?.tile ?? Buffer.alloc(0);

  return new Response(new Uint8Array(tile), {
    headers: {
      'content-type': 'application/vnd.mapbox-vector-tile',
      // Tiles are immutable for a while: served from the CDN, the database is
      // hit once per tile rather than once per viewer.
      'cache-control': 'public, max-age=300, s-maxage=86400',
      'access-control-allow-origin': c.req.header('origin') ?? ALLOWED_ORIGINS[0],
    },
  });
});

/**
 * A sealed live query for the browser. The client cannot read or alter the SQL
 * inside it, which is why the query is defined here and not there.
 */
app.post('/live/layers', async (c) => {
  const sealed = await live.seal({
    query: rawSql<LayerRow>(
      `select kind, count(*)::int as features, max(updated_at) as updated_at
       from water_layer group by kind order by kind`,
    ),
  });
  return c.json(sealed);
});

export default app;
