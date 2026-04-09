import { db } from '@ranchos/db/src';
import { blocks, irrigationEvents } from '@ranchos/db/src/schema';
import { and, eq, sql } from 'drizzle-orm';

interface SeasonalWaterUse {
  orgId: string;
  season_year: number;
  blocks: Array<{
    blockName: string;
    apn: string | null;
    waterDistrict: string | null;
    gsaName: string | null;
    totalAcreInches: number;
    irrigationEventsCount: number;
  }>;
}

export async function generateSGMAReport(orgId: string, year: number): Promise<SeasonalWaterUse> {
  const blockData = await db.select({
    blockName: blocks.name,
    apn: blocks.apn,
    waterDistrict: blocks.waterDistrict,
    gsaName: blocks.gsaName,
    totalAcreInches: sql<number>`SUM(${irrigationEvents.waterAppliedAcreInches})`,
    irrigationEventsCount: sql<number>`COUNT(${irrigationEvents.id})`
  })
  .from(blocks)
  .leftJoin(irrigationEvents, and(
      eq(irrigationEvents.blockId, blocks.id), 
      sql`EXTRACT(YEAR FROM ${irrigationEvents.scheduledDate}) = ${year}`, 
      eq(irrigationEvents.status, 'completed')
  ))
  .where(and(eq(blocks.orgId, orgId), eq(blocks.active, true)))
  .groupBy(blocks.id);

  return { orgId, season_year: year, blocks: blockData };
}
