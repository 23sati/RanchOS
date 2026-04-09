import { db } from '@ranchos/db/src';
import { blocks, blockIrrigationConfig, aiRecommendations } from '@ranchos/db/src/schema';
import { getEtDeficit, calculateIrrigationRuntime } from '@ranchos/shared/src/utils/irrigation';
import { eq, sql } from 'drizzle-orm';

export async function generateIrrigationRecommendation(blockId: string) {
  const [block] = await db.select().from(blocks).where(eq(blocks.id, blockId));
  const [config] = await db.select().from(blockIrrigationConfig).where(eq(blockIrrigationConfig.blockId, blockId));

  const etDeficit = await getEtDeficit(blockId);
  const trigger = parseFloat(config?.deficitTriggerInches?.toString() || '1.5');

  if (etDeficit >= trigger) {
    const runtime = calculateIrrigationRuntime({ 
        etDeficitInches: etDeficit, 
        emitterFlowGph: parseFloat(config?.emitterFlowGph?.toString() || '1.0'),
        emittersPerTree: config?.emittersPerTree || 1,
        treeSpacingFt: parseFloat(config?.treeSpacingFt?.toString() || '20'),
        rowSpacingFt: parseFloat(config?.rowSpacingFt?.toString() || '22')
    });

    await db.insert(aiRecommendations).values({
      orgId: block.orgId,
      blockId,
      recommendationType: 'irrigation',
      urgency: etDeficit > trigger * 1.5 ? 'urgent' : 'suggestion',
      titleEn: `${block.name} needs irrigation`,
      titleEs: `${block.name} necesita riego`,
      bodyEn: `ET deficit is ${etDeficit.toFixed(2)}" since last irrigation. Recommend ${runtime.recommendedRuntimeHours}hr run.`,
      bodyEs: `El déficit de ET es ${etDeficit.toFixed(2)}" desde el último riego. Se recomienda correr ${runtime.recommendedRuntimeHours}hr.`,
      dataInputs: { et_deficit: etDeficit, runtime: runtime.recommendedRuntimeHours }
    });
  }
}
