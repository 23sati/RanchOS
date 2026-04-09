# RanchOS — Phase 2: Operations Depth — Irrigation & Scouting
### Weeks 17–30 | Goal: 15–20 paying growers. CIMIS ET₀ flowing automatically. Scouting logs in active use. Frost alerts live for citrus orgs. MRR ≥ $8K.

> **Read `RanchOS_Overview.md` first.** All Phase 0–1 features are live and stable.

---

## Phase 2 Task for IDE

```
RANCHOS PHASE 2: Add irrigation scheduling (CIMIS ET₀), frost protection alert system,
field scouting/IPM module, SGMA water use reporting.

Existing tables: organizations, profiles, ranches, blocks (with is_organic, apn),
block_seasons, task_types, tasks, task_blocks, task_assignments, subscriptions.

Stack: VPS Postgres, Drizzle ORM, Hono API, BullMQ + Redis, Better Auth, Cloudflare R2, SSE.

## 1. Database Schema Additions

### Migration 012 — CIMIS Stations Cache
  CREATE TABLE cimis_stations (
    id            INTEGER PRIMARY KEY,   -- CIMIS station number
    name          TEXT NOT NULL,
    county        TEXT,
    lat           DECIMAL(10,8),
    lng           DECIMAL(11,8),
    is_active     BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMPTZ
  );

### Migration 013 — Daily ET₀ Data (cached from CIMIS API)
  CREATE TABLE et_data (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id    INTEGER NOT NULL REFERENCES cimis_stations(id),
    date          DATE NOT NULL,
    eto_mm        DECIMAL(6,3),
    eto_inches    DECIMAL(6,4),
    max_temp_f    DECIMAL(5,2),
    min_temp_f    DECIMAL(5,2),
    avg_temp_f    DECIMAL(5,2),
    wind_speed_mph DECIMAL(6,2),
    solar_radiation DECIMAL(8,3),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(station_id, date)
  );
  CREATE INDEX et_data_station_date_idx ON et_data(station_id, date DESC);

### Migration 014 — Block Irrigation Config
  CREATE TABLE block_irrigation_config (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    block_id          UUID NOT NULL UNIQUE REFERENCES blocks(id) ON DELETE CASCADE,
    cimis_station_id  INTEGER REFERENCES cimis_stations(id),
    soil_type         TEXT CHECK (soil_type IN ('sandy','sandy_loam','loam','clay_loam','clay')),
    emitter_flow_gph  DECIMAL(6,3),
    emitters_per_tree INTEGER,
    tree_spacing_ft   DECIMAL(6,2),
    row_spacing_ft    DECIMAL(6,2),
    -- ET deficit trigger (inches since last irrigation to trigger recommendation)
    deficit_trigger_inches DECIMAL(4,2) DEFAULT 1.5,
    -- Kc (crop coefficient) by month
    kc_jan DECIMAL(4,3), kc_feb DECIMAL(4,3), kc_mar DECIMAL(4,3),
    kc_apr DECIMAL(4,3), kc_may DECIMAL(4,3), kc_jun DECIMAL(4,3),
    kc_jul DECIMAL(4,3), kc_aug DECIMAL(4,3), kc_sep DECIMAL(4,3),
    kc_oct DECIMAL(4,3), kc_nov DECIMAL(4,3), kc_dec DECIMAL(4,3),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  );

### Migration 015 — Irrigation Events
  CREATE TABLE irrigation_events (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    block_id              UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    scheduled_date        DATE NOT NULL,
    scheduled_start_time  TIME,
    planned_runtime_hours DECIMAL(5,2) NOT NULL,
    planned_flow_rate_gpm DECIMAL(8,3),
    actual_runtime_hours  DECIMAL(5,2),
    actual_flow_rate_gpm  DECIMAL(8,3),
    water_applied_acre_inches DECIMAL(8,4),
    status                TEXT NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled','running','completed','skipped','problem')),
    et_deficit_inches     DECIMAL(6,4),
    notes                 TEXT,
    created_by            UUID REFERENCES profiles(id),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_by            UUID REFERENCES profiles(id)
  );
  CREATE INDEX irrigation_events_block_date_idx ON irrigation_events(block_id, scheduled_date DESC);

### Migration 016 — Frost Alert Config (per-org, for citrus operations)
  CREATE TABLE frost_alert_config (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    enabled         BOOLEAN DEFAULT false,
    warning_temp_f  DECIMAL(4,1) DEFAULT 34.0,   -- send warning alert at this temp
    danger_temp_f   DECIMAL(4,1) DEFAULT 29.0,   -- send danger alert at this temp
    monitor_hours   JSONB DEFAULT '{"start": 22, "end": 8}',  -- 10PM–8AM monitoring window
    notify_profiles UUID[] DEFAULT '{}',          -- profile IDs to notify
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  );

### Migration 017 — Pest Species Reference
  CREATE TABLE pest_species (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_en                     TEXT NOT NULL,
    name_es                     TEXT NOT NULL,
    name_scientific             TEXT,
    category                    TEXT NOT NULL CHECK (category IN ('insect','mite','disease','weed','vertebrate','beneficial')),
    applicable_crops            TEXT[] NOT NULL,
    action_threshold_description TEXT,
    is_allowed_in_organic       BOOLEAN DEFAULT false,  -- organic-relevance flag
    uc_ipm_url                  TEXT,
    is_system                   BOOLEAN DEFAULT true
  );

  INSERT INTO pest_species (name_en, name_es, name_scientific, category, applicable_crops, is_allowed_in_organic) VALUES
    ('Navel Orangeworm', 'Gusano de la Naranja', 'Amyelois transitella', 'insect', ARRAY['almond','navel_orange','valencia_orange'], false),
    ('Peach Twig Borer', 'Barrenador de Ramillas', 'Anarsia lineatella', 'insect', ARRAY['almond'], false),
    ('Web-spinning Mite', 'Ácaro Tejedor', 'Tetranychus urticae', 'mite', ARRAY['almond','citrus'], false),
    ('Brown Rot', 'Podredumbre Parda', 'Monilinia spp.', 'disease', ARRAY['almond','navel_orange'], false),
    ('Citrus Thrips', 'Trips de los Cítricos', 'Scirtothrips citri', 'insect', ARRAY['citrus'], false),
    ('Asian Citrus Psyllid', 'Psílido Asiático', 'Diaphorina citri', 'insect', ARRAY['citrus'], false),
    ('Leaffooted Bug', 'Chinche de Patas Foliadas', 'Leptoglossus spp.', 'insect', ARRAY['almond','citrus'], false),
    ('Aphids', 'Pulgones', 'Aphididae', 'insect', ARRAY['almond','citrus'], true),  -- beneficial controls often sufficient
    ('Scale - San Jose', 'Escama de San José', 'Diaspidiotus perniciosus', 'insect', ARRAY['almond'], false),
    ('Alternaria', 'Alternaria', 'Alternaria alternata', 'disease', ARRAY['citrus'], false);

### Migration 018 — Scouting Logs
  CREATE TABLE scouting_logs (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    block_id         UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    scouted_by       UUID NOT NULL REFERENCES profiles(id),
    scouted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pest_species_id  UUID REFERENCES pest_species(id),
    pest_name_custom TEXT,
    rating           TEXT CHECK (rating IN ('none','low','moderate','high','action')),
    count_per_sample DECIMAL(8,2),
    sample_count     INTEGER,
    observation_notes TEXT,
    photo_urls       TEXT[] DEFAULT '{}',
    gps_lat          DECIMAL(10,8),
    gps_lng          DECIMAL(11,8),
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX scouting_logs_block_at_idx ON scouting_logs(block_id, scouted_at DESC);

### Migration 019 — Alert Rules
  CREATE TABLE alert_rules (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    block_id              UUID REFERENCES blocks(id),   -- NULL = all blocks
    rule_type             TEXT NOT NULL CHECK (rule_type IN ('et_deficit','flow_deviation','pest_threshold','temperature','frost')),
    metric                TEXT NOT NULL,
    operator              TEXT NOT NULL CHECK (operator IN ('>','<','>=','<=','=')),
    threshold_value       DECIMAL(12,4) NOT NULL,
    notification_channels TEXT[] DEFAULT ARRAY['push','email'],
    is_active             BOOLEAN DEFAULT true,
    created_at            TIMESTAMPTZ DEFAULT NOW()
  );

## 2. CIMIS Integration (BullMQ Worker — replaces Supabase Edge Function)

### apps/api/src/workers/cimisSyncWorker.ts
  -- Runs nightly at 6 AM PT via BullMQ repeatable job

  const CIMIS_API_URL = 'https://et.water.ca.gov/api/data';

  export async function cimisSyncJob() {
    const stations = await db.select().from(cimisStations).where(eq(cimisStations.isActive, true));
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    for (const station of stations) {
      const url = `${CIMIS_API_URL}?appKey=${CIMIS_KEY}&targets=${station.id}&startDate=${dateStr}&endDate=${dateStr}&dataItems=DayEto,DayAirTmpMax,DayAirTmpMin,DayAirTmpAvg,DayWindSpdAvg,DaySolRadAvg`;
      const resp = await fetch(url);
      const data = await resp.json();
      const record = data?.Data?.Providers?.[0]?.Records?.[0];
      if (!record) continue;

      await db.insert(etData).values({
        stationId: station.id,
        date: dateStr,
        etoMm: parseFloat(record.DayEto?.Value) * 25.4,
        etoInches: parseFloat(record.DayEto?.Value),
        maxTempF: parseFloat(record.DayAirTmpMax?.Value),
        minTempF: parseFloat(record.DayAirTmpMin?.Value),
        avgTempF: parseFloat(record.DayAirTmpAvg?.Value),
      }).onConflictDoUpdate({ target: [etData.stationId, etData.date], set: { etoInches: sql`excluded.eto_inches` } });

      await db.update(cimisStations).set({ lastSyncedAt: new Date() }).where(eq(cimisStations.id, station.id));
    }
  }

  // Schedule in apps/api/src/index.ts on startup:
  const cimisSyncQueue = new Queue('cimis-sync', { connection: redis });
  await cimisSyncQueue.add('nightly', {}, { repeat: { cron: '0 6 * * *' }, jobId: 'cimis-nightly' });

## 3. Irrigation Scheduling Engine (packages/shared/src/utils/irrigation.ts)

  interface IrrigationCalcInput {
    etDeficitInches: number;
    emitterFlowGph: number;
    emittersPerTree: number;
    treeSpacingFt: number;
    rowSpacingFt: number;
    applicationEfficiency?: number;  // drip=0.90, micro_spray=0.80
  }

  export function calculateIrrigationRuntime(input: IrrigationCalcInput) {
    const eff = input.applicationEfficiency ?? 0.90;
    const sqFtPerTree = input.treeSpacingFt * input.rowSpacingFt;
    const totalFlowGphPerAcre = (43560 / sqFtPerTree) * input.emitterFlowGph * input.emittersPerTree;
    const appRateInchesPerHour = (totalFlowGphPerAcre / 27154) * eff;
    const grossWaterNeededInches = input.etDeficitInches / eff;
    const runTimeHours = grossWaterNeededInches / appRateInchesPerHour;
    return {
      recommendedRuntimeHours: Math.round(runTimeHours * 4) / 4,  // nearest 15min
      grossWaterNeededInches,
      appRateInchesPerHour,
      estimatedGallonsPerAcre: grossWaterNeededInches * 27154
    };
  }

  export async function getEtDeficit(blockId: string): Promise<number> {
    const [lastIrr] = await db.select().from(irrigationEvents)
      .where(and(eq(irrigationEvents.blockId, blockId), eq(irrigationEvents.status, 'completed')))
      .orderBy(desc(irrigationEvents.scheduledDate)).limit(1);

    const [config] = await db.select().from(blockIrrigationConfig)
      .where(eq(blockIrrigationConfig.blockId, blockId));

    const month = new Date().toLocaleString('en', { month: 'short' }).toLowerCase();
    const kc = (config as any)?.[`kc${month.charAt(0).toUpperCase() + month.slice(1)}`] ?? 1.0;

    const etRecords = await db.select().from(etData)
      .where(and(
        eq(etData.stationId, config?.cimisStationId),
        gte(etData.date, lastIrr?.scheduledDate?.toString() || '1970-01-01')
      ));

    return etRecords.reduce((sum, r) => sum + ((r.etoInches || 0) * kc), 0);
  }

## 4. Frost Protection System (BullMQ — every 30 minutes for citrus orgs)

  IMPORTANT: Frost protection is NOT just a task type. It is an automated alert system.
  For citrus in Kern/Tulare counties, a 28°F forecast at 2 AM requires sub-hour notification.
  pg_cron (hourly) is too slow. Use BullMQ with a 30-minute repeating job.

### apps/api/src/workers/frostAlertWorker.ts

  import { Queue, Worker } from 'bullmq';

  export async function frostCheckJob() {
    // Only run during monitoring window (10 PM – 8 AM)
    const hour = new Date().getHours();
    if (hour >= 8 && hour < 22) return;

    // Get all orgs with frost alerts enabled (citrus blocks)
    const configs = await db.select().from(frostAlertConfig)
      .where(eq(frostAlertConfig.enabled, true));

    for (const config of configs) {
      // Get citrus blocks for this org
      const citrusBlocks = await db.select().from(blocks)
        .where(and(eq(blocks.orgId, config.orgId),
          inArray(blocks.cropType, ['navel_orange','valencia_orange','lemon','mandarin','grapefruit','citrus']),
          eq(blocks.active, true)));

      if (!citrusBlocks.length) continue;

      // Use Open-Meteo hourly forecast for each block's GPS center
      for (const block of citrusBlocks) {
        // Get block centroid
        const [centroid] = await db.execute(
          sql`SELECT ST_Y(ST_Centroid(geometry::geometry)) as lat, ST_X(ST_Centroid(geometry::geometry)) as lng FROM blocks WHERE id = ${block.id}`
        );
        if (!centroid?.lat) continue;

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${centroid.lat}&longitude=${centroid.lng}&hourly=temperature_2m&temperature_unit=fahrenheit&forecast_hours=12&timezone=America/Los_Angeles`;
        const resp = await fetch(url);
        const wx = await resp.json();
        const minForecastTemp = Math.min(...wx.hourly.temperature_2m);

        if (minForecastTemp <= config.dangerTempF) {
          await sendFrostAlert(config, block, minForecastTemp, 'danger');
        } else if (minForecastTemp <= config.warningTempF) {
          await sendFrostAlert(config, block, minForecastTemp, 'warning');
        }
      }
    }
  }

  async function sendFrostAlert(config, block, forecastTemp, level: 'warning' | 'danger') {
    const isSpanish = true; // Check profile locale
    const msgEN = `${level === 'danger' ? '🚨 FROST DANGER' : '⚠️ Frost Warning'}: ${block.name} — ${forecastTemp.toFixed(1)}°F forecast. Activate frost protection now.`;
    const msgES = `${level === 'danger' ? '🚨 PELIGRO DE HELADA' : '⚠️ Alerta de Helada'}: ${block.name} — Se pronostican ${forecastTemp.toFixed(1)}°F. Active la protección contra heladas ahora.`;

    // Send Expo push notifications to configured profile IDs
    for (const profileId of config.notifyProfiles) {
      const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
      if (!profile?.expoPushToken) continue;
      await sendExpoPushNotification(profile.expoPushToken, profile.preferredLocale === 'es' ? msgES : msgEN);
    }

    // Publish SSE event for web dashboard
    await redis.publish(`org:${config.orgId}`, JSON.stringify({ type: 'frost_alert', block_id: block.id, level, temp: forecastTemp }));
  }

  // Schedule: every 30 minutes
  const frostQueue = new Queue('frost-check', { connection: redis });
  await frostQueue.add('frost', {}, { repeat: { every: 30 * 60 * 1000 }, jobId: 'frost-30min' });

