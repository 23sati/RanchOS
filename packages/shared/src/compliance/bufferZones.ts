import { db } from '@ranchos/db/src';
import { applicationRecords, products, blocks } from '@ranchos/db/src/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * CA DPR and Organic Buffer Zone Logic
 * Flags any pesticide application within 300ft of a certified organic block.
 * Requires blocks.geometry to be valid PostGIS polygons.
 */
export async function detectDriftSensitiveApplications(orgId: string) {
  // Query for applications within 300ft of organic blocks using ST_DWithin
  const driftRisks = await db.execute(sql`
    SELECT 
      ar.id as application_id,
      b_target.name as applied_block,
      b_organic.name as nearby_organic_block,
      ST_Distance(b_target.geometry, b_organic.geometry) as distance_feet
    FROM application_records ar
    JOIN blocks b_target ON ar.block_id = b_target.id
    JOIN blocks b_organic ON b_organic.org_id = ${orgId} AND b_organic.is_organic = true
    WHERE ar.org_id = ${orgId}
      AND b_target.is_organic = false
      AND ST_DWithin(b_target.geometry::geography, b_organic.geometry::geography, 91.44) -- 300 feet in meters
      AND b_target.id != b_organic.id
  `);

  return driftRisks;
}
