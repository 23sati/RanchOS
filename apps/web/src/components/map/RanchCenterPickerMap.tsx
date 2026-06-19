'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { bbox } from '@turf/turf';
import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import MapLegend from '@/components/map/MapLegend';
import { BlockGeometry, BlockRecord, blockToMapFeature, formatBlockCropLabel } from '@/lib/blocks';
import { getMapStyle } from '@/lib/map-style';
import { centerToCoordinateFields, type RanchBoundary, type RanchMapViewport } from '@/lib/ranches';

type RanchCenterPickerMapProps = {
  blocks?: BlockRecord[];
  center?: [number, number] | null;
  viewport?: RanchMapViewport | null;
  boundary?: RanchBoundary | null;
  onCenterChange?: (center: [number, number]) => void;
  onViewportChange?: (viewport: RanchMapViewport) => void;
};

const DEFAULT_CENTER: [number, number] = [-119.7871, 36.7378];
const DEFAULT_ZOOM = 11;
const BLOCK_SOURCE_ID = 'ranchos-ranch-picker-blocks';
const BLOCK_FILL_LAYER_ID = 'ranchos-ranch-picker-fill';
const BLOCK_LINE_LAYER_ID = 'ranchos-ranch-picker-line';
const BOUNDARY_SOURCE_ID = 'ranchos-ranch-picker-boundary';
const BOUNDARY_FILL_LAYER_ID = 'ranchos-ranch-picker-boundary-fill';
const BOUNDARY_LINE_LAYER_ID = 'ranchos-ranch-picker-boundary-line';
const VIEWPORT_EPSILON = 0.000001;
const ZOOM_EPSILON = 0.001;

function emptyCollection(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [],
  };
}

function fitMapToCollection(map: maplibregl.Map, collection: FeatureCollection) {
  if (!collection.features.length) {
    return;
  }

  const [minLng, minLat, maxLng, maxLat] = bbox(collection);
  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    {
      padding: 56,
      maxZoom: 15,
      duration: 0,
    },
  );
}

function nearlyEqual(left: number, right: number, epsilon = VIEWPORT_EPSILON) {
  return Math.abs(left - right) <= epsilon;
}

function centersEqual(left: [number, number], right: [number, number]) {
  return nearlyEqual(left[0], right[0]) && nearlyEqual(left[1], right[1]);
}

function boundsEqual(
  left: [[number, number], [number, number]],
  right: [[number, number], [number, number]],
) {
  return (
    centersEqual(left[0], right[0]) &&
    centersEqual(left[1], right[1])
  );
}

function viewportsEqual(left: RanchMapViewport | null | undefined, right: RanchMapViewport | null | undefined) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    centersEqual(left.center, right.center) &&
    nearlyEqual(left.zoom, right.zoom, ZOOM_EPSILON) &&
    boundsEqual(left.bounds, right.bounds)
  );
}

