import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import { ranches } from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeCoordinate(value: unknown, options: { min: number; max: number; fieldName: string }) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) {
    throw new Error(`${options.fieldName} must be between ${options.min} and ${options.max}.`);
  }

  return parsed.toFixed(8);
}

function normalizeViewportNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMapViewport(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Map viewport is invalid.');
  }

  const candidate = value as Record<string, unknown>;
  const center = Array.isArray(candidate.center) ? candidate.center : null;
  const bounds = Array.isArray(candidate.bounds) ? candidate.bounds : null;
  const zoom = normalizeViewportNumber(candidate.zoom);

  if (
    !center || center.length !== 2 ||
    !bounds || bounds.length !== 2 ||
    !Array.isArray(bounds[0]) || !Array.isArray(bounds[1]) ||
    bounds[0].length !== 2 || bounds[1].length !== 2 ||
    zoom === null
  ) {
    throw new Error('Map viewport is invalid.');
  }

  const centerLng = normalizeViewportNumber(center[0]);
  const centerLat = normalizeViewportNumber(center[1]);
  const minLng = normalizeViewportNumber(bounds[0][0]);
  const minLat = normalizeViewportNumber(bounds[0][1]);
  const maxLng = normalizeViewportNumber(bounds[1][0]);
  const maxLat = normalizeViewportNumber(bounds[1][1]);

  if (
    centerLng === null || centerLat === null ||
    minLng === null || minLat === null || maxLng === null || maxLat === null
  ) {
    throw new Error('Map viewport is invalid.');
  }

  return {
    center: [Number(centerLng.toFixed(8)), Number(centerLat.toFixed(8))] as [number, number],
    zoom: Number(zoom.toFixed(4)),
    bounds: [
      [Number(minLng.toFixed(8)), Number(minLat.toFixed(8))],
      [Number(maxLng.toFixed(8)), Number(maxLat.toFixed(8))],
    ] as [[number, number], [number, number]],
  };
}

function normalizeBoundary(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Ranch boundary is invalid.');
  }

  const candidate = value as Record<string, unknown>;
  const geometry = typeof candidate.geometry === 'object' && candidate.geometry !== null && !Array.isArray(candidate.geometry)
    ? candidate.geometry as Record<string, unknown>
    : null;

  if (
    candidate.type !== 'Feature' ||
    !geometry ||
    (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') ||
    !Array.isArray(geometry.coordinates)
  ) {
    throw new Error('Ranch boundary is invalid.');
  }

  return {
    type: 'Feature' as const,
    geometry: {
      type: geometry.type,
      coordinates: geometry.coordinates,
    },
    properties:
      typeof candidate.properties === 'object' && candidate.properties !== null && !Array.isArray(candidate.properties)
        ? candidate.properties
        : {},
  };
}

async function requireOwnedRanch(orgId: string, ranchId: string) {
  const ranch = await db.query.ranches.findFirst({
    where: and(eq(ranches.id, ranchId), eq(ranches.orgId, orgId)),
  });

  if (!ranch) {
    throw new Error('Ranch not found for this organization.');
  }

  return ranch;
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');

  const rows = await db.query.ranches.findMany({
    where: eq(ranches.orgId, orgId),
    orderBy: [asc(ranches.createdAt)],
  });

  return c.json(rows);
});

app.patch('/:id', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  const ranchId = c.req.param('id');

  try {
    await requireOwnedRanch(orgId, ranchId);
    const body = await c.req.json<Record<string, unknown>>();

    const gpsLat = 'gpsLat' in body
      ? normalizeCoordinate(body.gpsLat, { min: -90, max: 90, fieldName: 'Ranch latitude' })
      : undefined;
    const gpsLng = 'gpsLng' in body
      ? normalizeCoordinate(body.gpsLng, { min: -180, max: 180, fieldName: 'Ranch longitude' })
      : undefined;
    const mapViewport = normalizeMapViewport(body.mapViewport);
    const boundary = normalizeBoundary(body.boundary);

    if ((gpsLat === null && gpsLng !== null && gpsLng !== undefined) || (gpsLng === null && gpsLat !== null && gpsLat !== undefined)) {
      throw new Error('Add both ranch latitude and longitude, or clear both.');
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if ('name' in body) updates.name = normalizeText(body.name);
    if ('address' in body) updates.address = normalizeText(body.address);
    if ('gpsLat' in body) updates.gpsLat = gpsLat;
    if ('gpsLng' in body) updates.gpsLng = gpsLng;
    if ('mapViewport' in body) updates.mapViewport = mapViewport;
    if ('boundary' in body) updates.boundary = boundary;

    const [updatedRanch] = await db.update(ranches)
      .set(updates)
      .where(and(eq(ranches.id, ranchId), eq(ranches.orgId, orgId)))
      .returning();

    return c.json({
      ranch: updatedRanch,
      updatedBy: profileId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update ranch.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

export default app;
