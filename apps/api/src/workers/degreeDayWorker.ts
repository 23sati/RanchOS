import { db } from '@ranchos/db/src';
import { blockIrrigationConfig, blocks, cimisStations, etData, degreeDayRecords } from '@ranchos/db/src/schema';
import { eq, and, desc } from 'drizzle-orm';
import { refreshEnvironmentalRecommendations } from '../lib/environmentalRecommendations';
import { publishNotificationSnapshot, syncForecastNotifications } from '../lib/notifications';
import { publishIntelligenceUpdated } from '../lib/orgEvents';
import { DEGREE_DAY_MODELS as PEST_MODELS } from '../lib/degreeDayModels';

export async function degreeDayJob() {
  const stations = await db.select().from(cimisStations).where(eq(cimisStations.isActive, true));

  for (const station of stations) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const [etRecord] = await db.select().from(etData)
      .where(and(eq(etData.stationId, station.id), eq(etData.date, dateStr)));

    if (!etRecord?.maxTempF || !etRecord?.minTempF) continue;

    for (const [modelKey, model] of Object.entries(PEST_MODELS)) {
      const cappedMax = Math.min(parseFloat(etRecord.maxTempF.toString()), model.upperThresholdF);
      const minTemp = parseFloat(etRecord.minTempF.toString());
      const avgTemp = (cappedMax + minTemp) / 2;
      const dailyDD = Math.max(0, avgTemp - model.lowerThresholdF);

      const [lastRecord] = await db.select().from(degreeDayRecords)
        .where(and(eq(degreeDayRecords.cimisStationId, station.id), eq(degreeDayRecords.pestModel, modelKey)))
        .orderBy(desc(degreeDayRecords.date)).limit(1);

      const currentMonth = new Date().getMonth() + 1;
      const isBelowBiofix = currentMonth < model.biofixMonth;
      const cumulativeDD = isBelowBiofix ? 0 : ((parseFloat(lastRecord?.cumulativeDd?.toString() || '0')) + dailyDD);

      await db.insert(degreeDayRecords).values({
        cimisStationId: station.id,
        pestModel: modelKey,
        date: dateStr,
        dailyDd: dailyDD.toString(),
        cumulativeDd: cumulativeDD.toString(),
      }).onConflictDoUpdate({ 
        target: [degreeDayRecords.cimisStationId, degreeDayRecords.pestModel, degreeDayRecords.date], 
        set: { dailyDd: dailyDD.toString(), cumulativeDd: cumulativeDD.toString() } 
      });
    }
  }

  try {
    const result = await refreshEnvironmentalRecommendations();
    const orgRows = await db
      .select({ orgId: blocks.orgId })
      .from(blockIrrigationConfig)
      .innerJoin(blocks, eq(blocks.id, blockIrrigationConfig.blockId));
    const orgIds = Array.from(new Set(orgRows.map((row) => row.orgId)));

    for (const orgId of orgIds) {
      const notifications = await syncForecastNotifications(orgId, { publishEvent: false });
      await publishNotificationSnapshot(orgId, {
        reason: 'degree_day_worker_refresh',
        inserted: notifications.inserted,
        updated: notifications.updated,
        archived: notifications.archived,
      });
      await publishIntelligenceUpdated(orgId, {
        reason: 'degree_day_worker_refresh',
        includeEnvironmental: true,
        result,
        notifications,
      });
    }

    console.log(
      `[Worker] Environmental recommendations refreshed from degree days: ${JSON.stringify(result)}`,
    );
  } catch (error) {
    console.warn(
      '[Worker] Failed to refresh environmental recommendations from degree day job:',
      error instanceof Error ? error.message : error,
    );
  }
}
