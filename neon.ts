import { defineConfig } from '@neon/config/v1';

/**
 * Neon services for the water GIS tool.
 *
 * Postgres holds the layers (PostGIS), the `water` Function is the only thing
 * that touches them, and Realtime pushes row changes to open maps. The site
 * itself is a static export with no server of its own, so the browser talks to
 * the Function directly rather than through a Next.js route handler.
 */
export default defineConfig({
  preview: {
    realtime: true,
  },
  auth: false,
  functions: {
    water: { name: 'Water layers API', source: './neon/water/index.ts' },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: '7d' };
    }
    // Existing branch: no changes
    return {};
  },
});
