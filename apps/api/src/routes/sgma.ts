import { Hono } from 'hono';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  blockIrrigationConfig,
  blocks,
  cimisStations,
  etData,
  irrigationEvents,
  ranches,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import { buildSgmaCsv } from '../utils/sgmaExport';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

type Scope = 'workspace' | 'ranch';

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
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

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundNumber(value: number, scale = 4) {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

function currentDateValue() {
  const today = new Date();
  return `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
}

function currentWaterYearStartValue() {
  const today = new Date();
  const year = today.getMonth() >= 9 ? today.getFullYear() : today.getFullYear() - 1;
  return `${year}-10-01`;
}

function maxDateString(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function sanitizeFileNamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
}

function getMonthKc(
  config: {
    kcJan?: string | null;
    kcFeb?: string | null;
    kcMar?: string | null;
    kcApr?: string | null;
    kcMay?: string | null;
    kcJun?: string | null;
    kcJul?: string | null;
    kcAug?: string | null;
    kcSep?: string | null;
    kcOct?: string | null;
    kcNov?: string | null;
    kcDec?: string | null;
  } | null,
  dateValue: string,
) {
  if (!config) {
    return 1;
  }

  const monthIndex = Number.parseInt(dateValue.slice(5, 7), 10) - 1;
  const monthKeys = [
    'kcJan',
    'kcFeb',
    'kcMar',
    'kcApr',
    'kcMay',
    'kcJun',
    'kcJul',
    'kcAug',
    'kcSep',
    'kcOct',
    'kcNov',
    'kcDec',
  ] as const;
  const monthKey = monthKeys[Math.max(0, Math.min(monthKeys.length - 1, monthIndex))];
  return toNumber(config[monthKey]) ?? 1;
}

function sumNullable(values: Array<number | null>, options: { zeroWhenEmpty?: boolean } = {}) {
  const numericValues = values.filter((value): value is number => value !== null);
  if (numericValues.length === 0) {
    return options.zeroWhenEmpty ? 0 : null;
  }

  return roundNumber(numericValues.reduce((sum, value) => sum + value, 0));
}

function volumeFromDepth(depthInches: number | null, acreage: number | null) {
  if (depthInches === null || acreage === null) {
    return null;
  }

  return roundNumber((depthInches * acreage) / 12);
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

async function buildSgmaReport(input: {
  orgId: string;
  scope: Scope;
  ranchId: string | null;
  startDate: string;
  endDate: string;
}) {
  const { orgId, scope, ranchId, startDate, endDate } = input;

  if (scope === 'ranch' && ranchId) {
    await requireOwnedRanch(orgId, ranchId);
  }

  const ranchRows = await db
    .select({
      id: ranches.id,
      name: ranches.name,
      county: ranches.county,
    })
    .from(ranches)
    .where(
      scope === 'ranch' && ranchId
        ? and(eq(ranches.orgId, orgId), eq(ranches.id, ranchId))
        : eq(ranches.orgId, orgId),
    )
    .orderBy(asc(ranches.name));

  const blockRows = await db
    .select({
      id: blocks.id,
      ranchId: blocks.ranchId,
      ranchName: ranches.name,
      ranchCounty: ranches.county,
      name: blocks.name,
      cropType: blocks.cropType,
      variety: blocks.variety,
      acreage: blocks.acreage,
      waterDistrict: blocks.waterDistrict,
      gsaName: blocks.gsaName,
      isOrganic: blocks.isOrganic,
    })
    .from(blocks)
    .innerJoin(ranches, eq(blocks.ranchId, ranches.id))
    .where(
      scope === 'ranch' && ranchId
        ? and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true))
        : and(eq(blocks.orgId, orgId), eq(blocks.active, true)),
    )
    .orderBy(asc(ranches.name), asc(blocks.name));

  const blockIds = blockRows.map((block) => block.id);
  const configRows = blockIds.length === 0
    ? []
    : await db
        .select({
          blockId: blockIrrigationConfig.blockId,
          cimisStationId: blockIrrigationConfig.cimisStationId,
          kcJan: blockIrrigationConfig.kcJan,
          kcFeb: blockIrrigationConfig.kcFeb,
          kcMar: blockIrrigationConfig.kcMar,
          kcApr: blockIrrigationConfig.kcApr,
          kcMay: blockIrrigationConfig.kcMay,
          kcJun: blockIrrigationConfig.kcJun,
          kcJul: blockIrrigationConfig.kcJul,
          kcAug: blockIrrigationConfig.kcAug,
          kcSep: blockIrrigationConfig.kcSep,
          kcOct: blockIrrigationConfig.kcOct,
          kcNov: blockIrrigationConfig.kcNov,
          kcDec: blockIrrigationConfig.kcDec,
        })
        .from(blockIrrigationConfig)
        .where(inArray(blockIrrigationConfig.blockId, blockIds));

  const stationIds = Array.from(
    new Set(
      configRows
        .map((config) => config.cimisStationId)
        .filter((stationId): stationId is number => Number.isInteger(stationId)),
    ),
  );

  const [stationRows, eventRows, etRows] = await Promise.all([
    stationIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: cimisStations.id,
            name: cimisStations.name,
            county: cimisStations.county,
          })
          .from(cimisStations)
          .where(inArray(cimisStations.id, stationIds))
          .orderBy(asc(cimisStations.name)),
    blockIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            blockId: irrigationEvents.blockId,
            scheduledDate: irrigationEvents.scheduledDate,
            status: irrigationEvents.status,
            waterAppliedAcreInches: irrigationEvents.waterAppliedAcreInches,
          })
          .from(irrigationEvents)
          .where(and(
            eq(irrigationEvents.orgId, orgId),
            inArray(irrigationEvents.blockId, blockIds),
            gte(irrigationEvents.scheduledDate, startDate),
            lte(irrigationEvents.scheduledDate, endDate),
          )),
    stationIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            stationId: etData.stationId,
            date: etData.date,
            etoInches: etData.etoInches,
          })
          .from(etData)
          .where(and(
            inArray(etData.stationId, stationIds),
            gte(etData.date, startDate),
            lte(etData.date, endDate),
          ))
          .orderBy(asc(etData.date)),
  ]);

  const configByBlockId = new Map(configRows.map((config) => [config.blockId, config]));
  const stationById = new Map(stationRows.map((station) => [station.id, station]));

  const eventsByBlockId = new Map<string, typeof eventRows>();
  for (const event of eventRows) {
    const existing = eventsByBlockId.get(event.blockId) ?? [];
    existing.push(event);
    eventsByBlockId.set(event.blockId, existing);
  }

  const etRowsByStationId = new Map<number, typeof etRows>();
  for (const row of etRows) {
    const existing = etRowsByStationId.get(row.stationId) ?? [];
    existing.push(row);
    etRowsByStationId.set(row.stationId, existing);
  }

  const blockPayload = blockRows.map((block) => {
    const config = configByBlockId.get(block.id) ?? null;
    const acreage = toNumber(block.acreage);
    const stationId = config?.cimisStationId ?? null;
    const station = stationId ? stationById.get(stationId) ?? null : null;
    const blockEvents = eventsByBlockId.get(block.id) ?? [];
    const completedEvents = blockEvents.filter((event) => event.status === 'completed');
    const missingAppliedDataEvents = completedEvents.filter(
      (event) => toNumber(event.waterAppliedAcreInches) === null,
    ).length;
    const appliedDepthValues = completedEvents
      .map((event) => toNumber(event.waterAppliedAcreInches))
      .filter((value): value is number => value !== null);
    const totalAppliedDepthInches =
      completedEvents.length === 0
        ? 0
        : appliedDepthValues.length > 0
          ? roundNumber(appliedDepthValues.reduce((sum, value) => sum + value, 0))
          : null;
    const totalAppliedAcreFeet = volumeFromDepth(totalAppliedDepthInches, acreage);

    const stationEtRows = stationId ? etRowsByStationId.get(stationId) ?? [] : [];
    const estimatedCropEtDepthInches =
      stationEtRows.length === 0
        ? null
        : roundNumber(
            stationEtRows.reduce(
              (sum, row) => sum + (toNumber(row.etoInches) ?? 0) * getMonthKc(config, row.date),
              0,
            ),
          );
    const estimatedCropEtAcreFeet = volumeFromDepth(estimatedCropEtDepthInches, acreage);
    const netAppliedMinusEstimatedEtAcreFeet =
      totalAppliedAcreFeet !== null && estimatedCropEtAcreFeet !== null
        ? roundNumber(totalAppliedAcreFeet - estimatedCropEtAcreFeet)
        : null;

    return {
      blockId: block.id,
      ranchId: block.ranchId,
      ranchName: block.ranchName,
      ranchCounty: block.ranchCounty,
      blockName: block.name,
      cropType: block.cropType,
      variety: block.variety,
      acreage,
      waterDistrict: block.waterDistrict,
      gsaName: block.gsaName,
      isOrganic: block.isOrganic,
      cimisStation: station
        ? {
            id: station.id,
            name: station.name,
            county: station.county,
          }
        : null,
      completedEvents: completedEvents.length,
      missingAppliedDataEvents,
      totalAppliedDepthInches,
      totalAppliedAcreFeet,
      estimatedCropEtDepthInches,
      estimatedCropEtAcreFeet,
      netAppliedMinusEstimatedEtAcreFeet,
      latestIrrigationDate: maxDateString(completedEvents.map((event) => event.scheduledDate)),
      latestEtDate: maxDateString(stationEtRows.map((row) => row.date)),
    };
  });

  const ranchPayload = ranchRows
    .map((ranch) => {
      const ranchBlocks = blockPayload.filter((block) => block.ranchId === ranch.id);
      const appliedBlockValues = ranchBlocks
        .filter((block) => block.completedEvents > 0)
        .map((block) => block.totalAppliedAcreFeet);
      const etBlockValues = ranchBlocks.map((block) => block.estimatedCropEtAcreFeet);
      const totalAppliedAcreFeet = sumNullable(appliedBlockValues, {
        zeroWhenEmpty: ranchBlocks.every((block) => block.completedEvents === 0),
      });
      const totalEstimatedCropEtAcreFeet = sumNullable(etBlockValues);

      return {
        ranchId: ranch.id,
        name: ranch.name,
        county: ranch.county,
        activeBlocks: ranchBlocks.length,
        activeAcres: roundNumber(ranchBlocks.reduce((sum, block) => sum + (block.acreage ?? 0), 0), 2),
        configuredBlocks: ranchBlocks.filter((block) => Boolean(block.cimisStation)).length,
        completedEvents: ranchBlocks.reduce((sum, block) => sum + block.completedEvents, 0),
        missingAppliedDataEvents: ranchBlocks.reduce((sum, block) => sum + block.missingAppliedDataEvents, 0),
        totalAppliedAcreFeet,
        totalEstimatedCropEtAcreFeet,
        netAppliedMinusEstimatedEtAcreFeet:
          totalAppliedAcreFeet !== null && totalEstimatedCropEtAcreFeet !== null
            ? roundNumber(totalAppliedAcreFeet - totalEstimatedCropEtAcreFeet)
            : null,
        latestIrrigationDate: maxDateString(ranchBlocks.map((block) => block.latestIrrigationDate)),
        latestEtDate: maxDateString(ranchBlocks.map((block) => block.latestEtDate)),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const summaryAppliedValues = blockPayload
    .filter((block) => block.completedEvents > 0)
    .map((block) => block.totalAppliedAcreFeet);
  const summaryEstimatedEtValues = blockPayload.map((block) => block.estimatedCropEtAcreFeet);
  const totalAppliedAcreFeet = sumNullable(summaryAppliedValues, {
    zeroWhenEmpty: blockPayload.every((block) => block.completedEvents === 0),
  });
  const totalEstimatedCropEtAcreFeet = sumNullable(summaryEstimatedEtValues);

  return {
    generatedAt: new Date().toISOString(),
    scope,
    scopeLabel:
      scope === 'ranch'
        ? ranchRows[0]?.name ?? 'Selected ranch'
        : `${ranchRows.length} ranch workspace`,
    dateRange: {
      startDate,
      endDate,
    },
    summary: {
      ranchesInScope: ranchRows.length,
      activeBlocks: blockPayload.length,
      activeAcres: roundNumber(blockPayload.reduce((sum, block) => sum + (block.acreage ?? 0), 0), 2),
      configuredBlocks: configRows.length,
      linkedStations: stationRows.length,
      completedEvents: blockPayload.reduce((sum, block) => sum + block.completedEvents, 0),
      missingAppliedDataEvents: blockPayload.reduce((sum, block) => sum + block.missingAppliedDataEvents, 0),
      blocksMissingStation: blockPayload.filter((block) => !block.cimisStation).length,
      blocksMissingAcreage: blockPayload.filter((block) => block.acreage === null).length,
      totalAppliedAcreFeet,
      totalEstimatedCropEtAcreFeet,
      netAppliedMinusEstimatedEtAcreFeet:
        totalAppliedAcreFeet !== null && totalEstimatedCropEtAcreFeet !== null
          ? roundNumber(totalAppliedAcreFeet - totalEstimatedCropEtAcreFeet)
          : null,
    },
    assumptions: [
      'Applied irrigation volume is based only on completed irrigation events with saved water-applied acre-inch values.',
      'Estimated crop ET is derived from persisted CIMIS ET rows multiplied by the current saved monthly Kc values for each linked block.',
      'This first SGMA slice is a reporting aid from persisted RanchOS data, not a pumping-meter ledger or agency-specific filing workflow.',
    ],
    ranches: ranchPayload,
    blocks: blockPayload,
  };
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');

  try {
    const ranchId = normalizeText(c.req.query('ranch_id'));
    const requestedScope = normalizeText(c.req.query('scope'));
    const scope: Scope = requestedScope === 'ranch' || (ranchId && requestedScope !== 'workspace')
      ? 'ranch'
      : 'workspace';
    const startDate = normalizeDate(c.req.query('start_date'), 'Start date') ?? currentWaterYearStartValue();
    const endDate = normalizeDate(c.req.query('end_date'), 'End date') ?? currentDateValue();

    if (scope === 'ranch' && !ranchId) {
      return c.json({ error: 'ranch_id is required for ranch scope.' }, 400);
    }

    if (startDate > endDate) {
      return c.json({ error: 'Start date must be before or on the end date.' }, 400);
    }

    const payload = await buildSgmaReport({
      orgId,
      scope,
      ranchId,
      startDate,
      endDate,
    });

    return c.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load SGMA report.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.get('/export/report.csv', async (c) => {
  const orgId = c.get('orgId');

  try {
    const ranchId = normalizeText(c.req.query('ranch_id'));
    const requestedScope = normalizeText(c.req.query('scope'));
    const scope: Scope = requestedScope === 'ranch' || (ranchId && requestedScope !== 'workspace')
      ? 'ranch'
      : 'workspace';
    const startDate = normalizeDate(c.req.query('start_date'), 'Start date') ?? currentWaterYearStartValue();
    const endDate = normalizeDate(c.req.query('end_date'), 'End date') ?? currentDateValue();

    if (scope === 'ranch' && !ranchId) {
      return c.json({ error: 'ranch_id is required for ranch scope.' }, 400);
    }

    if (startDate > endDate) {
      return c.json({ error: 'Start date must be before or on the end date.' }, 400);
    }

    const payload = await buildSgmaReport({
      orgId,
      scope,
      ranchId,
      startDate,
      endDate,
    });
    const csv = buildSgmaCsv({
      scopeLabel: payload.scopeLabel,
      startDate: payload.dateRange.startDate,
      endDate: payload.dateRange.endDate,
      generatedAt: payload.generatedAt,
      rows: payload.blocks.map((block) => ({
        ranchName: block.ranchName,
        ranchCounty: block.ranchCounty,
        blockName: block.blockName,
        cropType: block.cropType,
        variety: block.variety,
        acreage: block.acreage,
        waterDistrict: block.waterDistrict,
        gsaName: block.gsaName,
        isOrganic: block.isOrganic,
        cimisStationName: block.cimisStation?.name ?? null,
        completedEvents: block.completedEvents,
        missingAppliedDataEvents: block.missingAppliedDataEvents,
        totalAppliedDepthInches: block.totalAppliedDepthInches,
        totalAppliedAcreFeet: block.totalAppliedAcreFeet,
        estimatedCropEtDepthInches: block.estimatedCropEtDepthInches,
        estimatedCropEtAcreFeet: block.estimatedCropEtAcreFeet,
        netAppliedMinusEstimatedEtAcreFeet: block.netAppliedMinusEstimatedEtAcreFeet,
        latestIrrigationDate: block.latestIrrigationDate,
        latestEtDate: block.latestEtDate,
      })),
      totals: {
        activeBlocks: payload.summary.activeBlocks,
        completedEvents: payload.summary.completedEvents,
        missingAppliedDataEvents: payload.summary.missingAppliedDataEvents,
        totalAppliedAcreFeet: payload.summary.totalAppliedAcreFeet,
        totalEstimatedCropEtAcreFeet: payload.summary.totalEstimatedCropEtAcreFeet,
        netAppliedMinusEstimatedEtAcreFeet: payload.summary.netAppliedMinusEstimatedEtAcreFeet,
      },
    });

    c.header('content-type', 'text/csv; charset=utf-8');
    c.header(
      'content-disposition',
      `attachment; filename=\"sgma-report-${sanitizeFileNamePart(payload.scopeLabel)}-${payload.dateRange.endDate}.csv\"`,
    );
    return c.body(csv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to export SGMA report.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

export default app;
