import maplibregl, { type MapGeoJSONFeature, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { configure, layers, tileUrl, type LayerKind } from './lib/water';

configure({ api: __WATER_API__ });

const css = getComputedStyle(document.documentElement);
const token = (name: string) => css.getPropertyValue(name).trim();

/**
 * The water layers are part of the initial style rather than added on `load`:
 * `load` waits for the basemap, so a slow or blocked basemap would otherwise
 * hold back the data the map exists to show.
 *
 * OpenStreetMap's own tile servers are for light use only and require the
 * attribution below (operations.osmfoundation.org/policies/tiles). Fine for
 * development; replace with a provider that allows production traffic before
 * launch.
 */
const style: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    },
    water: {
      type: 'vector',
      tiles: [tileUrl()],
      // Past 14 the map overzooms instead of asking the database for more
      // detail: fewer requests, and no finer geometry than the data warrants.
      maxzoom: 14,
    },
  },
  layers: [
    { id: 'osm', type: 'raster', source: 'osm' },
    {
      id: 'lakes-fill',
      type: 'fill',
      source: 'water',
      'source-layer': 'lakes',
      paint: { 'fill-color': token('--water-lake-fill') },
    },
    {
      id: 'lakes-outline',
      type: 'line',
      source: 'water',
      'source-layer': 'lakes',
      paint: { 'line-color': token('--water-lake'), 'line-width': 1.5 },
    },
    {
      id: 'rivers',
      type: 'line',
      source: 'water',
      'source-layer': 'rivers',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': token('--water-river'),
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 12, 3, 16, 6],
      },
    },
    {
      id: 'canals',
      type: 'line',
      source: 'water',
      'source-layer': 'canals',
      paint: {
        'line-color': token('--water-canal'),
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 12, 2.5, 16, 5],
        'line-dasharray': [2, 1.5],
      },
    },
  ],
};

const map = new maplibregl.Map({
  container: 'map',
  style,
  // Over the demo features until real layers are loaded.
  center: [43.85, 40.675],
  zoom: 12,
  hash: true,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

/** MVT layer names from `water_tile`, mapped to the map layers drawing them. */
const drawn: Record<'lakes' | 'rivers' | 'canals', string[]> = {
  lakes: ['lakes-fill', 'lakes-outline'],
  rivers: ['rivers'],
  canals: ['canals'],
};

const kindLabel: Record<LayerKind, string> = { river: 'Գետ', lake: 'Լիճ', canal: 'Ջրանցք' };
const sourceLayerKind: Record<string, LayerKind> = { rivers: 'river', lakes: 'lake', canals: 'canal' };

bindToggles();
bindPopups();

function bindToggles() {
  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-layer]')) {
    const ids = drawn[input.dataset.layer as keyof typeof drawn];
    input.addEventListener('change', () => {
      for (const id of ids) map.setLayoutProperty(id, 'visibility', input.checked ? 'visible' : 'none');
    });
  }
}

function bindPopups() {
  const clickable = ['lakes-fill', 'rivers', 'canals'];

  map.on('click', (event) => {
    const [feature] = map.queryRenderedFeatures(event.point, { layers: clickable });
    if (feature) showPopup(feature, event.lngLat);
  });

  map.on('mousemove', (event) => {
    const hit = map.queryRenderedFeatures(event.point, { layers: clickable }).length > 0;
    map.getCanvas().style.cursor = hit ? 'pointer' : '';
  });
}

function showPopup(feature: MapGeoJSONFeature, at: maplibregl.LngLat) {
  // Built from text nodes, not HTML: names come from the database.
  const body = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = String(feature.properties.name ?? 'Անանուն');
  const kind = document.createElement('span');
  kind.textContent = kindLabel[sourceLayerKind[feature.sourceLayer ?? '']] ?? '';
  body.append(name, kind);

  new maplibregl.Popup({ closeButton: true }).setLngLat(at).setDOMContent(body).addTo(map);
}

/** Counts per layer, and an honest line about whether the API answered. */
async function loadStatus() {
  const status = document.getElementById('status')!;
  try {
    const { layers: rows } = await layers();
    for (const row of rows) {
      const cell = document.querySelector(`[data-count="${row.kind}"]`);
      if (cell) cell.textContent = String(row.features);
    }
    for (const cell of document.querySelectorAll('[data-count]')) {
      if (!cell.textContent) cell.textContent = '0';
    }
    status.textContent = 'Տվյալների բազան միացված է';
    status.className = 'status ok';
  } catch {
    status.textContent = 'API-ն չի պատասխանում․ շերտերը հասանելի չեն';
    status.className = 'status error';
  }
}

loadStatus();