## 5. ET Deficit Alert Worker (BullMQ — hourly is fine for irrigation alerts)

### apps/api/src/workers/etAlertWorker.ts
  -- Runs hourly. Check ET deficit for all blocks. Push notification if over threshold.

  export async function etAlertJob() {
    const allConfigs = await db.select({ blockId: blockIrrigationConfig.blockId, orgId: blocks.orgId, trigger: blockIrrigationConfig.deficitTriggerInches })
      .from(blockIrrigationConfig).innerJoin(blocks, eq(blocks.id, blockIrrigationConfig.blockId));

    for (const config of allConfigs) {
      const deficit = await getEtDeficit(config.blockId);
      if (deficit >= config.trigger) {
        // Get org owners/managers to notify
        const managers = await db.select().from(profiles)
          .where(and(eq(profiles.orgId, config.orgId), inArray(profiles.role, ['owner', 'manager'])));

        for (const manager of managers) {
          if (!manager.expoPushToken) continue;
          const msg = manager.preferredLocale === 'es'
            ? `Bloque necesita riego — déficit de ET: ${deficit.toFixed(2)}"`
            : `Block needs irrigation — ET deficit: ${deficit.toFixed(2)}"`;
          await sendExpoPushNotification(manager.expoPushToken, msg);
        }

        // Publish SSE event
        await redis.publish(`org:${config.orgId}`, JSON.stringify({ type: 'et_alert', block_id: config.blockId, deficit }));
      }
    }
  }

  const etQueue = new Queue('check-alerts', { connection: redis });
  await etQueue.add('et-hourly', {}, { repeat: { cron: '0 * * * *' }, jobId: 'et-hourly' });

