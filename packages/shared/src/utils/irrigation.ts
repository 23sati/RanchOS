import { eq, and, desc, gte } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import { irrigationEvents, blockIrrigationConfig, etData } from '@ranchos/db/src/schema';

interface IrrigationCalcInput {
  etDeficitInches: number;
  emitterFlowGph: number;
  emittersPerTree: number;
  treeSpacingFt: number;
  rowSpacingFt: number;
  applicationEfficiency?: number;
}

export function calculateIrrigationRuntime(input: IrrigationCalcInput) {
  const eff = input.applicationEfficiency ?? 0.90;
  const sqFtPerTree = input.treeSpacingFt * input.rowSpacingFt;
  const totalFlowGphPerAcre = (43560 / sqFtPerTree) * input.emitterFlowGph * input.emittersPerTree;
  const appRateInchesPerHour = (totalFlowGphPerAcre / 27154) * eff;
  const grossWaterNeededInches = input.etDeficitInches / eff;
  
  if (appRateInchesPerHour === 0) return { recommendedRuntimeHours: 0, grossWaterNeededInches: 0, appRateInchesPerHour: 0, estimatedGallonsPerAcre: 0 };

  const runTimeHours = grossWaterNeededInches / appRateInchesPerHour;
  
  return {
    recommendedRuntimeHours: Math.round(runTimeHours * 4) / 4, // nearest 15min
    grossWaterNeededInches,
    appRateInchesPerHour,
    estimatedGallonsPerAcre: grossWaterNeededInches * 27154
  };
}

export async function getEtDeficit(blockId: string): Promise<number> {
  const [lastIrr] = await db.select().from(irrigationEvents)
    .where(and(eq(irrigationEvents.blockId, blockId), eq(irrigationEvents.status, 'completed')))
    .orderBy(desc(irrigationEvents.scheduledDate))
    .limit(1);

  const [config] = await db.select().from(blockIrrigationConfig)
    .where(eq(blockIrrigationConfig.blockId, blockId));

  const month = new Date().toLocaleString('en', { month: 'short' }).toLowerCase();
  const kcKey = `kc${month.charAt(0).toUpperCase() + month.slice(1)}` as keyof typeof config;
  const kcRaw = config?.[kcKey];
  const kc = kcRaw ? parseFloat(kcRaw.toString()) : 1.0;

  const etRecords = await db.select().from(etData)
    .where(and(
      eq(etData.stationId, config?.cimisStationId || 0),
      gte(etData.date, lastIrr?.scheduledDate?.toString() || '1970-01-01')
    ));

  return etRecords.reduce((sum, r) => sum + ((parseFloat(r?.etoInches?.toString() || '0')) * kc), 0);
}
