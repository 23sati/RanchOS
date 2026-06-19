import { area, booleanWithin, difference, featureCollection, intersect } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export const blockCropOptions = [
  { value: 'almond', label: 'Almond' },
  { value: 'navel_orange', label: 'Navel Orange' },
  { value: 'valencia_orange', label: 'Valencia Orange' },
  { value: 'lemon', label: 'Lemon' },
  { value: 'mandarin', label: 'Mandarin' },
  { value: 'grapefruit', label: 'Grapefruit' },
] as const;

export const irrigationOptions = [
  { value: 'drip', label: 'Drip' },
  { value: 'micro_spray', label: 'Micro Spray' },
  { value: 'flood', label: 'Flood' },
  { value: 'overhead', label: 'Overhead' },
] as const;

export type BlockGeometry = Feature<Polygon | MultiPolygon, Record<string, unknown>>;

export type BlockRecord = {
  id: string;
  orgId: string;
  ranchId: string;
  name: string;
  cropType: string;
  variety: string;
  acreage: string | null;
  treeCount: number | null;
  yearPlanted: number | null;
  rootstock: string | null;
  irrigationType: string | null;
  geometry: unknown;
  isOrganic: boolean;
  organicSince: string | null;
  apn: string | null;
  waterDistrict: string | null;
  gsaName: string | null;
  notes: string | null;
  active: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BlockFormValues = {
  ranchId: string;
  name: string;
  cropType: string;
  variety: string;
  acreage: string;
  treeCount: string;
  yearPlanted: string;
  rootstock: string;
  irrigationType: string;
  isOrganic: boolean;
  organicSince: string;
  apn: string;
  waterDistrict: string;
  gsaName: string;
  notes: string;
  geometry: BlockGeometry | null;
};

export type BlockOverlapDetail = {
  blockId: string;
  name: string;
  overlapAcres: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPolygonGeometry(value: unknown): value is Polygon | MultiPolygon {
  return (
    isRecord(value) &&
    (value.type === 'Polygon' || value.type === 'MultiPolygon') &&
    Array.isArray(value.coordinates)
  );
}

export function normalizeBlockGeometry(
  value: unknown,
  properties: Record<string, unknown> = {},
): BlockGeometry | null {
  if (!value) {
    return null;
  }

  if (isRecord(value) && value.type === 'Feature' && isPolygonGeometry(value.geometry)) {
    return {
      type: 'Feature',
      geometry: value.geometry,
      properties: isRecord(value.properties) ? { ...value.properties, ...properties } : properties,
    };
  }

  if (isPolygonGeometry(value)) {
    return {
      type: 'Feature',
      geometry: value,
      properties,
    };
  }

  return null;
}

export function calculateGeometryAcres(geometry: BlockGeometry | null | undefined) {
  if (!geometry) {
    return null;
  }

  return area(geometry) / 4046.8564224;
}

export function snapGeometryInsideBoundary(
  geometry: BlockGeometry | null | undefined,
  boundary: BlockGeometry | null | undefined,
) {
  if (!geometry || !boundary) {
    return geometry ?? null;
  }

  if (booleanWithin(geometry, boundary)) {
    return normalizeBlockGeometry(geometry);
  }

  const clipped = intersect(featureCollection([geometry, boundary]));
  return normalizeBlockGeometry(clipped);
}

export function getBlockOverlapDetails(
  geometry: BlockGeometry | null | undefined,
  blocks: BlockRecord[],
) {
  if (!geometry) {
    return [] as BlockOverlapDetail[];
  }

  return blocks
    .map((block) => {
      const blockGeometry = blockToMapFeature(block);
      if (!blockGeometry) {
        return null;
      }

      const overlap = intersect(featureCollection([geometry, blockGeometry]));
      const overlapGeometry = normalizeBlockGeometry(overlap);
      const overlapAcres = calculateGeometryAcres(overlapGeometry);

      if (!overlapGeometry || !overlapAcres || overlapAcres < 0.01) {
        return null;
      }

      return {
        blockId: block.id,
        name: block.name,
        overlapAcres,
      } satisfies BlockOverlapDetail;
    })
    .filter((detail): detail is BlockOverlapDetail => Boolean(detail));
}

export function calculateOverlapAcres(details: BlockOverlapDetail[]) {
  return details.reduce((sum, detail) => sum + detail.overlapAcres, 0);
}

export function calculateBlockTopologySummary(blocks: BlockRecord[]) {
  let overlapPairs = 0;
  let overlapAcres = 0;

  blocks.forEach((block, index) => {
    const geometry = blockToMapFeature(block);
    if (!geometry) {
      return;
    }

    const overlaps = getBlockOverlapDetails(geometry, blocks.slice(index + 1));
    overlapPairs += overlaps.length;
    overlapAcres += calculateOverlapAcres(overlaps);
  });

  return {
    overlapPairs,
    overlapAcres,
  };
}

export function calculateUncoveredRanchGeometry(
  boundary: BlockGeometry | null | undefined,
  blocks: BlockRecord[],
) {
  let remaining = normalizeBlockGeometry(boundary);
  if (!remaining) {
    return null;
  }

  for (const block of blocks) {
    const blockGeometry = blockToMapFeature(block);
    if (!blockGeometry) {
      continue;
    }

    const nextRemaining = difference(featureCollection([remaining, blockGeometry]));
    remaining = normalizeBlockGeometry(nextRemaining);

    if (!remaining) {
      return null;
    }
  }

  return remaining;
}

export function formatBlockCropLabel(value: string) {
  return blockCropOptions.find((option) => option.value === value)?.label ?? value.replace(/_/g, ' ');
}

export function blockToMapFeature(block: BlockRecord) {
  return normalizeBlockGeometry(block.geometry, {
    blockId: block.id,
    name: block.name,
    cropType: block.cropType,
    variety: block.variety,
    isOrganic: block.isOrganic,
    acreage: block.acreage,
  });
}

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

function nullableString(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

export function blockToFormValues(block: BlockRecord): BlockFormValues {
  return {
    ranchId: block.ranchId,
    name: block.name,
    cropType: block.cropType,
    variety: block.variety,
    acreage: block.acreage ?? '',
    treeCount: block.treeCount?.toString() ?? '',
    yearPlanted: block.yearPlanted?.toString() ?? '',
    rootstock: block.rootstock ?? '',
    irrigationType: block.irrigationType ?? '',
    isOrganic: Boolean(block.isOrganic),
    organicSince: block.organicSince ?? '',
    apn: block.apn ?? '',
    waterDistrict: block.waterDistrict ?? '',
    gsaName: block.gsaName ?? '',
    notes: block.notes ?? '',
    geometry: normalizeBlockGeometry(block.geometry),
  };
}

export function buildBlockPayload(values: BlockFormValues) {
  return {
    ranchId: values.ranchId,
    name: values.name,
    cropType: values.cropType,
    variety: values.variety,
    acreage: nullableString(values.acreage),
    treeCount: nullableString(values.treeCount),
    yearPlanted: nullableString(values.yearPlanted),
    rootstock: nullableString(values.rootstock),
    irrigationType: nullableString(values.irrigationType),
    isOrganic: values.isOrganic,
    organicSince: nullableString(values.organicSince),
    apn: nullableString(values.apn),
    waterDistrict: nullableString(values.waterDistrict),
    gsaName: nullableString(values.gsaName),
    notes: nullableString(values.notes),
    geometry: values.geometry,
  };
}

export async function fetchBlocks(ranchId?: string) {
  const query = ranchId ? `?ranch_id=${encodeURIComponent(ranchId)}` : '';
  return request<BlockRecord[]>(`/api/v1/blocks${query}`, {
    method: 'GET',
  });
}

export async function fetchBlock(id: string) {
  return request<BlockRecord>(`/api/v1/blocks/${id}`, {
    method: 'GET',
  });
}

export async function createBlock(values: BlockFormValues) {
  return request<BlockRecord>('/api/v1/blocks', {
    method: 'POST',
    body: JSON.stringify(buildBlockPayload(values)),
  });
}

export async function updateBlock(id: string, values: BlockFormValues) {
  return request<BlockRecord>(`/api/v1/blocks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(buildBlockPayload(values)),
  });
}

export async function deleteBlock(id: string) {
  return request<{ success: true }>(`/api/v1/blocks/${id}`, {
    method: 'DELETE',
  });
}
