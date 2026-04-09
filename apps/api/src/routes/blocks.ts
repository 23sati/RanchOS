import { Hono } from 'hono';
import { db } from '@ranchos/db/src';
import { blocks, ranches } from '@ranchos/db/src/schema';
import { eq, and, desc } from 'drizzle-orm';
import { orgScopeMiddleware } from '../middleware/auth';

const app = new Hono<{ Variables: { orgId: string, profileId: string } }>();

app.use('*', orgScopeMiddleware);

type BlockInsert = typeof blocks.$inferInsert;
type BlockCropType = NonNullable<BlockInsert['cropType']>;
type IrrigationType = Exclude<NonNullable<BlockInsert['irrigationType']>, undefined>;

const blockCropTypes: BlockCropType[] = ['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'];
const irrigationTypes: IrrigationType[] = ['drip', 'micro_spray', 'flood', 'overhead'];

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeEnum<T extends string>(value: unknown, options: readonly T[], fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!options.includes(normalized as T)) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return normalized as T;
}

function normalizeDecimal(value: unknown, fieldName: string) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a valid positive number.`);
  }

  return parsed.toFixed(2);
}

function normalizeInteger(value: unknown, fieldName: string) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a valid whole number.`);
  }

  return parsed;
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }
  }

  return fallback;
}

function normalizeGeometry(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Geometry must be valid GeoJSON.');
  }

  const geometryRecord = value as Record<string, unknown>;

  const normalizePolygonGeometry = (input: unknown) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return null;
    }

    const candidate = input as Record<string, unknown>;
    if ((candidate.type !== 'Polygon' && candidate.type !== 'MultiPolygon') || !Array.isArray(candidate.coordinates)) {
      return null;
    }

    return {
      type: candidate.type,
      coordinates: candidate.coordinates,
    };
  };

  if (geometryRecord.type === 'Feature') {
    const normalizedGeometry = normalizePolygonGeometry(geometryRecord.geometry);
    if (!normalizedGeometry) {
      throw new Error('Geometry must be a GeoJSON polygon or multipolygon feature.');
    }

    return {
      type: 'Feature',
      geometry: normalizedGeometry,
      properties:
        typeof geometryRecord.properties === 'object' && geometryRecord.properties !== null && !Array.isArray(geometryRecord.properties)
          ? geometryRecord.properties
          : {},
    };
  }

  const normalizedGeometry = normalizePolygonGeometry(geometryRecord);
  if (!normalizedGeometry) {
    throw new Error('Geometry must be a GeoJSON polygon or multipolygon feature.');
  }

  return {
    type: 'Feature',
    geometry: normalizedGeometry,
    properties: {},
  };
}

function sanitizeBlockInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const name = normalizeText(body.name);
  const ranchId = normalizeText(body.ranchId);
  const cropType = normalizeEnum(body.cropType, blockCropTypes, 'Crop type');
  const variety = normalizeText(body.variety);

  if (!isPartial) {
    if (!ranchId) {
      throw new Error('Ranch is required.');
    }

    if (!name) {
      throw new Error('Block name is required.');
    }

    if (!cropType) {
      throw new Error('Crop type is required.');
    }

    if (!variety) {
      throw new Error('Variety is required.');
    }
  }

  const values: Partial<BlockInsert> = {};

  if (ranchId) values.ranchId = ranchId;
  if (name) values.name = name;
  if (cropType) values.cropType = cropType;
  if (variety) values.variety = variety;
  if ('acreage' in body) values.acreage = normalizeDecimal(body.acreage, 'Acreage');
  if ('treeCount' in body) values.treeCount = normalizeInteger(body.treeCount, 'Tree count');
  if ('yearPlanted' in body) values.yearPlanted = normalizeInteger(body.yearPlanted, 'Year planted');
  if ('rootstock' in body) values.rootstock = normalizeText(body.rootstock);
  if ('irrigationType' in body) values.irrigationType = normalizeEnum(body.irrigationType, irrigationTypes, 'Irrigation type');
  if ('geometry' in body) values.geometry = normalizeGeometry(body.geometry);
  if ('isOrganic' in body) values.isOrganic = normalizeBoolean(body.isOrganic);
  if ('organicSince' in body) values.organicSince = normalizeText(body.organicSince);
  if ('apn' in body) values.apn = normalizeText(body.apn);
  if ('waterDistrict' in body) values.waterDistrict = normalizeText(body.waterDistrict);
  if ('gsaName' in body) values.gsaName = normalizeText(body.gsaName);
  if ('notes' in body) values.notes = normalizeText(body.notes);

  return values;
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
  const ranchId = c.req.query('ranch_id');
  
  const allBlocks = await db.select().from(blocks).where(
    ranchId 
      ? and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true))
      : and(eq(blocks.orgId, orgId), eq(blocks.active, true))
  ).orderBy(desc(blocks.createdAt));

  return c.json(allBlocks);
});

app.post('/', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeBlockInput(body);
    await requireOwnedRanch(orgId, String(values.ranchId));

    const [newBlock] = await db.insert(blocks).values({
      ranchId: values.ranchId!,
      name: values.name!,
      cropType: values.cropType!,
      variety: values.variety!,
      acreage: values.acreage ?? null,
      treeCount: values.treeCount ?? null,
      yearPlanted: values.yearPlanted ?? null,
      rootstock: values.rootstock ?? null,
      irrigationType: values.irrigationType ?? null,
      geometry: values.geometry ?? null,
      isOrganic: values.isOrganic ?? false,
      organicSince: values.organicSince ?? null,
      apn: values.apn ?? null,
      waterDistrict: values.waterDistrict ?? null,
      gsaName: values.gsaName ?? null,
      notes: values.notes ?? null,
      orgId,
      updatedBy: profileId,
    }).returning();

    return c.json(newBlock, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid block payload.';
    return c.json({ error: message }, 400);
  }
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const orgId = c.get('orgId');
  
  const block = await db.query.blocks.findFirst({
    where: and(eq(blocks.id, id), eq(blocks.orgId, orgId)),
  });
  
  if (!block) return c.json({ error: 'Not found' }, 404);
  return c.json(block);
});

app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeBlockInput(body, { partial: true });

    if (values.ranchId) {
      await requireOwnedRanch(orgId, String(values.ranchId));
    }

    const [updatedBlock] = await db.update(blocks)
      .set({ ...values, updatedBy: profileId, updatedAt: new Date() })
      .where(and(eq(blocks.id, id), eq(blocks.orgId, orgId)))
      .returning();

    if (!updatedBlock) {
      return c.json({ error: 'Not found' }, 404);
    }

    return c.json(updatedBlock);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid block payload.';
    return c.json({ error: message }, 400);
  }
});

app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  
  await db.update(blocks)
    .set({ active: false, updatedBy: profileId, updatedAt: new Date() })
    .where(and(eq(blocks.id, id), eq(blocks.orgId, orgId)));
     
  return c.json({ success: true });
});

export default app;
