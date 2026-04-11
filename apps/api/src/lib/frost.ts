import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  blockIrrigationConfig,
  blocks,
  cimisStations,
  frostAlertConfig,
  notifications,
  organizations,
  profiles,
  weatherForecasts,
} from '@ranchos/db/src/schema';
import { publishNotificationSnapshot, syncNotificationDeliveries } from './notifications';

const CITRUS_CROP_TYPES = [
  'navel_orange',
  'valencia_orange',
  'lemon',
  'mandarin',
  'grapefruit',
] as const;

const DEFAULT_WARNING_TEMP_F = 34;
const DEFAULT_DANGER_TEMP_F = 29;
const DEFAULT_MONITOR_HOURS = {
  start: 22,
  end: 8,
} as const;

type FrostRiskLevel = 'clear' | 'warning' | 'danger' | 'needs_station' | 'no_forecast';

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNotifyProfiles(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)));
}

function parseMonitorHours(value: unknown) {
  if (!value || typeof value !== 'object') {
    return DEFAULT_MONITOR_HOURS;
  }

  const record = value as Record<string, unknown>;
  const start = Number(record.start);
  const end = Number(record.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 23 || end < 0 || end > 23) {
    return DEFAULT_MONITOR_HOURS;
  }

  return { start, end };
}

function getHourInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  return Number.isInteger(hour) ? hour : 0;
}

function isWithinMonitorWindow(date: Date, timeZone: string, monitorHours: { start: number; end: number }) {
  if (monitorHours.start === monitorHours.end) {
    return true;
  }

  const hour = getHourInTimeZone(date, timeZone);
  return monitorHours.start < monitorHours.end
    ? hour >= monitorHours.start && hour < monitorHours.end
    : hour >= monitorHours.start || hour < monitorHours.end;
}

