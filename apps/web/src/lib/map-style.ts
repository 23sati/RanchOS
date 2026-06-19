import type { StyleSpecification } from 'maplibre-gl';

const FALLBACK_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm-raster',
      type: 'raster',
      source: 'osm',
    },
  ],
};

export function getMapStyle() {
  const customStyleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim();
  return customStyleUrl || FALLBACK_MAP_STYLE;
}
