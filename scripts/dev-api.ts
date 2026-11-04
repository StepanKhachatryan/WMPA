/**
 * Runs the `water` Function locally on Node, against whatever DATABASE_URL
 * points at — a local PostGIS when Neon is unreachable. The app itself is
 * unchanged; only the host differs, plus a request log.
 *
 * The Realtime secret only has to be well-formed for `createRealtime` to start,
 * so a throwaway one is generated when none is set. Never reuse it anywhere.
 */

import { randomBytes } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';

// The same files Vite reads, so one `.env.local` configures both servers.
// Variables already set in the shell win: loadEnvFile does not overwrite them.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent is fine.
  }
}

process.env.NEON_REALTIME_SECRET ??= `nrt_live_1${randomBytes(32).toString('base64url')}`;

// Imported after the env is filled in: the app reads it at module load.
const { default: water } = await import('../neon/water/index');

const app = new Hono().use(logger()).route('/', water);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`water API on http://localhost:${port}`);
});