function asMetadata(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function buildFrostKey(input: {
  blockId: string;
  forecastDate: string;
  alertLevel: 'warning' | 'danger';
}) {
  return `${input.blockId}:${input.forecastDate}:${input.alertLevel}`;
}

function frostKeyFromMetadata(value: unknown) {
  const metadata = asMetadata(value);
  const blockId = typeof metadata.blockId === 'string' ? metadata.blockId : null;
  const forecastDate = typeof metadata.forecastDate === 'string' ? metadata.forecastDate : null;
  const alertLevel =
    metadata.alertLevel === 'warning' || metadata.alertLevel === 'danger'
      ? metadata.alertLevel
      : null;

  if (!blockId || !forecastDate || !alertLevel) {
    return null;
  }

  return buildFrostKey({ blockId, forecastDate, alertLevel });
}

function formatForecastDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function buildAlertCopy(input: {
  blockName: string;
  forecastDate: string;
  forecastMinTempF: number;
  alertLevel: 'warning' | 'danger';
}) {
  const tempLabel = `${input.forecastMinTempF.toFixed(1)}F`;
  const forecastLabel = formatForecastDate(input.forecastDate);

  if (input.alertLevel === 'danger') {
    return {
      titleEn: `Critical frost risk in ${input.blockName}`,
      titleEs: `Riesgo critico de helada en ${input.blockName}`,
      bodyEn: `${input.blockName} is forecast to bottom near ${tempLabel} on ${forecastLabel}. Start frost protection response now.`,
      bodyEs: `${input.blockName} se pronostica cerca de ${tempLabel} el ${forecastLabel}. Inicia la respuesta de proteccion contra heladas ahora.`,
      urgency: 'urgent' as const,
    };
  }

  return {
    titleEn: `Frost warning in ${input.blockName}`,
    titleEs: `Aviso de helada en ${input.blockName}`,
    bodyEn: `${input.blockName} is forecast near ${tempLabel} on ${forecastLabel}. Confirm crews and frost equipment are ready.`,
    bodyEs: `${input.blockName} se pronostica cerca de ${tempLabel} el ${forecastLabel}. Confirma que las cuadrillas y el equipo esten listos.`,
    urgency: 'warning' as const,
  };
}

export async function loadFrostWorkspace(orgId: string) {
  const [organizationRows, configRows, profileRows, blockRows, notificationRows] = await Promise.all([
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        timezone: organizations.timezone,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
    db.select().from(frostAlertConfig).where(eq(frostAlertConfig.orgId, orgId)).limit(1),
    db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        role: profiles.role,
        preferredLocale: profiles.preferredLocale,
        phone: profiles.phone,
        expoPushToken: profiles.expoPushToken,
      })
      .from(profiles)
      .where(eq(profiles.orgId, orgId))
      .orderBy(asc(profiles.fullName)),
    db
      .select({
        blockId: blocks.id,
        blockName: blocks.name,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        cimisStationId: blockIrrigationConfig.cimisStationId,
        stationName: cimisStations.name,
        stationCounty: cimisStations.county,
      })
      .from(blocks)
      .leftJoin(blockIrrigationConfig, eq(blockIrrigationConfig.blockId, blocks.id))
      .leftJoin(cimisStations, eq(cimisStations.id, blockIrrigationConfig.cimisStationId))
      .where(
        and(
          eq(blocks.orgId, orgId),
          eq(blocks.active, true),
          inArray(blocks.cropType, [...CITRUS_CROP_TYPES]),
        ),
      )
      .orderBy(asc(blocks.name)),
    db
      .select({
        id: notifications.id,
        notificationType: notifications.notificationType,
        titleEn: notifications.titleEn,
        urgency: notifications.urgency,
        metadata: notifications.metadata,
        readAt: notifications.readAt,
        archivedAt: notifications.archivedAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(eq(notifications.orgId, orgId), eq(notifications.notificationType, 'frost_alert')))
      .orderBy(desc(notifications.createdAt)),
  ]);

  const organization = organizationRows[0] ?? null;
  const config = configRows[0] ?? null;
  const monitorHours = parseMonitorHours(config?.monitorHours);
  const notifyProfiles = normalizeNotifyProfiles(config?.notifyProfiles);
  const warningTempF = toNumber(config?.warningTempF) ?? DEFAULT_WARNING_TEMP_F;
  const dangerTempF = toNumber(config?.dangerTempF) ?? DEFAULT_DANGER_TEMP_F;
  const timeZone = organization?.timezone ?? 'America/Los_Angeles';
  const today = new Date().toISOString().slice(0, 10);
  const stationIds = Array.from(
    new Set(
      blockRows
        .map((row) => row.cimisStationId)
        .filter((value): value is number => typeof value === 'number'),
    ),
  );

  const forecastRows =
    stationIds.length === 0
      ? []
      : await db
          .select({
            stationId: weatherForecasts.stationId,
            forecastDate: weatherForecasts.forecastDate,
            minTempF: weatherForecasts.minTempF,
            maxTempF: weatherForecasts.maxTempF,
            windSpeedMph: weatherForecasts.windSpeedMph,
          })
          .from(weatherForecasts)
          .where(and(inArray(weatherForecasts.stationId, stationIds), gte(weatherForecasts.forecastDate, today)))
          .orderBy(asc(weatherForecasts.forecastDate));

  const forecastRowsByStation = forecastRows.reduce(
    (map, row) => {
      const existing = map.get(row.stationId) ?? [];
      existing.push(row);
      map.set(row.stationId, existing);
      return map;
    },
    new Map<number, typeof forecastRows>(),
  );

  const activeForecastAlerts = notificationRows.filter((row) => {
    const metadata = asMetadata(row.metadata);
    return !row.archivedAt && metadata.frostKind === 'forecast';
  });
  const activeAlertBlockIds = new Set(
    activeForecastAlerts
      .map((row) => {
        const metadata = asMetadata(row.metadata);
        return typeof metadata.blockId === 'string' ? metadata.blockId : null;
      })
      .filter((value): value is string => Boolean(value)),
  );

  const blockPayloads = blockRows.map((row) => {
    const stationForecasts = row.cimisStationId ? (forecastRowsByStation.get(row.cimisStationId) ?? []).slice(0, 3) : [];
    const coldestForecast = stationForecasts
      .slice()
      .sort((left, right) => {
        const leftTemp = toNumber(left.minTempF) ?? 999;
        const rightTemp = toNumber(right.minTempF) ?? 999;
        if (leftTemp !== rightTemp) {
          return leftTemp - rightTemp;
        }

        return left.forecastDate.localeCompare(right.forecastDate);
      })[0] ?? null;

    const coldestMinTempF = toNumber(coldestForecast?.minTempF);
    let riskLevel: FrostRiskLevel = 'clear';

    if (!row.cimisStationId) {
      riskLevel = 'needs_station';
    } else if (!coldestForecast || coldestMinTempF === null) {
      riskLevel = 'no_forecast';
    } else if (coldestMinTempF <= dangerTempF) {
      riskLevel = 'danger';
    } else if (coldestMinTempF <= warningTempF) {
      riskLevel = 'warning';
    }

    return {
      id: row.blockId,
      name: row.blockName,
      cropType: row.cropType,
      variety: row.variety,
      acreage: row.acreage,
      cimisStationId: row.cimisStationId,
      stationName: row.stationName ?? null,
      stationCounty: row.stationCounty ?? null,
      riskLevel,
      forecastDate: coldestForecast?.forecastDate ?? null,
      forecastMinTempF: coldestMinTempF,
      forecastMaxTempF: toNumber(coldestForecast?.maxTempF),
      forecastWindSpeedMph: toNumber(coldestForecast?.windSpeedMph),
      hasActiveAlert: activeAlertBlockIds.has(row.blockId),
      forecastWindow: stationForecasts.map((forecastRow) => ({
        forecastDate: forecastRow.forecastDate,
        minTempF: toNumber(forecastRow.minTempF),
        maxTempF: toNumber(forecastRow.maxTempF),
        windSpeedMph: toNumber(forecastRow.windSpeedMph),
      })),
    };
  });

  const profilePayloads = profileRows.map((profile) => ({
    id: profile.id,
    fullName: profile.fullName,
    role: profile.role,
    preferredLocale: profile.preferredLocale,
    phone: profile.phone,
    hasPushToken: Boolean(profile.expoPushToken),
    selectedForAlerts: notifyProfiles.includes(profile.id),
  }));

  const selectedProfiles = profilePayloads.filter((profile) => profile.selectedForAlerts);
  const recentAlerts = notificationRows.slice(0, 12).map((row) => {
    const metadata = asMetadata(row.metadata);
    const targetProfileIds = normalizeNotifyProfiles(metadata.targetProfileIds);
    return {
      id: row.id,
      titleEn: row.titleEn,
      urgency: row.urgency,
      frostKind: metadata.frostKind === 'forecast' || metadata.frostKind === 'test' ? metadata.frostKind : 'forecast',
      alertLevel: metadata.alertLevel === 'warning' || metadata.alertLevel === 'danger' ? metadata.alertLevel : null,
      blockId: typeof metadata.blockId === 'string' ? metadata.blockId : null,
      blockName: typeof metadata.blockName === 'string' ? metadata.blockName : null,
      forecastDate: typeof metadata.forecastDate === 'string' ? metadata.forecastDate : null,
      forecastMinTempF: toNumber(metadata.forecastMinTempF as string | number | null | undefined),
      targetProfileCount: targetProfileIds.length,
      readAt: row.readAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt?.toISOString() ?? null,
    };
  });

  return {
    organization: {
      id: orgId,
      name: organization?.name ?? 'Organization',
      timezone: timeZone,
    },
    settings: {
      id: config?.id ?? null,
      orgId,
      enabled: config?.enabled ?? false,
      warningTempF,
      dangerTempF,
      monitorStartHour: monitorHours.start,
      monitorEndHour: monitorHours.end,
      notifyProfiles,
      createdAt: config?.createdAt?.toISOString() ?? null,
      updatedAt: config?.updatedAt?.toISOString() ?? null,
    },
    summary: {
      totalCitrusBlocks: blockPayloads.length,
      linkedBlocks: blockPayloads.filter((block) => typeof block.cimisStationId === 'number').length,
      forecastCoverageBlocks: blockPayloads.filter((block) => block.forecastWindow.length > 0).length,
      warningBlocks: blockPayloads.filter((block) => block.riskLevel === 'warning').length,
      dangerBlocks: blockPayloads.filter((block) => block.riskLevel === 'danger').length,
      activeAlertBlocks: blockPayloads.filter((block) => block.hasActiveAlert).length,
      selectedProfiles: selectedProfiles.length,
      pushReadyProfiles: selectedProfiles.filter((profile) => profile.hasPushToken).length,
      withinMonitorWindow: isWithinMonitorWindow(new Date(), timeZone, monitorHours),
      monitoringTimeZone: timeZone,
    },
    profiles: profilePayloads,
    blocks: blockPayloads,
    recentAlerts,
  };
}

