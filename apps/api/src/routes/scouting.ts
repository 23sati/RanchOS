import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  blocks,
  pestSpecies,
  profiles,
  ranches,
  scoutingLogs,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import { enqueueRecommendationRefresh } from '../lib/refreshRecommendations';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

type ScoutingLogInsert = typeof scoutingLogs.$inferInsert;
type PestSpeciesInsert = typeof pestSpecies.$inferInsert;
type ScoutingRating = Exclude<NonNullable<ScoutingLogInsert['rating']>, undefined>;

const ratingOptions: ScoutingRating[] = ['none', 'low', 'moderate', 'high', 'action'];

const defaultPestSpecies: Pick<
  PestSpeciesInsert,
  | 'nameEn'
  | 'nameEs'
  | 'nameScientific'
  | 'category'
  | 'applicableCrops'
  | 'actionThresholdDescription'
  | 'isAllowedInOrganic'
  | 'ucIpmUrl'
>[] = [
  {
    nameEn: 'Navel Orangeworm',
    nameEs: 'Gusano Naranja Naval',
    nameScientific: 'Amyelois transitella',
    category: 'insect',
    applicableCrops: ['almond'],
    actionThresholdDescription: 'Escalate when trap pressure rises into hull split or field samples trend upward.',
    isAllowedInOrganic: false,
    ucIpmUrl: 'https://ipm.ucanr.edu/agriculture/almond/navel-orangeworm/',
  },
  {
    nameEn: 'Aphids',
    nameEs: 'Pulgones',
    nameScientific: 'Aphididae',
    category: 'insect',
    applicableCrops: ['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
    actionThresholdDescription: 'Track hot spots and beneficial activity before treatment decisions.',
    isAllowedInOrganic: true,
    ucIpmUrl: 'https://ipm.ucanr.edu',
  },
  {
    nameEn: 'Spider Mites',
    nameEs: 'Arana Roja',
    nameScientific: 'Tetranychidae',
    category: 'mite',
    applicableCrops: ['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
    actionThresholdDescription: 'Escalate when colonies expand and leaf feeding becomes visible.',
    isAllowedInOrganic: true,
    ucIpmUrl: 'https://ipm.ucanr.edu',
  },
  {
    nameEn: 'Citrus Thrips',
    nameEs: 'Trips de los Citricos',
    nameScientific: 'Scirtothrips citri',
    category: 'insect',
    applicableCrops: ['navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
    actionThresholdDescription: 'Watch fruitlet feeding injury during sensitive flush periods.',
    isAllowedInOrganic: false,
    ucIpmUrl: 'https://ipm.ucanr.edu/agriculture/citrus/citrus-thrips/',
  },
  {
    nameEn: 'Scale',
    nameEs: 'Escama',
    nameScientific: 'Coccoidea',
    category: 'insect',
    applicableCrops: ['navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
    actionThresholdDescription: 'Inspect limbs and fruit for crawler activity and coverage.',
    isAllowedInOrganic: false,
    ucIpmUrl: 'https://ipm.ucanr.edu',
  },
  {
    nameEn: 'Alternaria',
    nameEs: 'Alternaria',
    nameScientific: 'Alternaria alternata',
    category: 'disease',
    applicableCrops: ['mandarin', 'lemon', 'navel_orange', 'valencia_orange', 'grapefruit'],
    actionThresholdDescription: 'Escalate when lesion pressure shows up with humid weather windows.',
    isAllowedInOrganic: true,
    ucIpmUrl: 'https://ipm.ucanr.edu',
  },
  {
    nameEn: 'Weed Pressure',
    nameEs: 'Presion de Maleza',
    nameScientific: null,
    category: 'weed',
    applicableCrops: ['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
    actionThresholdDescription: 'Document row middles and berm escapes before they spread.',
    isAllowedInOrganic: true,
    ucIpmUrl: 'https://ipm.ucanr.edu',
  },
  {
    nameEn: 'Lady Beetles',
    nameEs: 'Mariquitas',
    nameScientific: 'Coccinellidae',
    category: 'beneficial',
    applicableCrops: ['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
    actionThresholdDescription: 'Log beneficial presence to support monitor-only recommendations.',
    isAllowedInOrganic: true,
    ucIpmUrl: 'https://ipm.ucanr.edu',
  },
];

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

  return parsed.toFixed(options.scale ?? 2);
}

function normalizeDateTime(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return parsed.toISOString();
}

function sanitizeLogInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const blockId = 'blockId' in body ? normalizeText(body.blockId) : undefined;
  const scoutedAt = 'scoutedAt' in body ? normalizeDateTime(body.scoutedAt, 'Scouted at') : undefined;
  const pestSpeciesId = 'pestSpeciesId' in body ? normalizeText(body.pestSpeciesId) : undefined;
  const pestNameCustom = 'pestNameCustom' in body ? normalizeText(body.pestNameCustom) : undefined;
  const rating = 'rating' in body ? normalizeEnum(body.rating, ratingOptions, 'Rating') : undefined;

  if (!isPartial && !blockId) {
    throw new Error('Block is required.');
  }

  return {
    blockId,
    scoutedAt,
    pestSpeciesId,
    pestNameCustom,
    rating,
    countPerSample:
      'countPerSample' in body ? normalizeDecimal(body.countPerSample, 'Count per sample', { scale: 2 }) : undefined,
    sampleCount:
      'sampleCount' in body ? normalizeInteger(body.sampleCount, 'Sample count', { min: 1 }) : undefined,
    observationNotes: 'observationNotes' in body ? normalizeText(body.observationNotes) : undefined,
    gpsLat:
      'gpsLat' in body ? normalizeDecimal(body.gpsLat, 'GPS latitude', { min: -90, max: 90, scale: 8 }) : undefined,
    gpsLng:
      'gpsLng' in body ? normalizeDecimal(body.gpsLng, 'GPS longitude', { min: -180, max: 180, scale: 8 }) : undefined,
  };
}

async function ensureDefaultPestSpecies() {
  const existing = await db
    .select({
      id: pestSpecies.id,
      nameEn: pestSpecies.nameEn,
    })
    .from(pestSpecies)
    .where(eq(pestSpecies.isSystem, true));

  const existingNames = new Set(existing.map((species) => species.nameEn));
  const missing = defaultPestSpecies.filter((species) => !existingNames.has(species.nameEn));

  if (missing.length > 0) {
    await db.insert(pestSpecies).values(missing.map((species) => ({ ...species, isSystem: true })));
  }
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

async function requirePestSpecies(pestSpeciesId: string | null) {
  if (!pestSpeciesId) {
    return null;
  }

  const species = await db.query.pestSpecies.findFirst({
    where: eq(pestSpecies.id, pestSpeciesId),
  });

  if (!species) {
    throw new Error('Pest species not found.');
  }

  return species;
}

async function buildScoutingPayloads(logRows: (typeof scoutingLogs.$inferSelect)[]) {
  if (logRows.length === 0) {
    return [];
  }

  const blockIds = Array.from(new Set(logRows.map((log) => log.blockId)));
  const profileIds = Array.from(new Set(logRows.map((log) => log.scoutedBy)));
  const speciesIds = Array.from(
    new Set(logRows.map((log) => log.pestSpeciesId).filter((value): value is string => Boolean(value))),
  );

  const [blockRows, profileRows, speciesRows] = await Promise.all([
    db
      .select({
        id: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        isOrganic: blocks.isOrganic,
        active: blocks.active,
      })
      .from(blocks)
      .where(inArray(blocks.id, blockIds)),
    db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        role: profiles.role,
      })
      .from(profiles)
      .where(inArray(profiles.id, profileIds)),
    speciesIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: pestSpecies.id,
            nameEn: pestSpecies.nameEn,
            nameEs: pestSpecies.nameEs,
            nameScientific: pestSpecies.nameScientific,
            category: pestSpecies.category,
            applicableCrops: pestSpecies.applicableCrops,
            actionThresholdDescription: pestSpecies.actionThresholdDescription,
            isAllowedInOrganic: pestSpecies.isAllowedInOrganic,
            ucIpmUrl: pestSpecies.ucIpmUrl,
            isSystem: pestSpecies.isSystem,
          })
          .from(pestSpecies)
          .where(inArray(pestSpecies.id, speciesIds)),
  ]);

  const blocksById = new Map(blockRows.map((block) => [block.id, block]));
  const profilesById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const speciesById = new Map(speciesRows.map((species) => [species.id, species]));

  return logRows.map((log) => {
    const block = blocksById.get(log.blockId) ?? null;
    const scout = profilesById.get(log.scoutedBy) ?? null;
    const species = log.pestSpeciesId ? speciesById.get(log.pestSpeciesId) ?? null : null;

    return {
      ...log,
      block,
      scoutedByProfile: scout,
      pestSpecies: species,
      pestDisplayName: species?.nameEn ?? log.pestNameCustom ?? 'Custom pest',
    };
  });
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');
  const ranchId = c.req.query('ranch_id');

  try {
    if (!ranchId) {
      return c.json({ error: 'ranch_id is required.' }, 400);
    }

    await ensureDefaultPestSpecies();
    await requireOwnedRanch(orgId, ranchId);

    const [blockRows, speciesRows] = await Promise.all([
      db
        .select({
          id: blocks.id,
          name: blocks.name,
          ranchId: blocks.ranchId,
          cropType: blocks.cropType,
          variety: blocks.variety,
          acreage: blocks.acreage,
          treeCount: blocks.treeCount,
          isOrganic: blocks.isOrganic,
          active: blocks.active,
        })
        .from(blocks)
        .where(and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true)))
        .orderBy(asc(blocks.name)),
      db
        .select({
          id: pestSpecies.id,
          nameEn: pestSpecies.nameEn,
          nameEs: pestSpecies.nameEs,
          nameScientific: pestSpecies.nameScientific,
          category: pestSpecies.category,
          applicableCrops: pestSpecies.applicableCrops,
          actionThresholdDescription: pestSpecies.actionThresholdDescription,
          isAllowedInOrganic: pestSpecies.isAllowedInOrganic,
          ucIpmUrl: pestSpecies.ucIpmUrl,
          isSystem: pestSpecies.isSystem,
        })
        .from(pestSpecies)
        .orderBy(asc(pestSpecies.category), asc(pestSpecies.nameEn)),
    ]);

    const blockIds = blockRows.map((block) => block.id);
    const logRows =
      blockIds.length === 0
        ? []
        : await db
            .select()
            .from(scoutingLogs)
            .where(and(eq(scoutingLogs.orgId, orgId), inArray(scoutingLogs.blockId, blockIds)))
            .orderBy(desc(scoutingLogs.scoutedAt), desc(scoutingLogs.createdAt));

    return c.json({
      blocks: blockRows,
      species: speciesRows,
      logs: await buildScoutingPayloads(logRows),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load scouting data.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.get('/logs/:id', async (c) => {
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  const log = await db.query.scoutingLogs.findFirst({
    where: and(eq(scoutingLogs.id, id), eq(scoutingLogs.orgId, orgId)),
  });

  if (!log) {
    return c.json({ error: 'Scouting log not found.' }, 404);
  }

  const [payload] = await buildScoutingPayloads([log]);
  return c.json(payload);
});

app.post('/logs', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    await ensureDefaultPestSpecies();
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeLogInput(body);

    if (!values.blockId) {
      return c.json({ error: 'Block is required.' }, 400);
    }

    if (!values.pestSpeciesId && !values.pestNameCustom) {
      return c.json({ error: 'Choose a pest species or enter a custom pest name.' }, 400);
    }

    await Promise.all([
      requireOwnedBlock(orgId, values.blockId),
      requirePestSpecies(values.pestSpeciesId ?? null),
    ]);

    const [createdLog] = await db
      .insert(scoutingLogs)
      .values({
        orgId,
        blockId: values.blockId,
        scoutedBy: profileId,
        scoutedAt: values.scoutedAt ? new Date(values.scoutedAt) : new Date(),
        pestSpeciesId: values.pestSpeciesId ?? null,
        pestNameCustom: values.pestNameCustom ?? null,
        rating: values.rating ?? 'moderate',
        countPerSample: values.countPerSample ?? null,
        sampleCount: values.sampleCount ?? null,
        observationNotes: values.observationNotes ?? null,
        gpsLat: values.gpsLat ?? null,
        gpsLng: values.gpsLng ?? null,
      })
      .returning();

    const [payload] = await buildScoutingPayloads([createdLog]);
    await enqueueRecommendationRefresh({ orgId, reason: 'scouting_created' });
    return c.json(payload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create scouting log.';
    const status = message === 'Block not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.patch('/logs/:id', async (c) => {
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  try {
    await ensureDefaultPestSpecies();
    const existingLog = await db.query.scoutingLogs.findFirst({
      where: and(eq(scoutingLogs.id, id), eq(scoutingLogs.orgId, orgId)),
    });

    if (!existingLog) {
      return c.json({ error: 'Scouting log not found.' }, 404);
    }

    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeLogInput(body, { partial: true });

    if (values.blockId) {
      await requireOwnedBlock(orgId, values.blockId);
    }

    if (values.pestSpeciesId !== undefined) {
      await requirePestSpecies(values.pestSpeciesId ?? null);
    }

    const nextPestSpeciesId = values.pestSpeciesId !== undefined ? values.pestSpeciesId ?? null : existingLog.pestSpeciesId;
    const nextPestNameCustom =
      values.pestNameCustom !== undefined ? values.pestNameCustom ?? null : existingLog.pestNameCustom;

    if (!nextPestSpeciesId && !nextPestNameCustom) {
      return c.json({ error: 'Choose a pest species or enter a custom pest name.' }, 400);
    }

    const updates: Partial<ScoutingLogInsert> = {};
    if (values.blockId) updates.blockId = values.blockId;
    if (values.scoutedAt) updates.scoutedAt = new Date(values.scoutedAt);
    if (values.pestSpeciesId !== undefined) updates.pestSpeciesId = values.pestSpeciesId ?? null;
    if (values.pestNameCustom !== undefined) updates.pestNameCustom = values.pestNameCustom ?? null;
    if (values.rating !== undefined) updates.rating = values.rating ?? null;
    if (values.countPerSample !== undefined) updates.countPerSample = values.countPerSample ?? null;
    if (values.sampleCount !== undefined) updates.sampleCount = values.sampleCount ?? null;
    if (values.observationNotes !== undefined) updates.observationNotes = values.observationNotes ?? null;
    if (values.gpsLat !== undefined) updates.gpsLat = values.gpsLat ?? null;
    if (values.gpsLng !== undefined) updates.gpsLng = values.gpsLng ?? null;

    const [updatedLog] = await db
      .update(scoutingLogs)
      .set(updates)
      .where(and(eq(scoutingLogs.id, id), eq(scoutingLogs.orgId, orgId)))
      .returning();

    const [payload] = await buildScoutingPayloads([updatedLog]);
    await enqueueRecommendationRefresh({ orgId, reason: 'scouting_updated' });
    return c.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update scouting log.';
    return c.json({ error: message }, 400);
  }
});

app.delete('/logs/:id', async (c) => {
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  const [deletedLog] = await db
    .delete(scoutingLogs)
    .where(and(eq(scoutingLogs.id, id), eq(scoutingLogs.orgId, orgId)))
    .returning({ id: scoutingLogs.id });

  if (!deletedLog) {
    return c.json({ error: 'Scouting log not found.' }, 404);
  }

  await enqueueRecommendationRefresh({ orgId, reason: 'scouting_deleted' });
  return c.json({ success: true });
});

export default app;
