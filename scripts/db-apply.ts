/**
 * Runs SQL files against the database the deployed Function uses.
 *
 * The connection string comes from the `.env.local` that `neon deploy` writes,
 * so the schema lands on the same branch and database as the Function — the
 * SQL Editor makes you pick both by hand, and picking wrong leaves the Function
 * querying an empty database.
 *
 *   npx tsx scripts/db-apply.ts neon/water/schema.sql neon/water/seed-demo.sql
 */

import { readFileSync } from 'node:fs';
import pg from 'pg';

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent is fine.
  }
}

// Direct, not pooled: DDL and transactions want a session of their own.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const files = process.argv.slice(2);

if (!url) {
  console.error('No DATABASE_URL_UNPOOLED or DATABASE_URL. Run `neon deploy` first.');
  process.exit(1);
}
if (files.length === 0) {
  console.error('Usage: npx tsx scripts/db-apply.ts <file.sql> [...]');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const { rows } = await client.query<{ db: string }>('select current_database() as db');
  // Name the target without printing the connection string, which holds the password.
  console.log(`database: ${rows[0]?.db} (${new URL(url).hostname})`);

  for (const file of files) {
    // One simple-protocol query per file: Postgres runs every statement in it,
    // including $$-quoted function bodies and begin/commit.
    await client.query(readFileSync(file, 'utf8'));
    console.log(`applied: ${file}`);
  }

  const check = await client.query<{ postgis: string; features: number }>(
    `select postgis_lib_version() as postgis,
            (select count(*)::int from water_layer) as features`,
  );
  console.log(`postgis ${check.rows[0]?.postgis}, water_layer rows: ${check.rows[0]?.features}`);
} finally {
  await client.end();
}
