import { Hono } from 'hono';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  blockIrrigationConfig,
  blocks,
  cimisStations,
  degreeDayRecords,
  ranches,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import { DEGREE_DAY_MODELS, type DegreeDayModelKey } from '../lib/degreeDayModels';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildModelKey(stationId: number, pestModel: DegreeDayModelKey) {
  return `${stationId}:${pestModel}`;
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

  try {
    if (!ranchId) {
      return c.json({ error: 'ranch_id is required.' }, 400);
    }

    const ranch = await requireOwnedRanch(orgId, ranchId);

    const blockRows = await db
      .select({
        id: blocks.id,
        name: blocks.name,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        isOrganic: blocks.isOrganic,
      })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true)))
      .orderBy(asc(blocks.name));

    const blockIds = blockRows.map((block) => block.id);

    if (blockIds.length === 0) {
      return c.json({
        generatedAt: new Date().toISOString(),
        ranch: { id: ranch.id, name: ranch.name },
        summary: {
          activeBlocks: 0,
          configuredBlocks: 0,
          trackedModels: 0,
          nearingThreshold: 0,
          reachedThreshold: 0,
          latestObservationDate: null,
        },
        blocks: [],
        stationModels: [],
      });
    }

    const configRows = await db
      .select({
        blockId: blockIrrigationConfig.blockId,
        cimisStationId: blockIrrigationConfig.cimisStationId,
      })
      .from(blockIrrigationConfig)
      .where(inArray(blockIrrigationConfig.blockId, blockIds));

    const configByBlockId = new Map(configRows.map((config) => [config.blockId, config]));
    const stationIds = Array.from(
      new Set(
        configRows
          .map((config) => config.cimisStationId)
          .filter((stationId): stationId is number => Number.isInteger(stationId)),
      ),
    );

    const stationRows = stationIds.length === 0
      ? []
      : await db
          .select({
            id: cimisStations.id,
            name: cimisStations.name,
            county: cimisStations.county,
            isActive: cimisStations.isActive,
          })
          .from(cimisStations)
          .where(inArray(cimisStations.id, stationIds))
          .orderBy(asc(cimisStations.name));

    const stationById = new Map(stationRows.map((station) => [station.id, station]));

    const expectedStationModels = new Map<string, {
      stationId: number;
      pestModel: DegreeDayModelKey;
      blockIds: string[];
      blockNames: string[];
    }>();

    for (const block of blockRows) {
      const config = configByBlockId.get(block.id);
      if (!config?.cimisStationId) {
        continue;
      }

      for (const [pestModel, model] of Object.entries(DEGREE_DAY_MODELS) as Array<[DegreeDayModelKey, (typeof DEGREE_DAY_MODELS)[DegreeDayModelKey]]>) {
        if (!(model.applicableCrops as readonly string[]).includes(block.cropType)) {
          continue;
        }

        const key = buildModelKey(config.cimisStationId, pestModel);
        const existing = expectedStationModels.get(key);
        if (existing) {
          existing.blockIds.push(block.id);
          existing.blockNames.push(block.name);
          continue;
        }

        expectedStationModels.set(key, {
          stationId: config.cimisStationId,
          pestModel,
          blockIds: [block.id],
          blockNames: [block.name],
        });
      }
    }

    const currentYearStart = `${new Date().getFullYear()}-01-01`;
    const degreeDayRows = stationIds.length === 0
      ? []
      : await db
          .select({
            cimisStationId: degreeDayRecords.cimisStationId,
            pestModel: degreeDayRecords.pestModel,
            date: degreeDayRecords.date,
            dailyDd: degreeDayRecords.dailyDd,
            cumulativeDd: degreeDayRecords.cumulativeDd,
          })
          .from(degreeDayRecords)
          .where(and(
            inArray(degreeDayRecords.cimisStationId, stationIds),
            gte(degreeDayRecords.date, currentYearStart),
          ))
          .orderBy(
            asc(degreeDayRecords.cimisStationId),
            asc(degreeDayRecords.pestModel),
            asc(degreeDayRecords.date),
          );

    const rowsByKey = new Map<string, Array<{
      date: string;
      dailyDd: number | null;
      cumulativeDd: number | null;
    }>>();

    for (const row of degreeDayRows) {
      if (!(row.pestModel in DEGREE_DAY_MODELS)) {
        continue;
      }

      const key = buildModelKey(row.cimisStationId, row.pestModel as DegreeDayModelKey);
      if (!expectedStationModels.has(key)) {
        continue;
      }

      const rows = rowsByKey.get(key) ?? [];
      rows.push({
        date: row.date,
        dailyDd: toNumber(row.dailyDd),
        cumulativeDd: toNumber(row.cumulativeDd),
      });
      rowsByKey.set(key, rows);
    }

    const stationModels = Array.from(expectedStationModels.values())
      .map((expected) => {
        const model = DEGREE_DAY_MODELS[expected.pestModel];
        const station = stationById.get(expected.stationId) ?? null;
        const rows = rowsByKey.get(buildModelKey(expected.stationId, expected.pestModel)) ?? [];
        const latestRow = rows.at(-1) ?? null;
        const sevenDayAnchor = rows.length > 0 ? rows[Math.max(0, rows.length - 7)] : null;
        const latestCumulativeDd = latestRow?.cumulativeDd ?? null;
        const progressRatio =
          latestCumulativeDd === null || model.actionThresholdDd <= 0
            ? null
            : latestCumulativeDd / model.actionThresholdDd;

        return {
          key: buildModelKey(expected.stationId, expected.pestModel),
          pestModel: expected.pestModel,
          pestLabel: model.label,
          actionThresholdDd: model.actionThresholdDd,
          lowerThresholdF: model.lowerThresholdF,
          upperThresholdF: model.upperThresholdF,
          biofixMonth: model.biofixMonth,
          applicableCrops: [...model.applicableCrops],
          station: station
            ? {
                id: station.id,
                name: station.name,
                county: station.county,
                isActive: station.isActive,
              }
            : null,
          trackedBlockIds: expected.blockIds,
          trackedBlockNames: expected.blockNames,
          latestDate: latestRow?.date ?? null,
          latestDailyDd: latestRow?.dailyDd ?? null,
          latestCumulativeDd,
          sevenDayGain:
            latestRow?.cumulativeDd !== null && latestRow?.cumulativeDd !== undefined
            && sevenDayAnchor?.cumulativeDd !== null && sevenDayAnchor?.cumulativeDd !== undefined
              ? latestRow.cumulativeDd - sevenDayAnchor.cumulativeDd
              : null,
          progressRatio,
          trend: rows.slice(-21).map((row) => ({
            date: row.date,
            dailyDd: row.dailyDd,
            cumulativeDd: row.cumulativeDd,
          })),
        };
      })
      .sort((left, right) => {
        const leftDate = left.latestDate ?? '';
        const rightDate = right.latestDate ?? '';
        if (leftDate !== rightDate) {
          return rightDate.localeCompare(leftDate);
        }

        const leftProgress = left.progressRatio ?? -1;
        const rightProgress = right.progressRatio ?? -1;
        if (leftProgress !== rightProgress) {
          return rightProgress - leftProgress;
        }

        return `${left.station?.name ?? ''}${left.pestLabel}`.localeCompare(`${right.station?.name ?? ''}${right.pestLabel}`);
      });

    const stationModelByKey = new Map(stationModels.map((model) => [model.key, model]));

    const blocksPayload = blockRows.map((block) => {
      const config = configByBlockId.get(block.id) ?? null;
      const station = config?.cimisStationId ? stationById.get(config.cimisStationId) ?? null : null;
      const applicableStatuses = config?.cimisStationId
        ? (Object.entries(DEGREE_DAY_MODELS) as Array<[DegreeDayModelKey, (typeof DEGREE_DAY_MODELS)[DegreeDayModelKey]]>)
            .filter(([, model]) => (model.applicableCrops as readonly string[]).includes(block.cropType))
            .map(([pestModel, model]) => {
              const snapshot = stationModelByKey.get(buildModelKey(config.cimisStationId!, pestModel)) ?? null;
              return {
                pestModel,
                pestLabel: model.label,
                latestDate: snapshot?.latestDate ?? null,
                latestCumulativeDd: snapshot?.latestCumulativeDd ?? null,
                actionThresholdDd: model.actionThresholdDd,
                progressRatio: snapshot?.progressRatio ?? null,
                sevenDayGain: snapshot?.sevenDayGain ?? null,
              };
            })
        : [];

      return {
        id: block.id,
        name: block.name,
        cropType: block.cropType,
        variety: block.variety,
        acreage: block.acreage,
        isOrganic: block.isOrganic,
        cimisStation: station
          ? {
              id: station.id,
              name: station.name,
              county: station.county,
              isActive: station.isActive,
            }
          : null,
        hasStationConfig: Boolean(config?.cimisStationId),
        modelStatuses: applicableStatuses,
      };
    });

    const configuredBlocks = blocksPayload.filter((block) => block.hasStationConfig).length;
    const nearingThreshold = stationModels.filter((model) => (model.progressRatio ?? 0) >= 0.8 && (model.progressRatio ?? 0) < 1).length;
    const reachedThreshold = stationModels.filter((model) => (model.progressRatio ?? 0) >= 1).length;
    const latestObservationDate = stationModels
      .map((model) => model.latestDate)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

    return c.json({
      generatedAt: new Date().toISOString(),
      ranch: { id: ranch.id, name: ranch.name },
      summary: {
        activeBlocks: blockRows.length,
        configuredBlocks,
        trackedModels: stationModels.length,
        nearingThreshold,
        reachedThreshold,
        latestObservationDate,
      },
      blocks: blocksPayload,
      stationModels,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load degree-day dashboard.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

export default app;