## 6. Scouting Module (Mobile — apps/mobile/src/app/scout.tsx)

  Step 1: Select block from map or dropdown
  Step 2: Walk mode — GPS tracks path across block (expo-location watchPositionAsync)
  Step 3: Add observation:
    - Tap "Add" / "Agregar" at current GPS location
    - Select pest from searchable list (filtered by block's crop_type)
    - If block.is_organic: filter list to show is_allowed_in_organic pests and flag others
    - Rating: None / Low / Moderate / High / Action — with color coding
    - Count per sample (numeric)
    - Camera for photo evidence (upload to R2)
    - Optional notes
  Step 4: Summary — all observations for this session
  Step 5: Save to Hono API (online) or WatermelonDB (offline)
  If rating = 'action' → trigger immediate push notification to managers

  Spanish: "Nivel de Acción" for action threshold rating

## 7. Organic-Aware Irrigation Scheduling Note

  When creating irrigation recommendations for organic blocks:
  - Add a note: "Organic block — verify any amendments are OMRI-listed before application"
  - In irrigation dashboard, show organic badge next to block name
  - Do NOT restrict irrigation itself — water is water — only flag input applications

## 8. SGMA Water Use Report (packages/shared/src/utils/sgmaReport.ts)

  interface SeasonalWaterUse {
    orgId: string;
    season_year: number;
    blocks: Array<{
      blockName: string;
      apn: string;
      waterDistrict: string;
      gsaName: string;
      totalAcreInches: number;
      irrigationEvents: number;
    }>;
  }

  export async function generateSGMAReport(orgId: string, year: number): Promise<SeasonalWaterUse> {
    const blockData = await db.select({
      blockName: blocks.name,
      apn: blocks.apn,
      waterDistrict: blocks.waterDistrict,
      gsaName: blocks.gsaName,
      totalAcreInches: sql<number>`SUM(${irrigationEvents.waterAppliedAcreInches})`,
      irrigationEvents: sql<number>`COUNT(${irrigationEvents.id})`
    })
    .from(blocks)
    .leftJoin(irrigationEvents, and(eq(irrigationEvents.blockId, blocks.id), sql`EXTRACT(YEAR FROM ${irrigationEvents.scheduledDate}) = ${year}`, eq(irrigationEvents.status, 'completed')))
    .where(and(eq(blocks.orgId, orgId), eq(blocks.active, true)))
    .groupBy(blocks.id);

    return { orgId, season_year: year, blocks: blockData };
  }

  -- Export as CSV from compliance dashboard → /api/v1/compliance/sgma-report?year=2025

## 9. Web Dashboard Pages

### Irrigation Dashboard (app/(dashboard)/irrigation/page.tsx)
  - Block selector (dropdown + mini-map)
  - Per-block card:
    - Last irrigation date
    - Accumulated ET deficit (inches)
    - CIMIS ET₀ bar chart — last 14 days (recharts)
    - Recommended run time
    - "Schedule Irrigation" button → POST /api/v1/irrigation-events
  - Weekly calendar — all blocks, all scheduled/completed events
  - Season water usage total (gallons/acre)
  - SGMA report export button (CSV)

### Scouting Dashboard (app/(dashboard)/scouting/page.tsx)
  - Block heat map — color by highest recent pest pressure:
    Green = none/low | Yellow = moderate | Orange = high | Red = action
  - Pest pressure timeline (recharts — by pest species, last 60 days)
  - Recent scouting activity feed
  - Export scouting summary (PDF via jsPDF)
  - Organic blocks: show separate legend "Organic Block — OMRI compliance required"

### Frost Alert Settings (app/(dashboard)/settings/frost/page.tsx) — citrus orgs only
  - Enable/disable frost monitoring toggle
  - Warning threshold temperature (default 34°F)
  - Danger threshold temperature (default 29°F)
  - Monitoring window (default 10 PM – 8 AM)
  - Select staff to notify (multi-select from team list)
  - "Test Alert" button → sends test push notification immediately
```

---

## Phase 2 Acceptance Criteria

- [ ] CIMIS ET₀ syncs nightly via BullMQ worker for all active station IDs
- [ ] Irrigation scheduler correctly calculates recommended run time (test against known UC Cooperative Extension examples)
- [ ] ET deficit accumulates daily since last completed irrigation event
- [ ] Frost alert worker runs every 30 minutes during monitoring window (10 PM–8 AM)
- [ ] Frost alert sends push notification within 30 minutes of forecast crossing threshold — tested with mock temp data
- [ ] Frost alert settings page is only visible to orgs with citrus blocks
- [ ] Field crew can scout a block on mobile: walk mode GPS, photo, pest rating — works offline
- [ ] Organic blocks show OMRI filter in pest scouting list
- [ ] Scouting data syncs offline → online via WatermelonDB conflict resolution
- [ ] SSE: scouting log with `rating = 'action'` triggers live alert in web dashboard
- [ ] Scouting dashboard heat map colors blocks by pest pressure
- [ ] Irrigation dashboard shows accurate ET deficit per block
- [ ] SGMA report exports correctly with APN, water district, and acre-inches per block
- [ ] All new UI strings bilingual EN/ES
- [ ] Frost alert and ET alert push notifications use crew/manager's preferred_locale
