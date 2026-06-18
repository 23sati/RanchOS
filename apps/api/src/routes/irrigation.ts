import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  blockIrrigationConfig,
  blocks,
  cimisStations,
  irrigationEvents,
  etData,
  ranches,
  weatherForecasts,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import { enqueueRecommendationRefresh } from '../lib/refreshRecommendations';
import { calculateIrrigationRuntime } from '@ranchos/shared/src/utils/irrigation';

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

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

function currentDateValue() {
  const today = new Date();
  return `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
}

function getMonthKc(config: {
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
}, today: Date) {
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

  const currentMonthKey = monthKeys[today.getMonth()];
  return toNumber(config[currentMonthKey]) ?? 1;
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
  const ranchId = normalizeText(c.req.query('ranch_id'));

  try {
    if (ranchId) {
      await requireOwnedRanch(orgId, ranchId);
    }

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
      .where(
        ranchId
          ? and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true))
          : and(eq(blocks.orgId, orgId), eq(blocks.active, true)),
      )
      .orderBy(asc(blocks.name));

    const blockIds = blockRows.map((block) => block.id);

    const today = new Date();
    const todayValue = currentDateValue();
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
    const stationIds = Array.from(
      new Set(
        configRows
          .map((config) => config.cimisStationId)
          .filter((stationId): stationId is number => Number.isInteger(stationId)),
      ),
    );

    const [etRows, forecastRows] = await Promise.all([
      stationIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              stationId: etData.stationId,
              date: etData.date,
              etoInches: etData.etoInches,
              maxTempF: etData.maxTempF,
              minTempF: etData.minTempF,
            })
            .from(etData)
            .where(and(inArray(etData.stationId, stationIds), gte(etData.date, addDays(todayValue, -21))))
            .orderBy(desc(etData.date)),
      stationIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              stationId: weatherForecasts.stationId,
              forecastDate: weatherForecasts.forecastDate,
              etoInches: weatherForecasts.etoInches,
              maxTempF: weatherForecasts.maxTempF,
              minTempF: weatherForecasts.minTempF,
              precipitationProbabilityPct: weatherForecasts.precipitationProbabilityPct,
            })
            .from(weatherForecasts)
            .where(and(inArray(weatherForecasts.stationId, stationIds), gte(weatherForecasts.forecastDate, todayValue)))
            .orderBy(asc(weatherForecasts.forecastDate)),
    ]);

    const etRowsByStation = new Map<number, typeof etRows>();
    for (const row of etRows) {
      const stationRowsForId = etRowsByStation.get(row.stationId) ?? [];
      stationRowsForId.push(row);
      etRowsByStation.set(row.stationId, stationRowsForId);
    }

    const forecastRowsByStation = new Map<number, typeof forecastRows>();
    for (const row of forecastRows) {
      const stationRowsForId = forecastRowsByStation.get(row.stationId) ?? [];
      stationRowsForId.push(row);
      forecastRowsByStation.set(row.stationId, stationRowsForId);
    }

    const completedEventsByBlockId = new Map<string, (typeof eventRows)[number]>();
    for (const event of eventRows) {
      if (event.status !== 'completed') {
        continue;
      }

      const current = completedEventsByBlockId.get(event.blockId);
      if (!current || event.scheduledDate > current.scheduledDate) {
        completedEventsByBlockId.set(event.blockId, event);
      }
    }

    const upcomingEventsByBlockId = new Map<string, (typeof eventRows)[number]>();
    for (const event of eventRows) {
      if (event.scheduledDate < todayValue || (event.status !== 'scheduled' && event.status !== 'running')) {
        continue;
      }

      const current = upcomingEventsByBlockId.get(event.blockId);
      if (!current || event.scheduledDate < current.scheduledDate) {
        upcomingEventsByBlockId.set(event.blockId, event);
      }
    }

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

    const blockInsights = blocksWithConfig.map((block) => {
      const config = configsByBlockId.get(block.id) ?? null;
      const stationId = config?.cimisStationId ?? null;
      const latestEt = stationId
        ? (etRowsByStation.get(stationId) ?? [])
            .slice()
            .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null
        : null;
      const forecastWindow = stationId
        ? (forecastRowsByStation.get(stationId) ?? [])
            .filter((forecastRow) => forecastRow.forecastDate >= todayValue)
            .slice(0, 3)
        : [];
      const baselineDate = completedEventsByBlockId.get(block.id)?.scheduledDate ?? addDays(todayValue, -7);
      const kc = config ? getMonthKc(config, today) : 1;
      const currentEtDeficitInches = stationId
        ? (etRowsByStation.get(stationId) ?? [])
            .filter((etRow) => etRow.date >= baselineDate)
            .reduce((sum, etRow) => sum + (toNumber(etRow.etoInches) ?? 0) * kc, 0)
        : null;
      const trigger = toNumber(config?.deficitTriggerInches) ?? 1.5;
      const forecastEtInches = forecastWindow.reduce((sum, forecastRow) => sum + (toNumber(forecastRow.etoInches) ?? 0) * kc, 0);
      const projectedEtDeficitInches =
        currentEtDeficitInches === null ? null : currentEtDeficitInches + forecastEtInches;
      const hottestForecast = forecastWindow
        .slice()
        .sort((left, right) => (toNumber(right.maxTempF) ?? 0) - (toNumber(left.maxTempF) ?? 0))[0] ?? null;
      let triggerCrossingDate: string | null = null;

      if (currentEtDeficitInches !== null && forecastWindow.length > 0) {
        let projected = currentEtDeficitInches;
        for (const forecastRow of forecastWindow) {
          projected += (toNumber(forecastRow.etoInches) ?? 0) * kc;
          if (projected >= trigger) {
            triggerCrossingDate = forecastRow.forecastDate;
            break;
          }
        }
      }

      const canEstimateRuntime =
        currentEtDeficitInches !== null &&
        (toNumber(config?.emitterFlowGph) ?? 0) > 0 &&
        (toNumber(config?.emittersPerTree) ?? 0) > 0 &&
        (toNumber(config?.treeSpacingFt) ?? 0) > 0 &&
        (toNumber(config?.rowSpacingFt) ?? 0) > 0;
      const runtimeEstimate = canEstimateRuntime
        ? calculateIrrigationRuntime({
            etDeficitInches: currentEtDeficitInches!,
            emitterFlowGph: toNumber(config?.emitterFlowGph)!,
            emittersPerTree: toNumber(config?.emittersPerTree)!,
            treeSpacingFt: toNumber(config?.treeSpacingFt)!,
            rowSpacingFt: toNumber(config?.rowSpacingFt)!,
          })
        : null;

      let pressureStatus:
        | 'unconfigured'
        | 'missing_station'
        | 'missing_et'
        | 'stale_et'
        | 'under_trigger'
        | 'forecast_crossing'
        | 'near_trigger'
        | 'over_trigger' = 'unconfigured';

      if (!config) {
        pressureStatus = 'unconfigured';
      } else if (!stationId) {
        pressureStatus = 'missing_station';
      } else if (!latestEt) {
        pressureStatus = 'missing_et';
      } else if (latestEt.date < addDays(todayValue, -3)) {
        pressureStatus = 'stale_et';
      } else if ((currentEtDeficitInches ?? 0) >= trigger) {
        pressureStatus = 'over_trigger';
      } else if (triggerCrossingDate) {
        pressureStatus = 'forecast_crossing';
      } else if ((currentEtDeficitInches ?? 0) >= trigger * 0.8) {
        pressureStatus = 'near_trigger';
      } else {
        pressureStatus = 'under_trigger';
      }

      return {
        blockId: block.id,
        latestEtDate: latestEt?.date ?? null,
        latestEtInches: latestEt ? toNumber(latestEt.etoInches) : null,
        baselineDate,
        currentEtDeficitInches: currentEtDeficitInches === null ? null : Number(currentEtDeficitInches.toFixed(4)),
        deficitTriggerInches: trigger,
        kc,
        forecastEtInches: Number(forecastEtInches.toFixed(4)),
        projectedEtDeficitInches:
          projectedEtDeficitInches === null ? null : Number(projectedEtDeficitInches.toFixed(4)),
        triggerCrossingDate,
        hottestForecastDate: hottestForecast?.forecastDate ?? null,
        hottestForecastTempF: hottestForecast ? toNumber(hottestForecast.maxTempF) : null,
        rainChanceMaxPct: forecastWindow.reduce((max, row) => Math.max(max, toNumber(row.precipitationProbabilityPct) ?? 0), 0),
        upcomingEvent: upcomingEventsByBlockId.get(block.id)
          ? {
              id: upcomingEventsByBlockId.get(block.id)!.id,
              scheduledDate: upcomingEventsByBlockId.get(block.id)!.scheduledDate,
              status: upcomingEventsByBlockId.get(block.id)!.status,
              plannedRuntimeHours: upcomingEventsByBlockId.get(block.id)!.plannedRuntimeHours,
            }
          : null,
        runtimeRecommendation: runtimeEstimate
          ? {
              recommendedRuntimeHours: runtimeEstimate.recommendedRuntimeHours,
              appRateInchesPerHour: Number(runtimeEstimate.appRateInchesPerHour.toFixed(4)),
              grossWaterNeededInches: Number(runtimeEstimate.grossWaterNeededInches.toFixed(4)),
              estimatedGallonsPerAcre: Math.round(runtimeEstimate.estimatedGallonsPerAcre),
            }
          : null,
        forecastWindow: forecastWindow.map((row) => ({
          forecastDate: row.forecastDate,
          etoInches: toNumber(row.etoInches),
          maxTempF: toNumber(row.maxTempF),
          minTempF: toNumber(row.minTempF),
          precipitationProbabilityPct: toNumber(row.precipitationProbabilityPct),
        })),
        pressureStatus,
      };
    });

    const stationSnapshots = stationRows
      .map((station) => {
        const latestEt = (etRowsByStation.get(station.id) ?? [])
          .slice()
          .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
        const nextForecastRows = (forecastRowsByStation.get(station.id) ?? [])
          .filter((forecastRow) => forecastRow.forecastDate >= todayValue)
          .slice(0, 3);

        return {
          stationId: station.id,
          stationName: station.name,
          county: station.county,
          latestEtDate: latestEt?.date ?? null,
          latestEtInches: latestEt ? toNumber(latestEt.etoInches) : null,
          threeDayForecastEtInches: Number(
            nextForecastRows.reduce((sum, row) => sum + (toNumber(row.etoInches) ?? 0), 0).toFixed(4),
          ),
          hottestForecastTempF: nextForecastRows.reduce(
            (max, row) => Math.max(max, toNumber(row.maxTempF) ?? Number.NEGATIVE_INFINITY),
            Number.NEGATIVE_INFINITY,
          ),
          linkedBlockCount: blocksWithConfig.filter((block) => block.config?.cimisStationId === station.id).length,
        };
      })
      .filter((station) => station.linkedBlockCount > 0)
      .map((station) => ({
        ...station,
        hottestForecastTempF:
          station.hottestForecastTempF === Number.NEGATIVE_INFINITY ? null : station.hottestForecastTempF,
      }));

    const summary = {
      configuredBlocks: blocksWithConfig.filter((block) => Boolean(block.config)).length,
      blocksOverTrigger: blockInsights.filter((insight) => insight.pressureStatus === 'over_trigger').length,
      forecastCrossings: blockInsights.filter((insight) => insight.pressureStatus === 'forecast_crossing').length,
      staleStations: blockInsights.filter((insight) => insight.pressureStatus === 'stale_et').length,
      missingDataBlocks: blockInsights.filter((insight) =>
        insight.pressureStatus === 'unconfigured'
        || insight.pressureStatus === 'missing_station'
        || insight.pressureStatus === 'missing_et').length,
    };

    return c.json({
      blocks: blocksWithConfig,
      stations: stationRows,
      events: eventRows,
      blockInsights,
      stationSnapshots,
      summary,
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
