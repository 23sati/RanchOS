import {
  calculateGeometryAcres,
  normalizeBlockGeometry,
  type BlockGeometry,
  type BlockRecord,
} from '@/lib/blocks';

export type RanchRecord = {
  id: string;
  orgId: string;
  name: string;
  county: string | null;
  address: string | null;
  gpsLat: string | null;
  gpsLng: string | null;
  mapViewport: RanchMapViewport | null;
  boundary: RanchBoundary | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type RanchMapViewport = {
  center: [number, number];
  zoom: number;
  bounds: [[number, number], [number, number]];
};

export type RanchBoundary = BlockGeometry;

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Request failed.');
  }

  return payload as T;
}

export function ranchToCenter(ranch: Pick<RanchRecord, 'gpsLat' | 'gpsLng'> | null | undefined) {
  if (!ranch?.gpsLat || !ranch.gpsLng) {
    return null;
  }

  const lat = Number(ranch.gpsLat);
  const lng = Number(ranch.gpsLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return [lng, lat] as [number, number];
}

export function normalizeRanchMapViewport(value: unknown): RanchMapViewport | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const center = Array.isArray(candidate.center) ? candidate.center : null;
  const bounds = Array.isArray(candidate.bounds) ? candidate.bounds : null;
  const zoom = Number(candidate.zoom);

  if (
    !center || center.length !== 2 ||
    !bounds || bounds.length !== 2 ||
    !Array.isArray(bounds[0]) || !Array.isArray(bounds[1]) ||
    bounds[0].length !== 2 || bounds[1].length !== 2 ||
    !Number.isFinite(Number(center[0])) || !Number.isFinite(Number(center[1])) ||
    !Number.isFinite(zoom)
  ) {
    return null;
  }

  return {
    center: [Number(center[0]), Number(center[1])],
    zoom,
    bounds: [
      [Number(bounds[0][0]), Number(bounds[0][1])],
      [Number(bounds[1][0]), Number(bounds[1][1])],
    ],
  };
}

export function normalizeRanchBoundary(value: unknown): RanchBoundary | null {
  return normalizeBlockGeometry(value);
}

export function centerToCoordinateFields(center: [number, number] | null) {
  if (!center) {
    return { gpsLat: '', gpsLng: '' };
  }

  return {
    gpsLat: center[1].toFixed(8),
    gpsLng: center[0].toFixed(8),
  };
}

export function viewportToPayload(viewport: RanchMapViewport | null) {
  if (!viewport) {
    return null;
  }

  return {
    center: [
      Number(viewport.center[0].toFixed(8)),
      Number(viewport.center[1].toFixed(8)),
    ] as [number, number],
    zoom: Number(viewport.zoom.toFixed(4)),
    bounds: [
      [
        Number(viewport.bounds[0][0].toFixed(8)),
        Number(viewport.bounds[0][1].toFixed(8)),
      ],
      [
        Number(viewport.bounds[1][0].toFixed(8)),
        Number(viewport.bounds[1][1].toFixed(8)),
      ],
    ] as [[number, number], [number, number]],
  };
}

export function boundaryToPayload(boundary: RanchBoundary | null) {
  if (!boundary) {
    return null;
  }

  return normalizeBlockGeometry(boundary);
}

export function calculateRanchBoundaryAcres(boundary: RanchBoundary | null | undefined) {
  return calculateGeometryAcres(boundary ?? null);
}

export function calculateRanchCoverage(
  blocks: Array<Pick<BlockRecord, 'acreage'>>,
  boundary: RanchBoundary | null | undefined,
) {
  const mappedAcres = blocks.reduce((sum, block) => sum + Number(block.acreage ?? 0), 0);
  const boundaryAcres = calculateRanchBoundaryAcres(boundary);
  const coveragePct = boundaryAcres && boundaryAcres > 0
    ? (mappedAcres / boundaryAcres) * 100
    : null;

  return {
    mappedAcres,
    boundaryAcres,
    coveragePct,
    remainingAcres: boundaryAcres !== null
      ? Math.max(boundaryAcres - mappedAcres, 0)
      : null,
  };
}

export async function fetchRanches() {
  const ranchRows = await request<Array<Omit<RanchRecord, 'mapViewport' | 'boundary'> & { mapViewport: unknown; boundary: unknown }>>('/api/v1/ranches', {
    method: 'GET',
  });

  return ranchRows.map((ranch) => ({
    ...ranch,
    mapViewport: normalizeRanchMapViewport(ranch.mapViewport),
    boundary: normalizeRanchBoundary(ranch.boundary),
  }));
}

export async function updateRanch(id: string, payload: {
  name?: string;
  address?: string;
  gpsLat?: string | null;
  gpsLng?: string | null;
  mapViewport?: RanchMapViewport | null;
  boundary?: RanchBoundary | null;
}) {
  const data = await request<{ ranch: Omit<RanchRecord, 'mapViewport' | 'boundary'> & { mapViewport: unknown; boundary: unknown } }>(`/api/v1/ranches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...payload,
      mapViewport: 'mapViewport' in payload ? viewportToPayload(payload.mapViewport ?? null) : undefined,
      boundary: 'boundary' in payload ? boundaryToPayload(payload.boundary ?? null) : undefined,
    }),
  });

  return {
    ...data.ranch,
    mapViewport: normalizeRanchMapViewport(data.ranch.mapViewport),
    boundary: normalizeRanchBoundary(data.ranch.boundary),
  } satisfies RanchRecord;
}

export function hasMappedBlocks(blocks: BlockRecord[]) {
  return blocks.some((block) => block.geometry);
}
