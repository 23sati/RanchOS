import { db } from '@ranchos/db/src';
import { blockIrrigationConfig, blocks, cimisStations, etData, weatherForecasts } from '@ranchos/db/src/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { refreshEnvironmentalRecommendations } from '../lib/environmentalRecommendations';
import { publishNotificationSnapshot, syncForecastNotifications } from '../lib/notifications';
import { publishIntelligenceUpdated } from '../lib/orgEvents';

const CIMIS_API_URL = 'https://et.water.ca.gov/api/data';
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function syncStationForecast(station: typeof cimisStations.$inferSelect) {
  const lat = toNumber(station.lat);
  const lng = toNumber(station.lng);

  if (lat === null || lng === null) {
    return false;
  }

  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('timezone', 'America/Los_Angeles');
  url.searchParams.set('forecast_days', '4');
  url.searchParams.set(
    'daily',
    [
      'temperature_2m_max',
      'temperature_2m_min',
      'et0_fao_evapotranspiration',
      'precipitation_probability_max',
      'wind_speed_10m_max',
    ].join(','),
  );
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');
  url.searchParams.set('precipitation_unit', 'inch');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Forecast fetch failed with status ${response.status}`);
  }

  const data = await response.json();
  const daily = data?.daily;
  const dates: string[] = daily?.time ?? [];

  for (let index = 0; index < dates.length; index += 1) {
    const forecastDate = dates[index];

    await db
      .insert(weatherForecasts)
      .values({
        stationId: station.id,
        forecastDate,
        source: 'open_meteo',
        etoInches: daily?.et0_fao_evapotranspiration?.[index]?.toString?.() ?? null,
        maxTempF: daily?.temperature_2m_max?.[index]?.toString?.() ?? null,
        minTempF: daily?.temperature_2m_min?.[index]?.toString?.() ?? null,
        precipitationProbabilityPct:
          daily?.precipitation_probability_max?.[index]?.toString?.() ?? null,
        windSpeedMph: daily?.wind_speed_10m_max?.[index]?.toString?.() ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          weatherForecasts.stationId,
          weatherForecasts.forecastDate,
          weatherForecasts.source,
        ],
        set: {
          etoInches: sql`excluded.eto_inches`,
          maxTempF: sql`excluded.max_temp_f`,
          minTempF: sql`excluded.min_temp_f`,
          precipitationProbabilityPct: sql`excluded.precipitation_probability_pct`,
          windSpeedMph: sql`excluded.wind_speed_mph`,
          updatedAt: new Date(),
        },
      });
  }

  return dates.length > 0;
}

export async function cimisSyncJob() {
  const CIMIS_KEY = process.env.CIMIS_APP_KEY || 'demo_key';
  const stations = await db.select().from(cimisStations).where(eq(cimisStations.isActive, true));
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  const refreshedStationIds = new Set<number>();

  for (const station of stations) {
    const url = `${CIMIS_API_URL}?appKey=${CIMIS_KEY}&targets=${station.id}&startDate=${dateStr}&endDate=${dateStr}&dataItems=DayEto,DayAirTmpMax,DayAirTmpMin,DayAirTmpAvg,DayWindSpdAvg,DaySolRadAvg`;
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      const record = data?.Data?.Providers?.[0]?.Records?.[0];
      if (!record) continue;

      const etValues: typeof etData.$inferInsert = {
        stationId: station.id,
        date: dateStr,
        etoMm: (parseFloat(record.DayEto?.Value || '0') * 25.4).toString(),
        etoInches: parseFloat(record.DayEto?.Value || '0').toString(),
        maxTempF: parseFloat(record.DayAirTmpMax?.Value || '0').toString(),
        minTempF: parseFloat(record.DayAirTmpMin?.Value || '0').toString(),
        avgTempF: parseFloat(record.DayAirTmpAvg?.Value || '0').toString(),
      };

      await db.insert(etData).values(etValues).onConflictDoUpdate({
        target: [etData.stationId, etData.date], 
        set: {
          etoMm: sql`excluded.eto_mm`,
          etoInches: sql`excluded.eto_inches`,
          maxTempF: sql`excluded.max_temp_f`,
          minTempF: sql`excluded.min_temp_f`,
          avgTempF: sql`excluded.avg_temp_f`,
        }
      });

      await db.update(cimisStations).set({ lastSyncedAt: new Date() }).where(eq(cimisStations.id, station.id));
      refreshedStationIds.add(station.id);
    } catch (e) {
      console.error(`Failed CIMIS sync for station ${station.id}`, e);
    }

    try {
      const forecastSynced = await syncStationForecast(station);
      if (forecastSynced) {
        refreshedStationIds.add(station.id);
      }
    } catch (e) {
      console.error(`Failed forecast sync for station ${station.id}`, e);
    }
  }

  if (refreshedStationIds.size === 0) {
    return;
  }

  const orgRows = await db
    .select({ orgId: blocks.orgId })
    .from(blockIrrigationConfig)
    .innerJoin(blocks, eq(blocks.id, blockIrrigationConfig.blockId))
    .where(inArray(blockIrrigationConfig.cimisStationId, Array.from(refreshedStationIds)));
  const orgIds = Array.from(new Set(orgRows.map((row) => row.orgId)));

  if (orgIds.length === 0) {
    return;
  }

  try {
    const result = await refreshEnvironmentalRecommendations({ orgIds });
    for (const orgId of orgIds) {
      const notifications = await syncForecastNotifications(orgId, { publishEvent: false });
      await publishNotificationSnapshot(orgId, {
        reason: 'cimis_forecast_sync_refresh',
        inserted: notifications.inserted,
        updated: notifications.updated,
        archived: notifications.archived,
      });
      await publishIntelligenceUpdated(orgId, {
        reason: 'cimis_forecast_sync_refresh',
        includeEnvironmental: true,
        result,
        notifications,
      });
    }
    console.log(
      `[Worker] Environmental recommendations refreshed from CIMIS/forecast sync: ${JSON.stringify(result)}`,
    );
  } catch (error) {
    console.warn(
      '[Worker] Failed to refresh environmental recommendations from CIMIS/forecast sync:',
      error instanceof Error ? error.message : error,
    );
  }
}
