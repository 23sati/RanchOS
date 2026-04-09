import { db } from '@ranchos/db/src';
import { frostAlertConfig, blocks, profiles } from '@ranchos/db/src/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { redis } from '../lib/redis';

export async function frostCheckJob() {
  const hour = new Date().getHours();
  // Simplified window check for prototype; actual logic parses jsonb min/max
  if (hour >= 8 && hour < 22) return;

  const configs = await db.select().from(frostAlertConfig).where(eq(frostAlertConfig.enabled, true));

    for (const config of configs) {
    const citrusBlocks = await db.select().from(blocks)
      .where(and(
        eq(blocks.orgId, config.orgId),
        inArray(blocks.cropType, ['navel_orange','valencia_orange','lemon','mandarin','grapefruit']),
        eq(blocks.active, true)
      ));

    if (!citrusBlocks.length) continue;

    for (const block of citrusBlocks) {
       // Note: Open-Meteo demo without strict lat/lng parsing. Using mock lat/lng from Phase 1.
       const lat = 36.7378; 
       const lng = -119.7871;
       
       try {
         const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m&temperature_unit=fahrenheit&forecast_hours=12&timezone=America/Los_Angeles`;
         const resp = await fetch(url);
         const wx = await resp.json();
         const minForecastTemp = Math.min(...(wx.hourly?.temperature_2m || [50]));

         // Drizzle decimal handling returns string, fallback parser:
         const danger = parseFloat(config.dangerTempF?.toString() || '29.0');
         const warning = parseFloat(config.warningTempF?.toString() || '34.0');

         if (minForecastTemp <= danger) {
           await sendFrostAlert(config, block, minForecastTemp, 'danger');
         } else if (minForecastTemp <= warning) {
           await sendFrostAlert(config, block, minForecastTemp, 'warning');
         }
       } catch (e) {
         console.error('Frost check warning API fetch err:', e);
       }
    }
  }
}

async function sendFrostAlert(config: any, block: any, forecastTemp: number, level: 'warning' | 'danger') {
  console.log(`FROST ${level.toUpperCase()}: ${block.name} at ${forecastTemp}°F`);
  // Push SSE event to Redis for websocket ingestion by connected dashboards
  await redis.publish(`org:${config.orgId}`, JSON.stringify({ 
    type: 'frost_alert', 
    block_id: block.id, 
    level, 
    temp: forecastTemp 
  }));
}
