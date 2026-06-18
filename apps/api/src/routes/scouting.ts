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
const ratingSeverity: Record<ScoutingRating, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
  action: 4,
};

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

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function scoreRating(value: ScoutingRating | null | undefined) {
  return value ? ratingSeverity[value] : -1;
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');
  const ranchId = normalizeText(c.req.query('ranch_id'));

  try {
    await ensureDefaultPestSpecies();
    if (ranchId) {
      await requireOwnedRanch(orgId, ranchId);
    }

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
        .where(
          ranchId
            ? and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true))
            : and(eq(blocks.orgId, orgId), eq(blocks.active, true)),
        )
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

    const logs = await buildScoutingPayloads(logRows);
    const now = new Date();
    const recentCutoff = addDays(now, -14);
    const staleCutoff = addDays(now, -10);

    const blockInsights = blockRows.map((block) => {
      const blockLogs = logs
        .filter((log) => log.blockId === block.id)
        .sort((left, right) => new Date(right.scoutedAt).getTime() - new Date(left.scoutedAt).getTime());
      const recentLogs = blockLogs.filter((log) => new Date(log.scoutedAt) >= recentCutoff);
      const followUpLogs = recentLogs.filter((log) => log.rating === 'action' || log.rating === 'high');
      const latestLog = blockLogs[0] ?? null;
      const topPests = Array.from(
        blockLogs.reduce((map, log) => {
          const current = map.get(log.pestDisplayName) ?? 0;
          map.set(log.pestDisplayName, current + 1);
          return map;
        }, new Map<string, number>()),
      )
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([label, count]) => ({ label, count }));
      const highestRecentRating = recentLogs.reduce<ScoutingRating | null>((highest, log) => {
        return scoreRating(log.rating) > scoreRating(highest) ? (log.rating ?? null) : highest;
      }, null);
      const lastScoutedAt = latestLog?.scoutedAt ?? null;
      const needsFreshScout = !lastScoutedAt || new Date(lastScoutedAt) < staleCutoff;

      return {
        blockId: block.id,
        blockName: block.name,
        cropType: block.cropType,
        variety: block.variety,
        isOrganic: block.isOrganic,
        totalLogs: blockLogs.length,
        recentLogs: recentLogs.length,
        recentHighOrActionLogs: followUpLogs.length,
        latestScoutedAt: lastScoutedAt,
        latestPestName: latestLog?.pestDisplayName ?? null,
        latestRating: latestLog?.rating ?? null,
        highestRecentRating,
        needsFollowUp: followUpLogs.length > 0,
        needsFreshScout,
        topPests,
      };
    });

    const pestSummaryMap = logs.reduce((map, log) => {
        const key = log.pestSpeciesId ?? `custom:${log.pestDisplayName}`;
        const current = map.get(key) ?? {
          key,
          label: log.pestDisplayName,
          speciesId: log.pestSpeciesId ?? null,
          category: log.pestSpecies?.category ?? null,
          totalLogs: 0,
          recentLogs: 0,
          actionCount: 0,
          highCount: 0,
          latestScoutedAt: log.scoutedAt,
          latestRating: log.rating ?? null,
          affectedBlockIds: new Set<string>(),
        };

        current.totalLogs += 1;
        if (new Date(log.scoutedAt) >= recentCutoff) {
          current.recentLogs += 1;
        }
        if (log.rating === 'action') {
          current.actionCount += 1;
        }
        if (log.rating === 'high') {
          current.highCount += 1;
        }
        if (new Date(log.scoutedAt) > new Date(current.latestScoutedAt)) {
          current.latestScoutedAt = log.scoutedAt;
          current.latestRating = log.rating ?? null;
        }
        current.affectedBlockIds.add(log.blockId);
        map.set(key, current);
        return map;
      }, new Map<string, {
        key: string;
        label: string;
        speciesId: string | null;
        category: string | null;
        totalLogs: number;
        recentLogs: number;
        actionCount: number;
        highCount: number;
        latestScoutedAt: Date;
        latestRating: ScoutingRating | null;
        affectedBlockIds: Set<string>;
      }>());

    const pestSummaries = Array.from(pestSummaryMap.values())
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        speciesId: entry.speciesId,
        category: entry.category,
        totalLogs: entry.totalLogs,
        recentLogs: entry.recentLogs,
        actionCount: entry.actionCount,
        highCount: entry.highCount,
        latestScoutedAt: entry.latestScoutedAt.toISOString(),
        latestRating: entry.latestRating,
        affectedBlocks: entry.affectedBlockIds.size,
      }))
      .sort((left, right) => {
        const pressureDiff = (right.actionCount + right.highCount) - (left.actionCount + left.highCount);
        if (pressureDiff !== 0) {
          return pressureDiff;
        }
        return right.recentLogs - left.recentLogs;
      });

    const followUpQueue = logs
      .filter((log) => log.rating === 'action' || log.rating === 'high')
      .sort((left, right) => new Date(right.scoutedAt).getTime() - new Date(left.scoutedAt).getTime())
      .slice(0, 8)
      .map((log) => ({
        logId: log.id,
        blockId: log.blockId,
        blockName: log.block?.name ?? 'Block',
        pestDisplayName: log.pestDisplayName,
        rating: log.rating,
        scoutedAt: log.scoutedAt,
        scoutedByName: log.scoutedByProfile?.fullName ?? null,
        observationNotes: log.observationNotes,
        countPerSample: log.countPerSample,
        sampleCount: log.sampleCount,
      }));

    const summary = {
      totalLogs: logs.length,
      actionRequired: logs.filter((log) => log.rating === 'action').length,
      highPressure: logs.filter((log) => log.rating === 'high').length,
      thisWeek: logs.filter((log) => new Date(log.scoutedAt) >= addDays(now, -7)).length,
      blocksNeedingFollowUp: blockInsights.filter((block) => block.needsFollowUp).length,
      staleBlocks: blockInsights.filter((block) => block.needsFreshScout).length,
    };

    return c.json({
      blocks: blockRows,
      species: speciesRows,
      logs,
      blockInsights,
      pestSummaries,
      followUpQueue,
      summary,
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