export async function syncFrostNotifications(
  orgId: string,
  options: { publishEvent?: boolean } = {},
) {
  const { publishEvent = true } = options;
  const workspace = await loadFrostWorkspace(orgId);
  const desiredAlerts =
    workspace.settings.enabled && workspace.summary.withinMonitorWindow
      ? workspace.blocks
          .filter((block) => block.riskLevel === 'warning' || block.riskLevel === 'danger')
          .filter((block) => block.forecastDate && block.forecastMinTempF !== null)
          .map((block) => ({
            blockId: block.id,
            blockName: block.name,
            stationId: block.cimisStationId,
            stationName: block.stationName,
            forecastDate: block.forecastDate!,
            forecastMinTempF: block.forecastMinTempF!,
            forecastMaxTempF: block.forecastMaxTempF,
            windSpeedMph: block.forecastWindSpeedMph,
            alertLevel: block.riskLevel as 'warning' | 'danger',
          }))
      : [];

  const existingNotifications = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.orgId, orgId), eq(notifications.notificationType, 'frost_alert')))
    .orderBy(desc(notifications.createdAt));

  const existingForecastNotifications = existingNotifications.filter((notification) => {
    const metadata = asMetadata(notification.metadata);
    return metadata.frostKind === 'forecast' && !notification.archivedAt;
  });

  const existingByKey = new Map(
    existingForecastNotifications
      .map((notification) => [frostKeyFromMetadata(notification.metadata), notification] as const)
      .filter((entry): entry is [string, (typeof existingForecastNotifications)[number]] => Boolean(entry[0])),
  );

  const desiredKeys = new Set<string>();
  const inserts: typeof notifications.$inferInsert[] = [];
  const updates: Array<{ id: string; values: Partial<typeof notifications.$inferInsert> }> = [];

  for (const alert of desiredAlerts) {
    const key = buildFrostKey(alert);
    desiredKeys.add(key);
    const copy = buildAlertCopy(alert);
    const metadata = {
      frostKind: 'forecast',
      alertLevel: alert.alertLevel,
      blockId: alert.blockId,
      blockName: alert.blockName,
      stationId: alert.stationId,
      stationName: alert.stationName,
      forecastDate: alert.forecastDate,
      forecastMinTempF: alert.forecastMinTempF,
      forecastMaxTempF: alert.forecastMaxTempF,
      windSpeedMph: alert.windSpeedMph,
      warningTempF: workspace.settings.warningTempF,
      dangerTempF: workspace.settings.dangerTempF,
      targetProfileIds: workspace.settings.notifyProfiles,
    };
    const existing = existingByKey.get(key);

    if (!existing) {
      inserts.push({
        orgId,
        notificationType: 'frost_alert',
        titleEn: copy.titleEn,
        titleEs: copy.titleEs,
        bodyEn: copy.bodyEn,
        bodyEs: copy.bodyEs,
        urgency: copy.urgency,
        sourceCategory: 'seasonal',
        metadata,
      });
      continue;
    }

    const nextValues: Partial<typeof notifications.$inferInsert> = {
      titleEn: copy.titleEn,
      titleEs: copy.titleEs,
      bodyEn: copy.bodyEn,
      bodyEs: copy.bodyEs,
      urgency: copy.urgency,
      sourceCategory: 'seasonal',
      metadata,
      updatedAt: new Date(),
    };
    const needsUpdate =
      existing.titleEn !== copy.titleEn ||
      existing.titleEs !== copy.titleEs ||
      existing.bodyEn !== copy.bodyEn ||
      existing.bodyEs !== copy.bodyEs ||
      existing.urgency !== copy.urgency ||
      JSON.stringify(existing.metadata ?? null) !== JSON.stringify(metadata);

    if (needsUpdate) {
      updates.push({ id: existing.id, values: nextValues });
    }
  }

  const staleNotificationIds = existingForecastNotifications
    .filter((notification) => {
      const key = frostKeyFromMetadata(notification.metadata);
      return key ? !desiredKeys.has(key) : true;
    })
    .map((notification) => notification.id);

  if (inserts.length > 0) {
    await db.insert(notifications).values(inserts);
  }

  for (const update of updates) {
    await db.update(notifications).set(update.values).where(eq(notifications.id, update.id));
  }

  if (staleNotificationIds.length > 0) {
    await db
      .update(notifications)
      .set({
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(notifications.id, staleNotificationIds));
  }

  const deliverySync = await syncNotificationDeliveries(orgId);
  const changed = inserts.length + updates.length + staleNotificationIds.length;
  const snapshot =
    publishEvent || changed > 0
      ? await publishNotificationSnapshot(orgId, {
          reason: 'frost_alert_sync',
          inserted: inserts.length,
          updated: updates.length,
          archived: staleNotificationIds.length,
        })
      : null;

  return {
    inserted: inserts.length,
    updated: updates.length,
    archived: staleNotificationIds.length,
    changed,
    deliverySync,
    snapshot,
  };
}

export async function createFrostTestAlert(orgId: string, profileId: string) {
  const workspace = await loadFrostWorkspace(orgId);

  await db.insert(notifications).values({
    orgId,
    notificationType: 'frost_alert',
    titleEn: 'Test frost alert',
    titleEs: 'Alerta de helada de prueba',
    bodyEn: `This test alert verifies the persisted frost delivery path for ${workspace.organization.name}.`,
    bodyEs: `Esta alerta de prueba verifica la ruta persistida de entrega de heladas para ${workspace.organization.name}.`,
    urgency: 'urgent',
    sourceCategory: 'seasonal',
    metadata: {
      frostKind: 'test',
      targetProfileIds: workspace.settings.notifyProfiles,
      createdByProfileId: profileId,
      warningTempF: workspace.settings.warningTempF,
      dangerTempF: workspace.settings.dangerTempF,
    },
  });

  const deliverySync = await syncNotificationDeliveries(orgId);
  const snapshot = await publishNotificationSnapshot(orgId, {
    reason: 'frost_test_alert',
    deliverySync: {
      inserted: deliverySync.inserted,
      updated: deliverySync.updated,
      canceled: deliverySync.canceled,
    },
  });

  return {
    deliverySync,
    snapshot,
  };
}
