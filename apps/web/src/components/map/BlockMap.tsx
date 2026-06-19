'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { bbox } from '@turf/turf';
import { Geoman } from '@geoman-io/maplibre-geoman-free';
import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import MapLegend from '@/components/map/MapLegend';
import {
  BlockGeometry,
  BlockRecord,
  blockToMapFeature,
  calculateGeometryAcres,
  formatBlockCropLabel,
  normalizeBlockGeometry,
  snapGeometryInsideBoundary,
} from '@/lib/blocks';
import { getMapStyle } from '@/lib/map-style';
import type { RanchBoundary, RanchMapViewport } from '@/lib/ranches';

interface BlockMapProps {
  blocks?: BlockRecord[];
  editable?: boolean;
  geometry?: BlockGeometry | null;
  center?: [number, number] | null;
  viewport?: RanchMapViewport | null;
  ranchBoundary?: RanchBoundary | null;
  uncoveredGeometry?: BlockGeometry | null;
  onGeometryChange?: (geometry: BlockGeometry | null, acreage: number | null) => void;
}

const DEFAULT_CENTER: [number, number] = [-119.7871, 36.7378];
const DEFAULT_ZOOM = 11;

const BLOCK_SOURCE_ID = 'ranchos-blocks';
const BLOCK_FILL_LAYER_ID = 'ranchos-blocks-fill';
const BLOCK_LINE_LAYER_ID = 'ranchos-blocks-line';
const RANCH_BOUNDARY_SOURCE_ID = 'ranchos-ranch-boundary';
const RANCH_BOUNDARY_FILL_LAYER_ID = 'ranchos-ranch-boundary-fill';
const RANCH_BOUNDARY_LINE_LAYER_ID = 'ranchos-ranch-boundary-line';
const UNCOVERED_SOURCE_ID = 'ranchos-ranch-uncovered';
const UNCOVERED_FILL_LAYER_ID = 'ranchos-ranch-uncovered-fill';
const UNCOVERED_LINE_LAYER_ID = 'ranchos-ranch-uncovered-line';

type EditorTool = 'draw' | 'edit' | 'move' | null;

type RemovableFeature = {
  id?: string | number;
  remove: () => void;
};

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

function collectSingleGeometry(collection: FeatureCollection) {
  const polygons = collection.features
    .map((feature) => normalizeBlockGeometry(feature))
    .filter((feature): feature is BlockGeometry => Boolean(feature));

  if (!polygons.length) {
    return null;
  }

  return polygons[polygons.length - 1];
}

function emptyCollection(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [],
  };
}

function isRemovableFeature(feature: unknown): feature is RemovableFeature {
  return (
    typeof feature === 'object' &&
    feature !== null &&
    'remove' in feature &&
    typeof (feature as { remove?: unknown }).remove === 'function'
  );
}