export default function RanchCenterPickerMap({
  blocks = [],
  center = null,
  viewport = null,
  boundary = null,
  onCenterChange,
  onViewportChange,
}: RanchCenterPickerMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const onCenterChangeRef = useRef(onCenterChange);
  const onViewportChangeRef = useRef(onViewportChange);
  const lastPublishedViewport = useRef<RanchMapViewport | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const blockFeatures = useMemo<FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: blocks
      .map((block) => blockToMapFeature(block))
      .filter((feature): feature is BlockGeometry => Boolean(feature)),
  }), [blocks]);

  const cropTypes = useMemo(
    () =>
      Array.from(
        new Set(
          blockFeatures.features
            .map((feature) => feature.properties?.cropType)
            .filter((cropType): cropType is string => typeof cropType === 'string' && cropType.length > 0),
        ),
      ),
    [blockFeatures],
  );

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const publishViewport = (mapInstance: maplibregl.Map) => {
    const currentCenter = mapInstance.getCenter();
    const bounds = mapInstance.getBounds();

    const nextViewport = {
      center: [currentCenter.lng, currentCenter.lat],
      zoom: mapInstance.getZoom(),
      bounds: [
        [bounds.getWest(), bounds.getSouth()],
        [bounds.getEast(), bounds.getNorth()],
      ],
    } satisfies RanchMapViewport;

    if (viewportsEqual(lastPublishedViewport.current, nextViewport)) {
      return;
    }

    lastPublishedViewport.current = nextViewport;
    onViewportChangeRef.current?.(nextViewport);
  };

  useEffect(() => {
    if (map.current || !mapContainer.current) {
      return;
    }

    const nextMap = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapStyle(),
      center: viewport?.center ?? center ?? DEFAULT_CENTER,
      zoom: viewport?.zoom ?? (center ? 13 : DEFAULT_ZOOM),
    });

    nextMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    nextMap.on('load', () => {
      setIsMapReady(true);
      nextMap.addSource(BLOCK_SOURCE_ID, {
        type: 'geojson',
        data: blockFeatures,
      });

      nextMap.addLayer({
        id: BLOCK_FILL_LAYER_ID,
        type: 'fill',
        source: BLOCK_SOURCE_ID,
        paint: {
          'fill-opacity': 0.12,
          'fill-color': '#3D7A4F',
        },
      });

      nextMap.addLayer({
        id: BLOCK_LINE_LAYER_ID,
        type: 'line',
        source: BLOCK_SOURCE_ID,
        paint: {
          'line-width': 1.5,
          'line-opacity': 0.55,
          'line-color': '#1F2937',
        },
      });

      nextMap.addSource(BOUNDARY_SOURCE_ID, {
        type: 'geojson',
        data: boundary
          ? {
              type: 'FeatureCollection',
              features: [boundary],
            }
          : emptyCollection(),
      });

      nextMap.addLayer({
        id: BOUNDARY_FILL_LAYER_ID,
        type: 'fill',
        source: BOUNDARY_SOURCE_ID,
        paint: {
          'fill-opacity': 0.05,
          'fill-color': '#0F766E',
        },
      });

      nextMap.addLayer({
        id: BOUNDARY_LINE_LAYER_ID,
        type: 'line',
        source: BOUNDARY_SOURCE_ID,
        paint: {
          'line-width': 1.5,
          'line-opacity': 0.85,
          'line-color': '#0F766E',
          'line-dasharray': [2, 2],
        },
      });

      if (viewport) {
        nextMap.easeTo({ center: viewport.center, zoom: viewport.zoom, duration: 0 });
      } else if (boundary) {
        fitMapToCollection(nextMap, {
          type: 'FeatureCollection',
          features: [boundary],
        });
      } else if (blockFeatures.features.length) {
        fitMapToCollection(nextMap, blockFeatures);
      } else if (center) {
        nextMap.easeTo({ center, zoom: 13, duration: 0 });
      }

      publishViewport(nextMap);
    });

    nextMap.on('click', (event) => {
      const nextCenter: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      onCenterChangeRef.current?.(nextCenter);
      nextMap.easeTo({ center: nextCenter, duration: 0 });
    });

    nextMap.on('moveend', () => {
      publishViewport(nextMap);
    });

    map.current = nextMap;

    return () => {
      marker.current?.remove();
      marker.current = null;
      map.current = null;
      setIsMapReady(false);
      nextMap.remove();
    };
  }, []);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !isMapReady) {
      return;
    }

    const source = mapInstance.getSource(BLOCK_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(blockFeatures);
    const boundarySource = mapInstance.getSource(BOUNDARY_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    boundarySource?.setData(
      boundary
        ? {
            type: 'FeatureCollection',
            features: [boundary],
          }
        : emptyCollection(),
    );

    if (viewport) {
      const currentCenter = mapInstance.getCenter();
      const currentViewport = {
        center: [currentCenter.lng, currentCenter.lat] as [number, number],
        zoom: mapInstance.getZoom(),
        bounds: [
          [mapInstance.getBounds().getWest(), mapInstance.getBounds().getSouth()],
          [mapInstance.getBounds().getEast(), mapInstance.getBounds().getNorth()],
        ] as [[number, number], [number, number]],
      } satisfies RanchMapViewport;

      if (!viewportsEqual(currentViewport, viewport)) {
        mapInstance.easeTo({ center: viewport.center, zoom: viewport.zoom, duration: 0 });
      }
      return;
    }

    if (boundary) {
      fitMapToCollection(mapInstance, {
        type: 'FeatureCollection',
        features: [boundary],
      });
      return;
    }

    if (blockFeatures.features.length) {
      fitMapToCollection(mapInstance, blockFeatures);
      return;
    }

    if (center) {
      mapInstance.easeTo({ center, zoom: 13, duration: 0 });
    }
  }, [blockFeatures, boundary, center, isMapReady, viewport]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !isMapReady) {
      return;
    }

    marker.current?.remove();

    if (!center) {
      marker.current = null;
      return;
    }

    const el = document.createElement('div');
    el.className = 'h-4 w-4 rounded-full border-2 border-white bg-sky-600 shadow-lg';

    marker.current = new maplibregl.Marker({ element: el })
      .setLngLat(center)
      .addTo(mapInstance);
  }, [center, isMapReady]);

  const coordinateFields = centerToCoordinateFields(center ?? null);

  return (
    <div className="relative h-full min-h-[340px] w-full overflow-hidden rounded-2xl bg-stone-200">
      <div ref={mapContainer} className="absolute inset-0" />

      <div className="absolute left-4 top-4 z-10 max-w-sm rounded-2xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur">
        <p className="text-sm font-semibold text-stone-900">Click the map to set ranch center</p>
        <p className="mt-1 text-xs text-stone-600">
          {center
            ? `Current center: ${coordinateFields.gpsLat}, ${coordinateFields.gpsLng}`
            : 'No ranch center saved yet. Click once to place it.'}
        </p>
        {viewport ? (
          <p className="mt-1 text-xs text-stone-500">
            Saved zoom: {viewport.zoom.toFixed(2)}
          </p>
        ) : null}
        {boundary ? (
          <button
            type="button"
            onClick={() => {
              const mapInstance = map.current;
              if (!mapInstance) {
                return;
              }

              fitMapToCollection(mapInstance, {
                type: 'FeatureCollection',
                features: [boundary],
              });
            }}
            className="pointer-events-auto mt-3 rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"
          >
            Fit to boundary
          </button>
        ) : null}
      </div>

      {cropTypes.length > 0 ? (
        <div className="absolute bottom-4 left-4 z-10 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap gap-2 text-xs font-medium text-stone-700">
            {cropTypes.map((cropType) => (
              <span key={cropType} className="rounded-full bg-stone-100 px-3 py-1">
                {formatBlockCropLabel(cropType)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <MapLegend
        className="bottom-4 right-4"
        entries={[
          ...(boundary ? [{ label: 'Ranch boundary', fillColor: '#D1FAE5', borderColor: '#0F766E', dashed: true }] : []),
          ...(blocks.length ? [{ label: 'Mapped blocks', fillColor: '#DCFCE7', borderColor: '#1F2937' }] : []),
          { label: 'Ranch center', fillColor: '#0284C7', borderColor: '#FFFFFF', marker: true },
        ]}
        title="Map keys"
      />
    </div>
  );
}
