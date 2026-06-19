'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { bbox } from '@turf/turf';
import { Geoman } from '@geoman-io/maplibre-geoman-free';
import type { FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import {
  calculateGeometryAcres,
  normalizeBlockGeometry,
  type BlockGeometry,
  type BlockRecord,
  blockToMapFeature,
} from '@/lib/blocks';
import { getMapStyle } from '@/lib/map-style';
import type { RanchBoundary, RanchMapViewport } from '@/lib/ranches';

type RanchBoundaryEditorMapProps = {
  blocks?: BlockRecord[];
  center?: [number, number] | null;
  viewport?: RanchMapViewport | null;
  boundary?: RanchBoundary | null;
  onBoundaryChange?: (boundary: RanchBoundary | null) => void;
};

type EditorTool = 'draw' | 'edit' | 'move' | null;

type RemovableFeature = {
  id?: string | number;
  remove: () => void;
};

const DEFAULT_CENTER: [number, number] = [-119.7871, 36.7378];
const DEFAULT_ZOOM = 11;
const BLOCK_SOURCE_ID = 'ranchos-ranch-boundary-blocks';

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

function isRemovableFeature(feature: unknown): feature is RemovableFeature {
  return (
    typeof feature === 'object' &&
    feature !== null &&
    'remove' in feature &&
    typeof (feature as { remove?: unknown }).remove === 'function'
  );
}

export default function RanchBoundaryEditorMap({
  blocks = [],
  center = null,
  viewport = null,
  boundary = null,
  onBoundaryChange,
}: RanchBoundaryEditorMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const geoman = useRef<Geoman | null>(null);
  const onBoundaryChangeRef = useRef(onBoundaryChange);
  const lastAppliedBoundaryKey = useRef<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [activeTool, setActiveTool] = useState<EditorTool>(null);

  const blockFeatures = useMemo<FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: blocks
      .map((block) => blockToMapFeature(block))
      .filter((feature): feature is BlockGeometry => Boolean(feature)),
  }), [blocks]);

  const boundaryKey = useMemo(() => JSON.stringify(boundary ?? null), [boundary]);
  const boundaryAcres = useMemo(() => calculateGeometryAcres(boundary), [boundary]);

  useEffect(() => {
    onBoundaryChangeRef.current = onBoundaryChange;
  }, [onBoundaryChange]);

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

  const syncBoundaryFromEditor = () => {
    const geomanInstance = geoman.current;
    const changeHandler = onBoundaryChangeRef.current;
    if (!geomanInstance || !changeHandler) {
      return;
    }

    const nextBoundary = collectSingleGeometry(
      geomanInstance.features.exportGeoJson({ allowedShapes: ['polygon'] }),
    );

    lastAppliedBoundaryKey.current = JSON.stringify(nextBoundary ?? null);
    changeHandler(nextBoundary);
  };

  const clearBoundary = async () => {
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

    lastAppliedBoundaryKey.current = JSON.stringify(null);
    onBoundaryChangeRef.current?.(null);
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
        data: blockFeatures,
      });

      nextMap.addLayer({
        id: `${BLOCK_SOURCE_ID}-fill`,
        type: 'fill',
        source: BLOCK_SOURCE_ID,
        paint: {
          'fill-opacity': 0.1,
          'fill-color': '#3D7A4F',
        },
      });

      nextMap.addLayer({
        id: `${BLOCK_SOURCE_ID}-line`,
        type: 'line',
        source: BLOCK_SOURCE_ID,
        paint: {
          'line-width': 1.25,
          'line-opacity': 0.5,
          'line-color': '#1F2937',
        },
      });

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
        syncBoundaryFromEditor();

        const exported = geomanInstance.features.exportGeoJson({ allowedShapes: ['polygon'] });
        if (exported.features.length) {
          fitMapToCollection(nextMap, exported);
        }
      });

      nextMap.on('gm:change', syncBoundaryFromEditor);
      nextMap.on('gm:drag', syncBoundaryFromEditor);
      nextMap.on('gm:remove', syncBoundaryFromEditor);
      nextMap.on('gm:globaldrawmodetoggled', syncActiveTool);
      nextMap.on('gm:globalchangemodetoggled', syncActiveTool);
      nextMap.on('gm:globaldragmodetoggled', syncActiveTool);

      if (boundary) {
        fitMapToCollection(nextMap, {
          type: 'FeatureCollection',
          features: [boundary],
        });
      } else if (blockFeatures.features.length) {
        fitMapToCollection(nextMap, blockFeatures);
      } else if (viewport) {
        nextMap.easeTo({ center: viewport.center, zoom: viewport.zoom, duration: 0 });
      } else if (center) {
        nextMap.easeTo({ center, zoom: 13, duration: 0 });
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
  }, [blockFeatures, boundary, center, viewport]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !isMapReady) {
      return;
    }

    const source = mapInstance.getSource(BLOCK_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(blockFeatures);

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

    if (viewport) {
      mapInstance.easeTo({ center: viewport.center, zoom: viewport.zoom, duration: 0 });
      return;
    }

    if (center) {
      mapInstance.easeTo({ center, zoom: 13, duration: 0 });
    }
  }, [blockFeatures, boundary, center, isMapReady, viewport]);

  useEffect(() => {
    if (!geoman.current || !isMapReady || boundaryKey === lastAppliedBoundaryKey.current) {
      return;
    }

    const geomanInstance = geoman.current;
    const mapInstance = map.current;

    const applyBoundary = async () => {
      const removable: RemovableFeature[] = [];
      geomanInstance.features.forEach((feature) => {
        if (isRemovableFeature(feature)) {
          removable.push(feature);
        }
      });
      removable.forEach((feature) => feature.remove());

      if (boundary) {
        await geomanInstance.features.importGeoJsonFeature(boundary);
        if (mapInstance) {
          fitMapToCollection(mapInstance, {
            type: 'FeatureCollection',
            features: [boundary],
          });
        }
      }

      lastAppliedBoundaryKey.current = boundaryKey;
    };

    void applyBoundary();
  }, [boundary, boundaryKey, isMapReady]);

  return (
    <div className="relative h-full min-h-[360px] w-full overflow-hidden rounded-2xl bg-stone-200">
      <div ref={mapContainer} className="absolute inset-0" />

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
          disabled={!boundary}
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
          disabled={!boundary}
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
          onClick={() => void clearBoundary()}
          disabled={!boundary}
          className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
        <p className="w-full text-xs text-stone-600">
          Draw one polygon for the ranch footprint. This outline is used to fit maps and warn when blocks drift outside the saved ranch area.
        </p>
      </div>

      {blocks.length > 0 ? (
        <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-medium text-stone-700 shadow-lg backdrop-blur">
          Reference blocks: {blocks.length}
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 rounded-2xl border border-white/70 bg-white/90 p-4 text-sm text-stone-700 shadow-lg backdrop-blur">
        <p className="font-semibold text-stone-900">
          {boundaryAcres ? `Current ranch boundary estimates ${boundaryAcres.toFixed(2)} acres` : 'No ranch boundary saved yet'}
        </p>
        <p className="mt-1">
          {boundary
            ? 'Save after editing to keep this ranch footprint for dashboard and block maps.'
            : 'Use Draw boundary to sketch the ranch footprint. The geometry is stored as GeoJSON in the ranch record.'}
        </p>
      </div>
    </div>
  );
}
