import { defineConfig, loadEnv } from 'vite';

/**
 * The API URL is the only value the browser needs, and it is picked out by
 * name. `.env.local` also holds NEON_REALTIME_SECRET and the database URLs, so
 * exposing a whole prefix (Vite's `envPrefix`) would risk shipping them.
 */
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const api = env.WATER_API_URL || env.NEON_FUNCTION_WATER_BASE_URL;

  // A build without a real API URL would ship a map that points at localhost.
  if (command === 'build' && !api) {
    throw new Error('Set WATER_API_URL or NEON_FUNCTION_WATER_BASE_URL before building.');
  }

  return {
    define: {
      __WATER_API__: JSON.stringify(api || 'http://localhost:8787'),
    },
    // 3000 is the dev origin the API's CORS list allows.
    server: { port: 3000, strictPort: true },
    preview: { port: 3000, strictPort: true },
  };
});
