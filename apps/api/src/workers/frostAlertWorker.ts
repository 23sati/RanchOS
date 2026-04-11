import { eq } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import { frostAlertConfig } from '@ranchos/db/src/schema';
import { syncFrostNotifications } from '../lib/frost';

export async function frostCheckJob() {
  const configs = await db
    .select({
      orgId: frostAlertConfig.orgId,
    })
    .from(frostAlertConfig)
    .where(eq(frostAlertConfig.enabled, true));

  for (const config of configs) {
    try {
      const result = await syncFrostNotifications(config.orgId, { publishEvent: true });
      if (result.changed > 0) {
        console.log(
          `[Frost] synced org ${config.orgId}: +${result.inserted} updated ${result.updated} archived ${result.archived}`,
        );
      }
    } catch (error) {
      console.error(
        `[Frost] sync failed for org ${config.orgId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
