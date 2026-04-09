import { db } from '@ranchos/db/src';
import { blockIrrigationConfig, blocks } from '@ranchos/db/src/schema';
import { eq } from 'drizzle-orm';
import { getEtDeficit } from '@ranchos/shared/src/utils/irrigation';
import { refreshEnvironmentalRecommendations } from '../lib/environmentalRecommendations';
import { publishNotificationSnapshot, syncForecastNotifications } from '../lib/notifications';
import { publishIntelligenceUpdated, publishOrgEvent } from '../lib/orgEvents';

export async function etAlertJob() {
  const allConfigs = await db.select({
      blockId: blockIrrigationConfig.blockId,
      orgId: blocks.orgId,
      trigger: blockIrrigationConfig.deficitTriggerInches
    })
    .from(blockIrrigationConfig)
    .innerJoin(blocks, eq(blocks.id, blockIrrigationConfig.blockId));

  for (const config of allConfigs) {
    const deficit = await getEtDeficit(config.blockId);
    const trigger = parseFloat(config.trigger?.toString() || '1.5');
    
    if (deficit >= trigger) {
      await publishOrgEvent(config.orgId, {
        type: 'et_alert',
        block_id: config.blockId,
        deficit,
      });
    }
  }

  const orgIds = Array.from(new Set(allConfigs.map((config) => config.orgId)));
  if (orgIds.length === 0) {
    return;
  }

  try {
    const result = await refreshEnvironmentalRecommendations({ orgIds });
    for (const orgId of orgIds) {
      const notifications = await syncForecastNotifications(orgId, { publishEvent: false });
      await publishNotificationSnapshot(orgId, {
        reason: 'et_alert_worker_refresh',
        inserted: notifications.inserted,
        updated: notifications.updated,
        archived: notifications.archived,
      });
      await publishIntelligenceUpdated(orgId, {
        reason: 'et_alert_worker_refresh',
        includeEnvironmental: true,
        result,
        notifications,
      });
    }
    console.log(
      `[Worker] Environmental recommendations refreshed from ET alerts: ${JSON.stringify(result)}`,
    );
  } catch (error) {
    console.warn(
      '[Worker] Failed to refresh environmental recommendations from ET alerts:',
      error instanceof Error ? error.message : error,
    );
  }
}
