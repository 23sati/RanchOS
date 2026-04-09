import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  blockIrrigationConfig,
  blocks,
  cimisStations,
  irrigationEvents,
  ranches,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import { enqueueRecommendationRefresh } from '../lib/refreshRecommendations';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

type IrrigationConfigInsert = typeof blockIrrigationConfig.$inferInsert;
type IrrigationEventInsert = typeof irrigationEvents.$inferInsert;
type SoilType = Exclude<NonNullable<IrrigationConfigInsert['soilType']>, undefined>;
type EventStatus = NonNullable<IrrigationEventInsert['status']>;

const soilTypes: SoilType[] = ['sandy', 'sandy_loam', 'loam', 'clay_loam', 'clay'];
const eventStatuses: EventStatus[] = ['scheduled', 'running', 'completed', 'skipped', 'problem'];

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

function normalizeDate(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must be a valid YYYY-MM-DD date.`);
  }

  return normalized;
}

function normalizeTime(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must use HH:MM 24-hour time.`);
  }

  return normalized;
}

function normalizeDecimal(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; scale?: number } = {},
) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  const min = options.min ?? 0;
  if (!Number.isFinite(parsed) || parsed < min || (options.max !== undefined && parsed > options.max)) {
    throw new Error(`${fieldName} is invalid.`);
  }

  const scale = options.scale ?? 2;
  return parsed.toFixed(scale);
}

function normalizeInteger(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number } = {},
) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  const min = options.min ?? 0;
  if (!Number.isFinite(parsed) || parsed < min || (options.max !== undefined && parsed > options.max)) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return parsed;
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

async function requireOwnedBlock(orgId: string, blockId: string) {
  const block = await db.query.blocks.findFirst({
    where: and(eq(blocks.id, blockId), eq(blocks.orgId, orgId), eq(blocks.active, true)),
  });

  if (!block) {
    throw new Error('Block not found for this organization.');
  }

  return block;
}

async function requireOwnedStation(stationId: number | null) {
  if (stationId === null) {
    return null;
  }

  const station = await db.query.cimisStations.findFirst({
    where: eq(cimisStations.id, stationId),
  });

  if (!station) {
    throw new Error('CIMIS station not found.');
  }

  return station;
}

function sanitizeConfigInput(body: Record<string, unknown>) {
  return {
    cimisStationId: 'cimisStationId' in body ? normalizeInteger(body.cimisStationId, 'CIMIS station', { min: 1 }) : undefined,
    soilType: 'soilType' in body ? normalizeEnum(body.soilType, soilTypes, 'Soil type') : undefined,
    emitterFlowGph: 'emitterFlowGph' in body ? normalizeDecimal(body.emitterFlowGph, 'Emitter flow', { scale: 3 }) : undefined,
    emittersPerTree: 'emittersPerTree' in body ? normalizeInteger(body.emittersPerTree, 'Emitters per tree', { min: 1 }) : undefined,
    treeSpacingFt: 'treeSpacingFt' in body ? normalizeDecimal(body.treeSpacingFt, 'Tree spacing', { scale: 2 }) : undefined,
    rowSpacingFt: 'rowSpacingFt' in body ? normalizeDecimal(body.rowSpacingFt, 'Row spacing', { scale: 2 }) : undefined,
    deficitTriggerInches:
      'deficitTriggerInches' in body ? normalizeDecimal(body.deficitTriggerInches, 'Deficit trigger', { scale: 2 }) : undefined,
  };
}

function sanitizeEventInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const blockId = 'blockId' in body ? normalizeText(body.blockId) : undefined;
  const scheduledDate = 'scheduledDate' in body ? normalizeDate(body.scheduledDate, 'Scheduled date') : undefined;
  const plannedRuntimeHours =
    'plannedRuntimeHours' in body ? normalizeDecimal(body.plannedRuntimeHours, 'Planned runtime', { scale: 2 }) : undefined;

  if (!isPartial) {
    if (!blockId) {
      throw new Error('Block is required.');
    }

    if (!scheduledDate) {
      throw new Error('Scheduled date is required.');
    }

    if (!plannedRuntimeHours) {
      throw new Error('Planned runtime is required.');
    }
  }

  return {
    blockId,
    scheduledDate,
    scheduledStartTime:
      'scheduledStartTime' in body ? normalizeTime(body.scheduledStartTime, 'Scheduled start time') : undefined,
    plannedRuntimeHours,
    plannedFlowRateGpm:
      'plannedFlowRateGpm' in body ? normalizeDecimal(body.plannedFlowRateGpm, 'Planned flow rate', { scale: 3 }) : undefined,
    actualRuntimeHours:
      'actualRuntimeHours' in body ? normalizeDecimal(body.actualRuntimeHours, 'Actual runtime', { scale: 2 }) : undefined,
    actualFlowRateGpm:
      'actualFlowRateGpm' in body ? normalizeDecimal(body.actualFlowRateGpm, 'Actual flow rate', { scale: 3 }) : undefined,
    waterAppliedAcreInches:
      'waterAppliedAcreInches' in body ? normalizeDecimal(body.waterAppliedAcreInches, 'Applied water', { scale: 4 }) : undefined,
    etDeficitInches:
      'etDeficitInches' in body ? normalizeDecimal(body.etDeficitInches, 'ET deficit', { scale: 4 }) : undefined,
    status: 'status' in body ? normalizeEnum(body.status, eventStatuses, 'Status') : undefined,
    notes: 'notes' in body ? normalizeText(body.notes) : undefined,
  };
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');
  const ranchId = c.req.query('ranch_id');

  try {
    if (!ranchId) {
      return c.json({ error: 'ranch_id is required.' }, 400);
    }

    await requireOwnedRanch(orgId, ranchId);

    const blockRows = await db
      .select({
        id: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        treeCount: blocks.treeCount,
        irrigationType: blocks.irrigationType,
        isOrganic: blocks.isOrganic,
        active: blocks.active,
      })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true)))
      .orderBy(asc(blocks.name));

    const blockIds = blockRows.map((block) => block.id);

    const [configRows, eventRows, stationRows] = await Promise.all([
      blockIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              id: blockIrrigationConfig.id,
              blockId: blockIrrigationConfig.blockId,
              cimisStationId: blockIrrigationConfig.cimisStationId,
              soilType: blockIrrigationConfig.soilType,
              emitterFlowGph: blockIrrigationConfig.emitterFlowGph,
              emittersPerTree: blockIrrigationConfig.emittersPerTree,
              treeSpacingFt: blockIrrigationConfig.treeSpacingFt,
              rowSpacingFt: blockIrrigationConfig.rowSpacingFt,
              deficitTriggerInches: blockIrrigationConfig.deficitTriggerInches,
              updatedAt: blockIrrigationConfig.updatedAt,
            })
            .from(blockIrrigationConfig)
            .where(inArray(blockIrrigationConfig.blockId, blockIds)),
      blockIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              id: irrigationEvents.id,
              orgId: irrigationEvents.orgId,
              blockId: irrigationEvents.blockId,
              blockName: blocks.name,
              scheduledDate: irrigationEvents.scheduledDate,
              scheduledStartTime: irrigationEvents.scheduledStartTime,
              plannedRuntimeHours: irrigationEvents.plannedRuntimeHours,
              plannedFlowRateGpm: irrigationEvents.plannedFlowRateGpm,
              actualRuntimeHours: irrigationEvents.actualRuntimeHours,
              actualFlowRateGpm: irrigationEvents.actualFlowRateGpm,
              waterAppliedAcreInches: irrigationEvents.waterAppliedAcreInches,
              status: irrigationEvents.status,
              etDeficitInches: irrigationEvents.etDeficitInches,
              notes: irrigationEvents.notes,
              createdAt: irrigationEvents.createdAt,
              updatedAt: irrigationEvents.updatedAt,
            })
            .from(irrigationEvents)
            .innerJoin(blocks, eq(irrigationEvents.blockId, blocks.id))
            .where(and(eq(irrigationEvents.orgId, orgId), inArray(irrigationEvents.blockId, blockIds)))
            .orderBy(desc(irrigationEvents.scheduledDate), desc(irrigationEvents.createdAt)),
      db
        .select({
          id: cimisStations.id,
          name: cimisStations.name,
          county: cimisStations.county,
          lat: cimisStations.lat,
          lng: cimisStations.lng,
          isActive: cimisStations.isActive,
        })
        .from(cimisStations)
        .where(eq(cimisStations.isActive, true))
        .orderBy(asc(cimisStations.name)),
    ]);

    const configsByBlockId = new Map(configRows.map((config) => [config.blockId, config]));
    const stationById = new Map(stationRows.map((station) => [station.id, station]));

    const blocksWithConfig = blockRows.map((block) => {
      const config = configsByBlockId.get(block.id) ?? null;
      return {
        ...block,
        config: config
          ? {
              ...config,
              cimisStation: config.cimisStationId ? stationById.get(config.cimisStationId) ?? null : null,
            }
          : null,
      };
    });

    return c.json({
      blocks: blocksWithConfig,
      stations: stationRows,
      events: eventRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load irrigation data.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.put('/configs/:blockId', async (c) => {
  const orgId = c.get('orgId');
  const blockId = c.req.param('blockId');

  try {
    await requireOwnedBlock(orgId, blockId);
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeConfigInput(body);

    if (values.cimisStationId !== undefined) {
      await requireOwnedStation(values.cimisStationId);
    }

    const upsertValues: Partial<IrrigationConfigInsert> = {};
    if (values.cimisStationId !== undefined) upsertValues.cimisStationId = values.cimisStationId;
    if (values.soilType !== undefined) upsertValues.soilType = values.soilType;
    if (values.emitterFlowGph !== undefined) upsertValues.emitterFlowGph = values.emitterFlowGph;
    if (values.emittersPerTree !== undefined) upsertValues.emittersPerTree = values.emittersPerTree;
    if (values.treeSpacingFt !== undefined) upsertValues.treeSpacingFt = values.treeSpacingFt;
    if (values.rowSpacingFt !== undefined) upsertValues.rowSpacingFt = values.rowSpacingFt;
    if (values.deficitTriggerInches !== undefined) upsertValues.deficitTriggerInches = values.deficitTriggerInches;

    const [savedConfig] = await db
      .insert(blockIrrigationConfig)
      .values({
        blockId,
        cimisStationId: values.cimisStationId ?? null,
        soilType: values.soilType ?? null,
        emitterFlowGph: values.emitterFlowGph ?? null,
        emittersPerTree: values.emittersPerTree ?? null,
        treeSpacingFt: values.treeSpacingFt ?? null,
        rowSpacingFt: values.rowSpacingFt ?? null,
        deficitTriggerInches: values.deficitTriggerInches ?? '1.50',
      })
      .onConflictDoUpdate({
        target: blockIrrigationConfig.blockId,
        set: {
          ...upsertValues,
          updatedAt: new Date(),
        },
      })
      .returning();

    const station = savedConfig.cimisStationId
      ? await db.query.cimisStations.findFirst({ where: eq(cimisStations.id, savedConfig.cimisStationId) })
      : null;

    await enqueueRecommendationRefresh({
      orgId,
      includeEnvironmental: true,
      reason: 'irrigation_config_saved',
    });
    return c.json({
      ...savedConfig,
      cimisStation: station ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save irrigation config.';
    const status = message === 'Block not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.post('/events', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeEventInput(body);
    const block = await requireOwnedBlock(orgId, values.blockId!);

    const [event] = await db
      .insert(irrigationEvents)
      .values({
        orgId,
        blockId: block.id,
        scheduledDate: values.scheduledDate!,
        scheduledStartTime: values.scheduledStartTime ?? null,
        plannedRuntimeHours: values.plannedRuntimeHours!,
        plannedFlowRateGpm: values.plannedFlowRateGpm ?? null,
        actualRuntimeHours: values.actualRuntimeHours ?? null,
        actualFlowRateGpm: values.actualFlowRateGpm ?? null,
        waterAppliedAcreInches: values.waterAppliedAcreInches ?? null,
        etDeficitInches: values.etDeficitInches ?? null,
        status: values.status ?? 'scheduled',
        notes: values.notes ?? null,
        createdBy: profileId,
        updatedBy: profileId,
      })
      .returning();

    await enqueueRecommendationRefresh({
      orgId,
      includeEnvironmental: true,
      reason: 'irrigation_event_created',
    });
    return c.json({
      ...event,
      blockName: block.name,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create irrigation event.';
    const status = message === 'Block not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.patch('/events/:id', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  const id = c.req.param('id');

  try {
    const existing = await db.query.irrigationEvents.findFirst({
      where: and(eq(irrigationEvents.id, id), eq(irrigationEvents.orgId, orgId)),
    });

    if (!existing) {
      return c.json({ error: 'Irrigation event not found.' }, 404);
    }

    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeEventInput(body, { partial: true });

    if (values.blockId) {
      await requireOwnedBlock(orgId, values.blockId);
    }

    const updates: Partial<IrrigationEventInsert> = {
      updatedBy: profileId,
      updatedAt: new Date(),
    };

    if (values.blockId) updates.blockId = values.blockId;
    if (values.scheduledDate) updates.scheduledDate = values.scheduledDate;
    if (values.scheduledStartTime !== undefined) updates.scheduledStartTime = values.scheduledStartTime ?? null;
    if (values.plannedRuntimeHours) updates.plannedRuntimeHours = values.plannedRuntimeHours;
    if (values.plannedFlowRateGpm !== undefined) updates.plannedFlowRateGpm = values.plannedFlowRateGpm ?? null;
    if (values.actualRuntimeHours !== undefined) updates.actualRuntimeHours = values.actualRuntimeHours ?? null;
    if (values.actualFlowRateGpm !== undefined) updates.actualFlowRateGpm = values.actualFlowRateGpm ?? null;
    if (values.waterAppliedAcreInches !== undefined) updates.waterAppliedAcreInches = values.waterAppliedAcreInches ?? null;
    if (values.etDeficitInches !== undefined) updates.etDeficitInches = values.etDeficitInches ?? null;
    if (values.status) updates.status = values.status;
    if (values.notes !== undefined) updates.notes = values.notes ?? null;

    const [updatedEvent] = await db
      .update(irrigationEvents)
      .set(updates)
      .where(and(eq(irrigationEvents.id, id), eq(irrigationEvents.orgId, orgId)))
      .returning();

    const block = await db.query.blocks.findFirst({
      where: eq(blocks.id, updatedEvent.blockId),
    });

    await enqueueRecommendationRefresh({
      orgId,
      includeEnvironmental: true,
      reason: 'irrigation_event_updated',
    });
    return c.json({
      ...updatedEvent,
      blockName: block?.name ?? 'Block',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update irrigation event.';
    return c.json({ error: message }, 400);
  }
});

export default app;
