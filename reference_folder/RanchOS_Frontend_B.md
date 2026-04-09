# RanchOS — Frontend Implementation Plan
## Part B: Dashboard Home, Blocks Module & Map Interface

> **Prerequisite:** `RanchOS_Frontend_A.md` (design system)  
> **Stack:** Next.js 14 App Router · Mapbox GL JS · react-map-gl · @mapbox/mapbox-gl-draw · @turf/turf  
> **Continued in:** `RanchOS_Frontend_C.md`

---

## 1. Owner Dashboard (`app/(dashboard)/page.tsx`)

```tsx
// apps/web/src/app/(dashboard)/page.tsx
import { Suspense } from 'react';
import { getServerSession } from '@/lib/auth/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { WeatherWidget } from '@/components/dashboard/WeatherWidget';
import { ActiveTasksSummary } from '@/components/dashboard/ActiveTasksSummary';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { BlockStatusMiniMap } from '@/components/dashboard/BlockStatusMiniMap';
import { FrostAlertBanner } from '@/components/dashboard/FrostAlertBanner';
import { getOrgStats } from '@/lib/api/dashboard';
import { ClipboardListIcon, MapIcon, UsersIcon, AlertTriangleIcon } from 'lucide-react';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const session = await getServerSession();
  const stats = await getOrgStats(session.orgId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Frost alert banner — shown if temp forecast < threshold (Phase 2+ full auto) */}
      <Suspense fallback={null}>
        <FrostAlertBanner orgId={session.orgId} />
      </Suspense>

      <PageHeader
        title={`Good morning, ${session.user.firstName} 👋`}
        subtitle="Here's what's happening on your ranch today."
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Tasks" value={stats.activeTasks} icon={ClipboardListIcon} color="blue"
          subtext={`${stats.overdueTasks} overdue`}
          trend={{ value: stats.taskTrend, label: 'vs last week' }} />
        <StatCard label="Blocks" value={stats.totalBlocks} icon={MapIcon} color="green"
          subtext={`${stats.organicBlocks} organic`} />
        <StatCard label="Crew Active" value={stats.activeCrew} icon={UsersIcon} color="amber"
          subtext="online today" />
        <StatCard label="Urgent Tasks" value={stats.urgentTasks} icon={AlertTriangleIcon}
          color={stats.urgentTasks > 0 ? 'red' : 'green'}
          subtext={stats.urgentTasks > 0 ? 'Needs attention' : 'All clear'} />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — tasks + weather */}
        <div className="lg:col-span-2 space-y-6">
          <WeatherWidget lat={stats.ranch?.gpsLat} lng={stats.ranch?.gpsLng} />
          <ActiveTasksSummary orgId={session.orgId} />
        </div>

        {/* Right — mini-map + activity feed */}
        <div className="space-y-6">
          <BlockStatusMiniMap orgId={session.orgId} />
          <ActivityFeed orgId={session.orgId} />
        </div>
      </div>
    </div>
  );
}
```

---

## 2. Weather Widget