export default function BlockMap({
  blocks = [],
  editable = false,
  geometry = null,
  center = null,
  viewport = null,
  ranchBoundary = null,
  uncoveredGeometry = null,
  onGeometryChange,
}: BlockMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const geoman = useRef<Geoman | null>(null);
  const lastAppliedGeometryKey = useRef<string | null>(null);
  const onGeometryChangeRef = useRef(onGeometryChange);
  const [isMapReady, setIsMapReady] = useState(false);
  const [activeTool, setActiveTool] = useState<EditorTool>(null);
  const [snapMessage, setSnapMessage] = useState('');

  const blockFeatures = useMemo<FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: blocks
      .map((block) => blockToMapFeature(block))
      .filter((feature): feature is BlockGeometry => Boolean(feature)),
  }), [blocks]);

  const geometryKey = useMemo(
    () => JSON.stringify(geometry ?? null),
    [geometry],
  );

  const visibleCropTypes = useMemo(
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
    onGeometryChangeRef.current = onGeometryChange;
  }, [onGeometryChange]);

  useEffect(() => {
    setSnapMessage('');
  }, [geometryKey, ranchBoundary]);

  const syncActiveTool = () => {
    const geomanInstance = geoman.current;
    if (!geomanInstance) {
      setActiveTool(null);
      return;
    }

    if (geomanInstance.getActiveDrawModes().includes('polygon')) {
      setActiveTool('draw');
      return;
    }

    if (geomanInstance.getActiveEditModes().includes('change')) {
      setActiveTool('edit');
      return;
    }

    if (geomanInstance.getActiveEditModes().includes('drag')) {
      setActiveTool('move');
      return;
    }

    setActiveTool(null);
  };

  const syncGeometryFromEditor = () => {
    const geomanInstance = geoman.current;
    const changeHandler = onGeometryChangeRef.current;
    if (!geomanInstance || !changeHandler) {
      return;
    }

    const nextGeometry = collectSingleGeometry(
      geomanInstance.features.exportGeoJson({ allowedShapes: ['polygon'] }),
    );
    lastAppliedGeometryKey.current = JSON.stringify(nextGeometry ?? null);
    changeHandler(nextGeometry, calculateGeometryAcres(nextGeometry));
  };

  const clearEditorGeometry = async () => {
    const geomanInstance = geoman.current;
    if (!geomanInstance) {
      return;
    }

    const removable: RemovableFeature[] = [];
    geomanInstance.features.forEach((feature) => {
      if (isRemovableFeature(feature)) {
        removable.push(feature);
      }
    });
    removable.forEach((feature) => feature.remove());

    lastAppliedGeometryKey.current = JSON.stringify(null);
    onGeometryChangeRef.current?.(null, null);
    await geomanInstance.disableAllModes();
    setActiveTool(null);
  };

  const activateTool = async (tool: Exclude<EditorTool, null>) => {
    const geomanInstance = geoman.current;
    if (!geomanInstance) {
      return;
    }

    if (activeTool === tool) {
      await geomanInstance.disableAllModes();
      setActiveTool(null);
      return;
    }

    await geomanInstance.disableAllModes();

    if (tool === 'draw') {
      await geomanInstance.toggleDraw('polygon');
    } else if (tool === 'edit') {
      await geomanInstance.toggleGlobalEditMode();
    } else if (tool === 'move') {
      await geomanInstance.toggleGlobalDragMode();
    }

    syncActiveTool();
  };

  const fitToRanchBoundary = () => {
    const mapInstance = map.current;
    if (!mapInstance || !ranchBoundary) {
      return;
    }

    fitMapToCollection(mapInstance, {
      type: 'FeatureCollection',
      features: [ranchBoundary],
    });
  };

  const snapToRanchBoundary = async () => {
    if (!geometry || !ranchBoundary) {
      return;
    }

    const snappedGeometry = snapGeometryInsideBoundary(geometry, ranchBoundary);
    if (!snappedGeometry) {
      setSnapMessage('No overlapping area was found inside the ranch boundary.');
      return;
    }

    const geometryChanged = JSON.stringify(snappedGeometry) !== JSON.stringify(geometry);
    onGeometryChangeRef.current?.(snappedGeometry, calculateGeometryAcres(snappedGeometry));
    setSnapMessage(
      geometryChanged
        ? 'Block boundary snapped inside the ranch footprint.'
        : 'Block boundary already fits inside the ranch footprint.',
    );

    const geomanInstance = geoman.current;
    if (geomanInstance) {
      await geomanInstance.disableAllModes();
      syncActiveTool();
    }
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

    map.current = nextMap;
    nextMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    nextMap.on('load', () => {
      setIsMapReady(true);

      nextMap.addSource(BLOCK_SOURCE_ID, {
        type: 'geojson',
        data: emptyCollection(),
      });

      nextMap.addLayer({
        id: BLOCK_FILL_LAYER_ID,
        type: 'fill',
        source: BLOCK_SOURCE_ID,
        paint: {
          'fill-opacity': editable ? 0.08 : 0.28,
          'fill-color': [
            'match',
            ['get', 'cropType'],
            'almond',
            '#D97706',
            'navel_orange',
            '#F97316',
            'valencia_orange',
            '#FB923C',
            'lemon',
            '#EAB308',
            'mandarin',
            '#F59E0B',
            'grapefruit',
            '#EC4899',
            '#3D7A4F',
          ],
        },
      });

      nextMap.addLayer({
        id: BLOCK_LINE_LAYER_ID,
        type: 'line',
        source: BLOCK_SOURCE_ID,
        paint: {
          'line-width': editable ? 1.5 : 2,
          'line-opacity': editable ? 0.35 : 0.95,
          'line-color': '#1F2937',
        },
      });

      nextMap.addSource(RANCH_BOUNDARY_SOURCE_ID, {
        type: 'geojson',
        data: emptyCollection(),
      });

      nextMap.addLayer({
        id: RANCH_BOUNDARY_FILL_LAYER_ID,
        type: 'fill',
        source: RANCH_BOUNDARY_SOURCE_ID,
        paint: {
          'fill-opacity': editable ? 0.04 : 0.06,
          'fill-color': '#0F766E',
        },
      });

      nextMap.addLayer({
        id: RANCH_BOUNDARY_LINE_LAYER_ID,
        type: 'line',
        source: RANCH_BOUNDARY_SOURCE_ID,
        paint: {
          'line-width': editable ? 2 : 1.5,
          'line-opacity': 0.85,
          'line-color': '#0F766E',
          'line-dasharray': [2, 2],
        },
      });

      nextMap.addSource(UNCOVERED_SOURCE_ID, {
        type: 'geojson',
        data: emptyCollection(),
      });

      nextMap.addLayer({
        id: UNCOVERED_FILL_LAYER_ID,
        type: 'fill',
        source: UNCOVERED_SOURCE_ID,
        paint: {
          'fill-opacity': editable ? 0.03 : 0.1,
          'fill-color': '#F97316',
        },
      });

      nextMap.addLayer({
        id: UNCOVERED_LINE_LAYER_ID,
        type: 'line',
        source: UNCOVERED_SOURCE_ID,
        paint: {
          'line-width': 1.5,
          'line-opacity': 0.65,
          'line-color': '#EA580C',
          'line-dasharray': [1, 2],
        },
      });

      if (editable) {
        const geomanInstance = new Geoman(nextMap, {
          settings: {
            useControlsUi: false,
            controlsUiEnabledByDefault: false,
            controlsCollapsible: false,
            awaitDataUpdatesOnEvents: true,
          },
        });

        geoman.current = geomanInstance;

        const keepLatestFeature = (featureIdToKeep?: string | number) => {
          const removable: RemovableFeature[] = [];
          geomanInstance.features.forEach((feature) => {
            if (!isRemovableFeature(feature)) {
              return;
            }

            if (featureIdToKeep && feature.id === featureIdToKeep) {
              return;
            }

            removable.push(feature);
          });

          removable.forEach((feature) => feature.remove());
        };

        nextMap.on('gm:create', (event) => {
          keepLatestFeature(event.feature.id);
          syncGeometryFromEditor();

          const exported = geomanInstance.features.exportGeoJson({ allowedShapes: ['polygon'] });
          if (exported.features.length) {
            fitMapToCollection(nextMap, exported);
          }
        });

        nextMap.on('gm:change', () => {
          syncGeometryFromEditor();
        });

        nextMap.on('gm:drag', () => {
          syncGeometryFromEditor();
        });

        nextMap.on('gm:remove', () => {
          syncGeometryFromEditor();
        });

        nextMap.on('gm:globaldrawmodetoggled', syncActiveTool);
        nextMap.on('gm:globalchangemodetoggled', syncActiveTool);
        nextMap.on('gm:globaldragmodetoggled', syncActiveTool);
      }
    });

    return () => {
      const geomanInstance = geoman.current;
      const shouldRemoveSources = Boolean(nextMap.getStyle()?.layers);
      geoman.current = null;
      map.current = null;
      if (!geomanInstance) {
        nextMap.remove();
        return;
      }

      void geomanInstance
        .destroy({ removeSources: shouldRemoveSources })
        .catch(() => undefined)
        .finally(() => {
          nextMap.remove();
        });
    };
  }, [center, editable, viewport]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !isMapReady) {
      return;
    }

    const source = mapInstance.getSource(BLOCK_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(blockFeatures);
    const ranchBoundarySource = mapInstance.getSource(RANCH_BOUNDARY_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    ranchBoundarySource?.setData(
      ranchBoundary
        ? {
            type: 'FeatureCollection',
            features: [ranchBoundary],
          }
        : emptyCollection(),
    );
    const uncoveredSource = mapInstance.getSource(UNCOVERED_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    uncoveredSource?.setData(
      uncoveredGeometry
        ? {
            type: 'FeatureCollection',
            features: [uncoveredGeometry],
          }
        : emptyCollection(),
    );

    if (editable && geometry) {
      return;
    }

    if (ranchBoundary) {
      fitMapToCollection(mapInstance, {
        type: 'FeatureCollection',
        features: [ranchBoundary],
      });
      return;
    }

    if (viewport) {
      mapInstance.easeTo({
        center: viewport.center,
        zoom: viewport.zoom,
        duration: 0,
      });
      return;
    }

    if (blockFeatures.features.length) {
      fitMapToCollection(mapInstance, blockFeatures);
      return;
    }

    if (center) {
      mapInstance.easeTo({
        center,
        zoom: editable ? 13 : DEFAULT_ZOOM,
        duration: 0,
      });
    }
  }, [blockFeatures, center, editable, geometry, isMapReady, ranchBoundary, uncoveredGeometry, viewport]);

  useEffect(() => {
    if (!editable || !geoman.current || !isMapReady || geometryKey === lastAppliedGeometryKey.current) {
      return;
    }

    const geomanInstance = geoman.current;
    const mapInstance = map.current;

    const applyGeometry = async () => {
      const removable: RemovableFeature[] = [];
      geomanInstance.features.forEach((feature) => {
        if (isRemovableFeature(feature)) {
          removable.push(feature);
        }
      });
      removable.forEach((feature) => feature.remove());

      if (geometry) {
        await geomanInstance.features.importGeoJsonFeature(geometry);
        if (mapInstance) {
          fitMapToCollection(mapInstance, {
            type: 'FeatureCollection',
            features: [geometry],
          });
        }
      }

      lastAppliedGeometryKey.current = geometryKey;
    };

    void applyGeometry();
  }, [editable, geometry, geometryKey, isMapReady]);

  return (
    <div className="relative h-full min-h-[400px] w-full overflow-hidden bg-stone-200">
      <div ref={mapContainer} className="absolute inset-0" />

      {editable ? (
        <div className="absolute left-4 top-4 z-10 flex max-w-[min(100%-2rem,28rem)] flex-wrap gap-2 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => void activateTool('draw')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              activeTool === 'draw'
                ? 'bg-green-600 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            Draw boundary
          </button>
          <button
            type="button"
            onClick={() => void activateTool('edit')}
            disabled={!geometry}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              activeTool === 'edit'
                ? 'bg-sky-600 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Edit vertices
          </button>
          <button
            type="button"
            onClick={() => void activateTool('move')}
            disabled={!geometry}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              activeTool === 'move'
                ? 'bg-amber-600 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Move shape
          </button>
          <button
            type="button"
            onClick={() => void clearEditorGeometry()}
            disabled={!geometry}
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
          {ranchBoundary ? (
            <button
              type="button"
              onClick={fitToRanchBoundary}
              className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100"
            >
              Fit to ranch
            </button>
          ) : null}
          {ranchBoundary ? (
            <button
              type="button"
              onClick={() => void snapToRanchBoundary()}
              disabled={!geometry}
              className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Snap inside ranch
            </button>
          ) : null}
          <p className="w-full text-xs text-stone-600">
            Draw one polygon per block. Starting a new boundary replaces the previous one.
            {ranchBoundary ? ' Use Fit to ranch to reframe the map or Snap inside ranch to clip overflow back to the saved ranch footprint.' : ''}
          </p>
        </div>
      ) : null}

      {!editable && blockFeatures.features.length === 0 ? (
        <div className="absolute left-4 top-4 z-10 max-w-sm rounded-2xl border border-white/70 bg-white/90 p-4 text-sm text-stone-700 shadow-lg backdrop-blur">
          <p className="font-semibold text-stone-900">No block boundaries yet</p>
          <p className="mt-1">Create or edit a block and draw its polygon to see it on the ranch map.</p>
        </div>
      ) : null}

      {!editable && visibleCropTypes.length > 0 ? (
        <div className="absolute left-4 top-4 z-10 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap gap-2 text-xs font-medium text-stone-700">
            {visibleCropTypes.map((cropType) => (
              <span key={cropType} className="rounded-full bg-stone-100 px-3 py-1">
                {formatBlockCropLabel(cropType)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {editable && blockFeatures.features.length > 0 ? (
        <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-medium text-stone-700 shadow-lg backdrop-blur">
          Reference blocks: {blockFeatures.features.length}
        </div>
      ) : null}

      {editable && ranchBoundary ? (
        <div className="pointer-events-none absolute right-4 bottom-4 z-10 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-medium text-stone-700 shadow-lg backdrop-blur">
          Ranch boundary loaded
        </div>
      ) : null}

      {!editable && uncoveredGeometry ? (
        <div className="pointer-events-none absolute right-4 bottom-4 z-10 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-medium text-stone-700 shadow-lg backdrop-blur">
          Uncovered ranch area highlighted
        </div>
      ) : null}

      {!editable && (blockFeatures.features.length > 0 || ranchBoundary || uncoveredGeometry) ? (
        <MapLegend
          className="bottom-4 left-4"
          entries={[
            ...(blockFeatures.features.length ? [{ label: 'Mapped blocks', fillColor: '#DCFCE7', borderColor: '#1F2937' }] : []),
            ...(ranchBoundary ? [{ label: 'Ranch boundary', fillColor: '#D1FAE5', borderColor: '#0F766E', dashed: true }] : []),
            ...(uncoveredGeometry ? [{ label: 'Uncovered ranch', fillColor: '#FED7AA', borderColor: '#EA580C', dashed: true }] : []),
          ]}
          title="Map keys"
        />
      ) : null}

      {editable && snapMessage ? (
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 max-w-xs rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-xs font-medium text-stone-700 shadow-lg backdrop-blur">
          {snapMessage}
        </div>
      ) : null}

      {editable && !geometry ? (
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 rounded-2xl border border-white/70 bg-white/90 p-4 text-sm text-stone-700 shadow-lg backdrop-blur">
          <p className="font-semibold text-stone-900">Boundary capture is ready</p>
          <p className="mt-1">Use Draw boundary to sketch the block. RanchOS stores the polygon as GeoJSON in your existing `blocks.geometry` column.</p>
        </div>
      ) : null}
    </div>
  );
}
