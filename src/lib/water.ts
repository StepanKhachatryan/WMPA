/**
 * The browser's side of the water API.
 *
 * Deliberately free of any framework: the frontend has not been chosen yet, and
 * every bundler exposes build-time variables differently. Call `configure()`
 * once at startup with the two URLs `neon deploy` writes into `.env.local`
 * (`NEON_FUNCTION_WATER_BASE_URL` and `NEON_REALTIME_URL`), however your build
 * surfaces them.
 */

let apiBase = '';
let realtimeUrl = '';

export function configure(options: { api: string; realtime?: string }) {
  apiBase = options.api.replace(/\/$/, '');
  realtimeUrl = options.realtime ?? '';
}

export const api = () => apiBase;
export const realtime = () => realtimeUrl;
export const configured = () => Boolean(apiBase);

export type LayerKind = 'river' | 'lake' | 'canal';

export type LayerRow = {
  kind: LayerKind;
  features: number;
  updated_at: string | null;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiBase) throw new Error('water API not configured');
  const response = await fetch(`${apiBase}${path}`, init);
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return (await response.json()) as T;
}

/** Whether the database answers, and which PostGIS it runs. */
export function health() {
  return call<{ ok: boolean; postgis: string | null }>('/health');
}

/** Feature counts per layer. */
export function layers() {
  return call<{ layers: LayerRow[] }>('/layers');
}

/**
 * The sealed live query. The SQL behind it stays on the server: the browser
 * cannot read it or change what it selects.
 */
export function sealedLayers<T>() {
  return call<T>('/live/layers', { method: 'POST' });
}

/** The tile endpoint, in the form MapLibre expects for a vector source. */
export const tileUrl = () => `${apiBase}/tiles/{z}/{x}/{y}`;