```tsx
// apps/web/src/components/dashboard/WeatherWidget.tsx
'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { useTranslation } from 'react-i18next';
import { ThermometerIcon, CloudRainIcon, WindIcon, SunIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface WeatherDay {
  date: string;
  tempMax: number; tempMin: number;
  precip: number;
  weatherCode: number;
}

interface WeatherWidgetProps { lat?: number; lng?: number; }

const FROST_THRESHOLD_F = 32;

function cToF(c: number) { return Math.round(c * 9/5 + 32); }
function getWeatherIcon(code: number) {
  if (code === 0) return '☀️';
  if (code <= 3) return '🌤️';
  if (code <= 57) return '🌧️';
  if (code >= 71) return '❄️';
  return '🌥️';
}

export function WeatherWidget({ lat, lng }: WeatherWidgetProps) {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!lat || !lng) { setLoading(false); return; }
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=America%2FLos_Angeles&forecast_days=7`)
      .then(r => r.json())
      .then(data => {
        const days: WeatherDay[] = data.daily.time.map((date: string, i: number) => ({
          date,
          tempMax: data.daily.temperature_2m_max[i],
          tempMin: data.daily.temperature_2m_min[i],
          precip: data.daily.precipitation_sum[i],
          weatherCode: data.daily.weathercode[i],
        }));
        setWeather(days);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [lat, lng]);

  if (loading) return (
    <Card>
      <CardContent className="p-5">
        <div className="h-28 skeleton" />
      </CardContent>
    </Card>
  );

  if (error || !weather.length) return null;

  const today = weather[0];
  const hasFrostRisk = weather.slice(0, 3).some(d => cToF(d.tempMin) < FROST_THRESHOLD_F + 4);

  return (
    <Card id="weather-widget">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h3">{t('dashboard.weather')}</h2>
          {hasFrostRisk && (
            <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full flex items-center gap-1.5 animate-pulse-slow">
              ❄️ {t('dashboard.frost_risk_alert')}
            </span>
          )}
        </div>

        {/* Today hero */}
        <div className="flex items-center gap-6 mb-5">
          <span className="text-5xl">{getWeatherIcon(today.weatherCode)}</span>
          <div>
            <p className="text-3xl font-bold tabular-nums">{cToF(today.tempMax)}°F</p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('dashboard.low')}: {cToF(today.tempMin)}°F · {t('dashboard.rain')}: {today.precip.toFixed(1)}"
            </p>
          </div>
        </div>

        {/* 7-day strip */}
        <div className="grid grid-cols-7 gap-1">
          {weather.map((day, i) => {
            const d = new Date(day.date + 'T12:00:00');
            const dayLabel = i === 0 ? t('common.today') : d.toLocaleDateString('en-US', { weekday: 'short' });
            const isFrost = cToF(day.tempMin) < FROST_THRESHOLD_F;
            return (
              <div key={day.date} className={cn(
                'flex flex-col items-center gap-1 p-2 rounded-lg text-center',
                i === 0 ? 'bg-[var(--color-bg-secondary)]' : 'hover:bg-[var(--color-bg-secondary)] transition-colors',
                isFrost && 'ring-1 ring-blue-300'
              )}>
                <span className="text-xs font-medium text-[var(--color-text-muted)]">{dayLabel}</span>
                <span className="text-lg">{getWeatherIcon(day.weatherCode)}</span>
                <span className="text-xs font-semibold">{cToF(day.tempMax)}°</span>
                <span className={cn('text-xs', isFrost ? 'text-blue-600 font-bold' : 'text-[var(--color-text-muted)]')}>
                  {cToF(day.tempMin)}°
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 3. Activity Feed (SSE-Powered)

```tsx
// apps/web/src/components/dashboard/ActivityFeed.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils/cn';
import { getApiUrl } from '@/lib/api/client';

interface ActivityEvent {
  id: string;
  type: 'task_completed' | 'task_created' | 'task_synced' | 'block_created' | 'member_joined';
  message: string;
  actor?: string;
  timestamp: number;
}

const EVENT_ICONS: Record<ActivityEvent['type'], string> = {
  task_completed: '✅',
  task_created:   '📋',
  task_synced:    '🔄',
  block_created:  '🗺️',
  member_joined:  '👤',
};

export function ActivityFeed({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource(`${getApiUrl()}/api/v1/events/${orgId}`, { withCredentials: true });

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    source.addEventListener('update', (e) => {
      const data = JSON.parse(e.data) as ActivityEvent;
      setEvents(prev => [{ ...data, id: crypto.randomUUID(), timestamp: Date.now() }, ...prev].slice(0, 50));
    });

    return () => source.close();
  }, [orgId]);

  return (
    <Card id="activity-feed" className="h-80 flex flex-col">
      <CardHeader className="py-3 px-5">
        <div className="flex items-center justify-between">
          <h2 className="text-h3">{t('dashboard.activity')}</h2>
          <div className={cn('flex items-center gap-1.5 text-xs font-medium', connected ? 'text-leaf' : 'text-[var(--color-text-muted)]')}>
            <span className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-leaf animate-pulse' : 'bg-[var(--color-border-strong)]')} />
            {connected ? t('common.live') : t('common.disconnected')}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto px-5 py-3 space-y-3" ref={containerRef}>
        {events.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">{t('dashboard.no_activity')}</p>
        )}
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-3 animate-slide-up">
            <span className="text-lg flex-shrink-0">{EVENT_ICONS[event.type]}</span>
            <div className="min-w-0">
              <p className="text-sm text-[var(--color-text-primary)] leading-snug">{event.message}</p>
              {event.actor && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{event.actor}</p>}
            </div>
            <time className="text-xs text-[var(--color-text-muted)] flex-shrink-0 ml-auto">
              {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </time>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

---

## 4. Blocks Module — Page Layout (`app/(dashboard)/blocks/page.tsx`)

```tsx
// apps/web/src/app/(dashboard)/blocks/page.tsx
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { BlocksView } from '@/components/blocks/BlocksView';
import { Button } from '@/components/ui/Button';
import { PlusIcon } from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: 'Blocks' };

export default function BlocksPage() {
  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in">
      <PageHeader
        title="Blocks"
        subtitle="Manage your orchard blocks and field boundaries."
        actions={
          <Link href="/blocks/new">
            <Button id="create-block-btn" icon={<PlusIcon className="w-4 h-4" />}>
              Add Block
            </Button>
          </Link>
        }
      />
      <Suspense fallback={<BlocksViewSkeleton />}>
        <BlocksView />
      </Suspense>
    </div>
  );
}

function BlocksViewSkeleton() {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">
      <div className="lg:col-span-2 space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)}
      </div>
      <div className="lg:col-span-3 min-h-96 skeleton rounded-xl" />
    </div>
  );
}
```

---

## 5. Blocks Split View (List + Map)

```tsx
// apps/web/src/components/blocks/BlocksView.tsx
'use client';
import { useState, useCallback } from 'react';
import { BlockList } from './BlockList';
import { BlockMap } from '../map/BlockMap';
import { ViewToggle } from './ViewToggle';
import { BlockFilters } from './BlockFilters';
import type { Block } from '@ranchos/shared';

type ViewMode = 'split' | 'map' | 'list';

export function BlocksView() {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ cropType: 'all', organicOnly: false, ranch: 'all' });

  const handleBlockSelect = useCallback((id: string) => {
    setSelectedBlockId(prev => prev === id ? null : id);
  }, []);

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-4">
        <BlockFilters filters={filters} onChange={setFilters} />
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Content area */}
      <div className={`flex gap-4 flex-1 min-h-0 ${viewMode === 'split' ? 'flex-row' : 'flex-col'}`}>
        {(viewMode === 'split' || viewMode === 'list') && (
          <div className={viewMode === 'split' ? 'w-80 xl:w-96 flex-shrink-0 overflow-y-auto' : 'w-full'}>
            <BlockList
              filters={filters}
              selectedId={selectedBlockId}
              onSelect={handleBlockSelect}
              compact={viewMode === 'split'}
            />
          </div>
        )}
        {(viewMode === 'split' || viewMode === 'map') && (
          <div className="flex-1 min-h-[500px] rounded-xl overflow-hidden border border-[var(--color-border)] shadow-sm">
            <BlockMap
              selectedBlockId={selectedBlockId}
              onBlockSelect={handleBlockSelect}
              filters={filters}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 6. BlockMap Component (Mapbox)

```tsx
// apps/web/src/components/map/BlockMap.tsx
'use client';
import { useRef, useCallback, useState, useEffect } from 'react';
import Map, { Layer, Source, Popup, NavigationControl, FullscreenControl } from 'react-map-gl';
import type { MapRef, MapMouseEvent } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useBlocks } from '@/lib/hooks/useBlocks';
import { BlockPopup } from './BlockPopup';
import { BlockDrawToolbar } from './BlockDrawToolbar';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
const DEFAULT_CENTER = { longitude: -119.7, latitude: 36.7 }; // Fresno County center

// Color by crop type
const CROP_COLORS: Record<string, string> = {
  almond: '#F59E0B', navel_orange: '#FB923C', valencia_orange: '#F97316',
  lemon: '#EAB308', mandarin: '#F97316', grapefruit: '#EC4899',
};

interface BlockMapProps {
  selectedBlockId: string | null;
  onBlockSelect: (id: string) => void;
  filters: { cropType: string; organicOnly: boolean; ranch: string };
}

export function BlockMap({ selectedBlockId, onBlockSelect, filters }: BlockMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [popupInfo, setPopupInfo] = useState<{ lng: number; lat: number; blockId: string } | null>(null);
  const [drawMode, setDrawMode] = useState(false);

  const { data: blocks, isLoading } = useBlocks(filters);

  const geojson = {
    type: 'FeatureCollection' as const,
    features: (blocks ?? []).map(b => ({
      type: 'Feature' as const,
      id: b.id,
      properties: {
        id: b.id,
        name: b.name,
        cropType: b.cropType,
        isOrganic: b.isOrganic,
        acreage: b.acreage,
        color: CROP_COLORS[b.cropType] ?? '#6B7280',
      },
      geometry: b.geometry,
    }))
  };

  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (drawMode) return;
    const features = mapRef.current?.queryRenderedFeatures(e.point, { layers: ['blocks-fill'] });
    if (features?.length) {
      const blockId = String(features[0].properties?.id);
      onBlockSelect(blockId);
      setPopupInfo({ lng: e.lngLat.lng, lat: e.lngLat.lat, blockId });
    } else {
      setPopupInfo(null);
    }
  }, [drawMode, onBlockSelect]);

  // Fly to selected block
  useEffect(() => {
    if (!selectedBlockId || !blocks) return;
    const block = blocks.find(b => b.id === selectedBlockId);
    if (block?.centroid) {
      mapRef.current?.flyTo({ center: block.centroid, zoom: 15, duration: 800 });
    }
  }, [selectedBlockId, blocks]);

  return (
    <div id="block-map" className="relative w-full h-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
        initialViewState={{ ...DEFAULT_CENTER, zoom: 11 }}
        onClick={handleMapClick}
        interactiveLayerIds={['blocks-fill']}
        cursor={drawMode ? 'crosshair' : 'pointer'}
      >
        {/* Block polygons */}
        <Source id="blocks" type="geojson" data={geojson}>
          {/* Fill layer */}
          <Layer
            id="blocks-fill"
            type="fill"
            paint={{
              'fill-color': ['get', 'color'],
              'fill-opacity': ['case', ['==', ['get', 'id'], selectedBlockId ?? ''], 0.5, 0.25],
            }}
          />
          {/* Stroke layer */}
          <Layer
            id="blocks-stroke"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': ['case', ['==', ['get', 'id'], selectedBlockId ?? ''], 3, 1.5],
              'line-opacity': 0.9,
            }}
          />
          {/* Organic dashed border overlay */}
          <Layer
            id="blocks-organic"
            type="line"
            filter={['==', ['get', 'isOrganic'], true]}
            paint={{
              'line-color': '#22C55E',
              'line-width': 2,
              'line-dasharray': [3, 2],
              'line-opacity': 0.8,
            }}
          />
          {/* Block name labels */}
          <Layer
            id="blocks-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'name'],
              'text-size': 12,
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-anchor': 'center',
            }}
            paint={{
              'text-color': '#ffffff',
              'text-halo-color': 'rgba(0,0,0,0.7)',
              'text-halo-width': 1.5,
            }}
          />
        </Source>

        {/* Map popup */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.lng}
            latitude={popupInfo.lat}
            anchor="bottom"
            onClose={() => setPopupInfo(null)}
            className="!font-sans"
            maxWidth="280px"
          >
            <BlockPopup blockId={popupInfo.blockId} />
          </Popup>
        )}

        {/* Controls */}
        <NavigationControl position="top-right" showCompass={false} />
        <FullscreenControl position="top-right" />
      </Map>

      {/* Draw tool overlay */}
      <BlockDrawToolbar
        active={drawMode}
        onToggle={() => setDrawMode(d => !d)}
        mapRef={mapRef}
      />

      {/* Legend */}
      <BlockMapLegend />
    </div>
  );
}

function BlockMapLegend() {
  return (
    <div className="absolute bottom-8 left-4 bg-black/60 backdrop-blur-sm text-white rounded-lg px-3 py-2 text-xs space-y-1.5">
      {Object.entries({ almond: 'Almond', navel_orange: 'Navel Orange', lemon: 'Lemon' }).map(([key, label]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: CROP_COLORS[key] }} />
          <span>{label}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 border-t border-white/20 pt-1.5">
        <span className="w-3 h-0.5 flex-shrink-0 border-t-2 border-dashed border-emerald-400" />
        <span>Organic</span>
      </div>
    </div>
  );
}
```

---

## 7. BlockDrawToolbar (polygon draw)

```tsx
// apps/web/src/components/map/BlockDrawToolbar.tsx
'use client';
import { useEffect, useCallback, type RefObject } from 'react';
import type { MapRef } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import * as turf from '@turf/turf';
import { Button } from '@/components/ui/Button';
import { PenToolIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

interface BlockDrawToolbarProps {
  active: boolean;
  onToggle: () => void;
  mapRef: RefObject<MapRef>;
}

export function BlockDrawToolbar({ active, onToggle, mapRef }: BlockDrawToolbarProps) {
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    if (active) {
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        modes: { ...MapboxDraw.modes },
        styles: [
          { id: 'gl-draw-polygon-fill', type: 'fill', filter: ['all', ['==', '$type', 'Polygon']],
            paint: { 'fill-color': '#22C55E', 'fill-opacity': 0.25 } },
          { id: 'gl-draw-polygon-stroke', type: 'line', filter: ['all', ['==', '$type', 'Polygon']],
            paint: { 'line-color': '#22C55E', 'line-width': 2 } },
        ]
      });

      map.addControl(draw, 'top-left');
      draw.changeMode('draw_polygon');

      const onDrawCreate = (e: { features: GeoJSON.Feature[] }) => {
        const feature = e.features[0];
        if (feature?.geometry.type === 'Polygon') {
          const areaSqMeters = turf.area(feature);
          const acreage = (areaSqMeters / 4046.86).toFixed(2);
          const geomJson = encodeURIComponent(JSON.stringify(feature.geometry));
          router.push(`/blocks/new?geometry=${geomJson}&acreage=${acreage}`);
        }
        draw.deleteAll();
        onToggle();
      };

      map.on('draw.create', onDrawCreate);
      return () => {
        map.off('draw.create', onDrawCreate);
        map.removeControl(draw);
      };
    }
  }, [active, mapRef, router, onToggle]);

  return (
    <div className="absolute top-4 left-4 flex flex-col gap-2">
      <Button
        id="draw-block-btn"
        variant={active ? 'secondary' : 'primary'}
        size="sm"
        onClick={onToggle}
        icon={active ? <XIcon className="w-4 h-4" /> : <PenToolIcon className="w-4 h-4" />}
        className="shadow-map-control"
      >
        {active ? t('blocks.cancel_draw') : t('blocks.draw_block')}
      </Button>
      {!active && (
        <a href="/blocks/new" className="text-xs text-center text-white/80 hover:text-white bg-black/50 rounded-md px-3 py-1.5 transition-colors backdrop-blur-sm">
          {t('blocks.enter_manually')}
        </a>
      )}
    </div>
  );
}
```

---

## 8. BlockPopup Component

```tsx
// apps/web/src/components/map/BlockPopup.tsx
'use client';
import { useBlock } from '@/lib/hooks/useBlocks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ArrowRightIcon, LeafIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

interface BlockPopupProps { blockId: string; }

export function BlockPopup({ blockId }: BlockPopupProps) {
  const { data: block, isLoading } = useBlock(blockId);
  const { t } = useTranslation();

  if (isLoading) return (
    <div className="p-3 space-y-2 w-52">
      <div className="h-4 skeleton" /><div className="h-4 w-3/4 skeleton" />
    </div>
  );
  if (!block) return null;

  return (
    <div className="p-1 font-sans">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm text-stone-900 leading-tight">{block.name}</h3>
        {block.isOrganic && (
          <Badge color="organic" className="flex-shrink-0">
            <LeafIcon className="w-3 h-3" />
            {t('blocks.organic')}
          </Badge>
        )}
      </div>
      <div className="space-y-1 text-xs text-stone-600 mb-3">
        <p>{block.variety} · {block.acreage} acres</p>
        <p>{t(`crop.${block.cropType}`)} · {t(`irrigation.${block.irrigationType}`)}</p>
        {block.openTaskCount > 0 && (
          <p className="text-amber-700 font-medium">📋 {block.openTaskCount} {t('blocks.open_tasks')}</p>
        )}
        {block.apn && <p className="text-stone-400">APN: {block.apn}</p>}
      </div>
      <Link href={`/blocks/${blockId}`} tabIndex={0}>
        <Button size="sm" variant="secondary" className="w-full" icon={<ArrowRightIcon className="w-3.5 h-3.5" />}>
          {t('common.view_details')}
        </Button>
      </Link>
    </div>
  );
}
```

---

## 9. BlockCard Component

```tsx
// apps/web/src/components/blocks/BlockCard.tsx
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LeafIcon, MapPinIcon, ClipboardListIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/cn';
import type { Block } from '@ranchos/shared';

const CROP_DOT: Record<string, string> = {
  almond: 'bg-amber-400', navel_orange: 'bg-orange-400', valencia_orange: 'bg-orange-500',
  lemon: 'bg-yellow-400', mandarin: 'bg-orange-300', grapefruit: 'bg-pink-400',
};

interface BlockCardProps {
  block: Block & { openTaskCount?: number };
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export function BlockCard({ block, selected, compact, onClick }: BlockCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      hover
      onClick={onClick}
      className={cn(
        'transition-all duration-200',
        selected && 'ring-2 ring-[var(--color-ranch-leaf)] shadow-card-hover',
      )}
    >
      <CardContent className={cn('p-4', compact && 'p-3')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5', CROP_DOT[block.cropType] ?? 'bg-stone-400')} />
            <div className="min-w-0">
              <p className="font-semibold text-sm text-[var(--color-text-primary)] truncate">{block.name}</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                {block.variety} · {block.acreage} {t('common.acres')}
              </p>
            </div>
          </div>
          {block.isOrganic && (
            <Badge color="organic" className="flex-shrink-0">
              <LeafIcon className="w-3 h-3" />
              {compact ? '' : t('blocks.organic')}
            </Badge>
          )}
        </div>

        {!compact && (
          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <MapPinIcon className="w-3.5 h-3.5" />
              {block.ranchName}
            </span>
            {(block.openTaskCount ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <ClipboardListIcon className="w-3.5 h-3.5" />
                {block.openTaskCount} {t('blocks.open_tasks')}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## 10. BlockForm Component (Create / Edit)

```tsx
// apps/web/src/components/blocks/BlockForm.tsx
'use client';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { useTranslation } from 'react-i18next';
import { LeafIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { CropType, IrrigationType } from '@ranchos/shared';

interface BlockFormValues {
  name: string;
  cropType: CropType;
  variety: string;
  acreage: number;
  treeCount?: number;
  yearPlanted?: number;
  irrigationType: IrrigationType;
  isOrganic: boolean;
  organicSince?: string;
  apn?: string;
  waterDistrict?: string;
  ranchId: string;
  notes?: string;
}

interface BlockFormProps {
  defaultValues?: Partial<BlockFormValues>;
  onSubmit: (data: BlockFormValues) => Promise<void>;
  submitLabel?: string;
  prefilledAcreage?: number;
}

const CROP_OPTIONS: { value: CropType; labelKey: string }[] = [
  { value: 'almond', labelKey: 'crop.almond' },
  { value: 'navel_orange', labelKey: 'crop.navel_orange' },
  { value: 'valencia_orange', labelKey: 'crop.valencia_orange' },
  { value: 'lemon', labelKey: 'crop.lemon' },
  { value: 'mandarin', labelKey: 'crop.mandarin' },
  { value: 'grapefruit', labelKey: 'crop.grapefruit' },
];

const IRRIGATION_OPTIONS: { value: IrrigationType; labelKey: string }[] = [
  { value: 'drip', labelKey: 'irrigation.drip' },
  { value: 'micro_spray', labelKey: 'irrigation.micro_spray' },
  { value: 'flood', labelKey: 'irrigation.flood' },
  { value: 'overhead', labelKey: 'irrigation.overhead' },
];

export function BlockForm({ defaultValues, onSubmit, submitLabel, prefilledAcreage }: BlockFormProps) {
  const { t } = useTranslation();
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<BlockFormValues>({
    defaultValues: { isOrganic: false, acreage: prefilledAcreage, ...defaultValues }
  });
  const isOrganic = watch('isOrganic');

  const inputCls = (hasError?: boolean) => cn(
    'w-full px-3 py-2 text-sm border rounded-lg bg-[var(--color-bg-card)] transition-all',
    'focus:ring-2 focus:ring-sky/30 focus:border-sky focus:outline-none',
    hasError ? 'border-red-400 focus:ring-red-200' : 'border-[var(--color-border)]'
  );

  return (
    <form id="block-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Row 1: Name + Ranch */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
            {t('blocks.name')} *
          </label>
          <input id="block-name" {...register('name', { required: t('validation.required') })} className={inputCls(!!errors.name)} placeholder="North Block" />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
            {t('blocks.ranch')} *
          </label>
          <RanchSelect register={register} error={errors.ranchId?.message} />
        </div>
      </div>

      {/* Row 2: Crop type + Variety */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
            {t('blocks.crop_type')} *
          </label>
          <select id="block-crop-type" {...register('cropType', { required: true })} className={inputCls(!!errors.cropType)}>
            {CROP_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
            {t('blocks.variety')} *
          </label>
          <input id="block-variety" {...register('variety', { required: true })} className={inputCls(!!errors.variety)} placeholder="Nonpareil" />
        </div>
      </div>

      {/* Row 3: Acreage + Irrigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
            {t('blocks.acreage')} *
          </label>
          <input id="block-acreage" type="number" step="0.01" min="0.1" {...register('acreage', { required: true, min: 0.1 })} className={inputCls(!!errors.acreage)} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
            {t('blocks.tree_count')}
          </label>
          <input id="block-tree-count" type="number" {...register('treeCount')} className={inputCls()} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
            {t('blocks.year_planted')}
          </label>
          <input id="block-year-planted" type="number" min="1960" max={new Date().getFullYear()} {...register('yearPlanted')} className={inputCls()} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
            {t('blocks.irrigation')} *
          </label>
          <select id="block-irrigation" {...register('irrigationType', { required: true })} className={inputCls()}>
            {IRRIGATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
          </select>
        </div>
      </div>

      {/* Organic toggle */}
      <div className={cn('rounded-xl border-2 p-4 transition-all duration-200', isOrganic ? 'border-emerald-300 bg-emerald-50/50' : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]')}>
        <label className="flex items-center gap-3 cursor-pointer">
          <div className={cn('relative w-10 h-5 rounded-full transition-colors duration-200', isOrganic ? 'bg-emerald-500' : 'bg-[var(--color-border-strong)]')}>
            <input id="block-is-organic" type="checkbox" {...register('isOrganic')} className="sr-only" />
            <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200', isOrganic && 'translate-x-5')} />
          </div>
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <LeafIcon className="w-4 h-4 text-emerald-600" />
              {t('blocks.organic_certified')}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">{t('blocks.organic_description')}</p>
          </div>
        </label>

        {isOrganic && (
          <div className="mt-4 grid grid-cols-2 gap-4 animate-slide-up">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">
                {t('blocks.organic_since')}
              </label>
              <input id="block-organic-since" type="date" {...register('organicSince')} className={inputCls()} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">
                {t('blocks.certification_body')}
              </label>
              <select className={inputCls()}>
                <option value="ccof">CCOF</option>
                <option value="ocia">OCIA</option>
                <option value="oregon_tilth">Oregon Tilth</option>
                <option value="other">{t('common.other')}</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* SGMA / Water section */}
      <div className="rounded-xl border border-[var(--color-border)] p-4 bg-[var(--color-bg-secondary)]">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
          {t('blocks.water_reporting')} (SGMA)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">{t('blocks.apn')}</label>
            <input id="block-apn" {...register('apn')} className={inputCls()} placeholder="019-020-010" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">{t('blocks.water_district')}</label>
            <input id="block-water-district" {...register('waterDistrict')} className={inputCls()} />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">{t('common.notes')}</label>
        <textarea id="block-notes" {...register('notes')} rows={3} className={inputCls()} />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost">{t('common.cancel')}</Button>
        <Button type="submit" loading={isSubmitting} id="block-form-submit">
          {submitLabel ?? t('blocks.save_block')}
        </Button>
      </div>
    </form>
  );
}
```

---

## 11. Block Detail Page (`app/(dashboard)/blocks/[id]/page.tsx`)

```tsx
// apps/web/src/app/(dashboard)/blocks/[id]/page.tsx
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { BlockSeasonHistory } from '@/components/blocks/BlockSeasonHistory';
import { BlockTaskList } from '@/components/tasks/BlockTaskList';
import { LeafIcon, DropletIcon, CalendarIcon } from 'lucide-react';
import { getBlock, getBlockSeasons } from '@/lib/api/blocks';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const block = await getBlock(params.id);
  return { title: block?.name ?? 'Block' };
}

export default async function BlockDetailPage({ params }: { params: { id: string } }) {
  const [block, seasons] = await Promise.all([getBlock(params.id), getBlockSeasons(params.id)]);
  if (!block) notFound();

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader
        title={block.name}
        breadcrumb={[{ label: 'Blocks', href: '/blocks' }, { label: block.name }]}
        subtitle={`${block.ranchName} · ${block.variety} · ${block.acreage} acres`}
        actions={
          <div className="flex items-center gap-2">
            {block.isOrganic && <Badge color="organic"><LeafIcon className="w-3.5 h-3.5" /> Organic</Badge>}
            <a href={`/blocks/${block.id}/edit`} className="btn-secondary text-sm">Edit Block</a>
          </div>
        }
      />

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: LeafIcon, label: 'Crop', value: block.cropType.replace('_', ' ') },
          { icon: CalendarIcon, label: 'Planted', value: block.yearPlanted ?? 'Unknown' },
          { icon: DropletIcon, label: 'Irrigation', value: block.irrigationType.replace('_', ' ') },
          { icon: MapPinIcon, label: 'APN', value: block.apn ?? 'Not set' },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
                <p className="text-sm font-semibold capitalize">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Season history */}
      <BlockSeasonHistory seasons={seasons} blockId={block.id} />

      {/* Open tasks */}
      <Card>
        <CardHeader><h2 className="text-h3">Open Tasks</h2></CardHeader>
        <BlockTaskList blockId={block.id} />
      </Card>
    </div>
  );
}
```

---

## 12. Block Season History Component

```tsx
// apps/web/src/components/blocks/BlockSeasonHistory.tsx
'use client';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import type { BlockSeason } from '@ranchos/shared';

interface BlockSeasonHistoryProps {
  seasons: BlockSeason[];
  blockId: string;
}

export function BlockSeasonHistory({ seasons }: BlockSeasonHistoryProps) {
  const { t } = useTranslation();
  const chartData = seasons.map(s => ({
    year: s.seasonYear,
    yield: s.totalYieldLbs ? Math.round(s.totalYieldLbs) : 0,
    yieldPerAcre: s.yieldPerAcre ? parseFloat(s.yieldPerAcre.toFixed(0)) : 0,
  }));

  return (
    <Card id="season-history">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-h3">{t('blocks.season_history')}</h2>
          <button className="text-sm text-[var(--color-ranch-sky)] hover:underline">{t('common.add_season')}</button>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '12px' }}
                formatter={(value) => [`${Number(value).toLocaleString()} lbs`, 'Yield']}
              />
              <Bar dataKey="yield" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">{t('blocks.no_season_data')}</p>
        )}

        {/* Season table */}
        {seasons.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <th className="text-left pb-2">{t('blocks.season')}</th>
                  <th className="text-right pb-2">{t('blocks.bloom')}</th>
                  <th className="text-right pb-2">{t('blocks.harvest_start')}</th>
                  <th className="text-right pb-2">{t('blocks.yield_lbs')}</th>
                  <th className="text-right pb-2">{t('blocks.lbs_per_acre')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {seasons.map(s => (
                  <tr key={s.id} className="hover:bg-[var(--color-bg-secondary)] transition-colors">
                    <td className="py-2 font-semibold">{s.seasonYear}</td>
                    <td className="py-2 text-right text-[var(--color-text-secondary)]">{s.bloomDate ?? '—'}</td>
                    <td className="py-2 text-right text-[var(--color-text-secondary)]">{s.harvestStart ?? '—'}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{s.totalYieldLbs ? s.totalYieldLbs.toLocaleString() : '—'}</td>
                    <td className="py-2 text-right font-medium tabular-nums text-[var(--color-ranch-sun)]">{s.yieldPerAcre ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## 13. Hooks — `useBlocks`

```typescript
// apps/web/src/lib/hooks/useBlocks.ts
import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';
import type { Block } from '@ranchos/shared';

interface BlockFilters { cropType?: string; organicOnly?: boolean; ranch?: string; }

export function useBlocks(filters?: BlockFilters) {
  const params = new URLSearchParams();
  if (filters?.cropType && filters.cropType !== 'all') params.set('crop_type', filters.cropType);
  if (filters?.organicOnly) params.set('organic', 'true');
  if (filters?.ranch && filters.ranch !== 'all') params.set('ranch_id', filters.ranch);

  return useSWR<Block[]>(`/blocks?${params}`, apiClient.get);
}

export function useBlock(id: string) {
  return useSWR<Block & { openTaskCount: number; ranchName: string; centroid?: [number, number] }>(
    id ? `/blocks/${id}` : null,
    apiClient.get
  );
}
```

```typescript
// apps/web/src/lib/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function getApiUrl() { return API_URL; }

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

export const apiClient = {
  get:    <T>(url: string) => fetchJson<T>(url),
  post:   <T>(url: string, body: unknown) => fetchJson<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  patch:  <T>(url: string, body: unknown) => fetchJson<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(url: string) => fetchJson<T>(url, { method: 'DELETE' }),
};
```

---

*Continued in `RanchOS_Frontend_C.md` — Tasks module (Kanban), Auth pages, and Onboarding wizard.*
