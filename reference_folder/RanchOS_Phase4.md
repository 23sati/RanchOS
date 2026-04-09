# RanchOS — Phase 4: Scale, Intelligence & Integrations
### Weeks 47–70 | Goal: 100+ growers. AI irrigation recommendations. Harvest handler reconciliation. AgWorld sync. Public API for advisors. ARR > $600K.

> **Read `RanchOS_Overview.md` first.** All Phase 0–3 features are live and stable.

---

## Phase 4 Task for IDE

```
RANCHOS PHASE 4: Add AI-driven recommendations, degree-day pest models, harvest handler reconciliation,
multi-ranch management view, public API for ag advisors, AgWorld integration, SSE scaling.

All Phase 1–3 features are live. Stack: VPS Postgres, Drizzle, Hono API, BullMQ + Redis, Better Auth,
Cloudflare R2, SSE + Redis pub/sub.

## 1. Database Schema Additions

### Migration 026 — Degree Day Accumulation
  CREATE TABLE degree_day_records (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cimis_station_id INTEGER NOT NULL REFERENCES cimis_stations(id),
    pest_model       TEXT NOT NULL,   -- 'NOW', 'PTB', 'CITRUS_THRIPS', 'ACP'
    date             DATE NOT NULL,
    daily_dd         DECIMAL(8,4),   -- degree days this day
    cumulative_dd    DECIMAL(10,4),  -- running total from biofix
    biofix_date      DATE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cimis_station_id, pest_model, date)
  );
  CREATE INDEX dd_records_station_model_idx ON degree_day_records(cimis_station_id, pest_model, date DESC);

### Migration 027 — AI / Rule-Based Recommendations
  CREATE TABLE ai_recommendations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    block_id            UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('irrigation','pest_action','harvest_timing','hull_split','general')),
    title_en            TEXT NOT NULL,
    title_es            TEXT NOT NULL,
    body_en             TEXT NOT NULL,
    body_es             TEXT NOT NULL,
    urgency             TEXT CHECK (urgency IN ('info','suggestion','warning','urgent')),
    data_inputs         JSONB,        -- what drove this recommendation (for transparency)
    dismissed_at        TIMESTAMPTZ,
    acted_on_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX ai_recs_org_block_idx ON ai_recommendations(org_id, block_id, created_at DESC);

### Migration 028 — AgWorld Sync Log
  CREATE TABLE agworld_sync_log (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id       UUID NOT NULL REFERENCES organizations(id),
    sync_type    TEXT NOT NULL CHECK (sync_type IN ('spray_record','scout_log','block','recommendation')),
    agworld_id   TEXT,
    ranchos_id   UUID,
    direction    TEXT CHECK (direction IN ('push','pull')),
    status       TEXT CHECK (status IN ('success','failed','conflict')),
    error_message TEXT,
    synced_at    TIMESTAMPTZ DEFAULT NOW()
  );

### Migration 029 — API Keys (for ag advisors / PCAs)
  CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key_hash    TEXT UNIQUE NOT NULL,    -- bcrypt hash, plaintext shown only once
    name        TEXT NOT NULL,           -- e.g. "PCA - John Smith"
    scopes      TEXT[] NOT NULL,         -- ['read:blocks','read:scouting','read:spray_records','read:irrigation','read:degree_days']
    last_used_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ,
    created_by  UUID REFERENCES profiles(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

### Migration 030 — Harvest Handler Reconciliation
  CREATE TABLE handler_ticket_imports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    harvest_event_id UUID REFERENCES harvest_events(id),
    import_date     TIMESTAMPTZ NOT NULL,
    handler_name    TEXT NOT NULL,
    load_ticket     TEXT NOT NULL,
    ticket_date     DATE,
    net_pounds      DECIMAL(12,2),
    gross_pounds    DECIMAL(12,2),
    moisture_pct    DECIMAL(5,2),
    hulled_weight_lbs DECIMAL(12,2),
    price_per_pound DECIMAL(8,4),
    gross_value     DECIMAL(12,2),
    status          TEXT DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','discrepancy')),
    discrepancy_notes TEXT,
    imported_by     UUID REFERENCES profiles(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
  );

## 2. Degree-Day Pest Models (BullMQ Worker — runs nightly after CIMIS sync)

### apps/api/src/workers/degreeDayWorker.ts

  const PEST_MODELS = {
    NOW: {
      name: 'Navel Orangeworm',
      lowerThresholdF: 55, upperThresholdF: 94,
      biofix_month: 3,           // March (almond bloom)
      action_threshold_dd: 1350, // 2nd generation peak
      applicable_crops: ['almond','navel_orange','valencia_orange']
    },
    PTB: {
      name: 'Peach Twig Borer',
      lowerThresholdF: 50, upperThresholdF: 88,
      biofix_month: 2,           // February
      action_threshold_dd: 260,
      applicable_crops: ['almond']
    },
    CITRUS_THRIPS: {
      name: 'Citrus Thrips',
      lowerThresholdF: 58, upperThresholdF: 94,
      biofix_month: 1,           // January (egg hatch at petal fall)
      action_threshold_dd: 212,
      applicable_crops: ['citrus','navel_orange','valencia_orange','lemon','mandarin']
    },
    ACP: {
      name: 'Asian Citrus Psyllid',
      lowerThresholdF: 61, upperThresholdF: 99,
      biofix_month: 3,
      action_threshold_dd: 300,
      applicable_crops: ['citrus','navel_orange','valencia_orange','lemon','mandarin']
    }
  };

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
        // Cap max temp at upper threshold before averaging
        const cappedMax = Math.min(etRecord.maxTempF, model.upperThresholdF);
        const avgTemp = (cappedMax + etRecord.minTempF) / 2;
        const dailyDD = Math.max(0, avgTemp - model.lowerThresholdF);

        // Get cumulative from yesterday
        const [lastRecord] = await db.select().from(degreeDayRecords)
          .where(and(eq(degreeDayRecords.cimisStationId, station.id), eq(degreeDayRecords.pestModel, modelKey)))
          .orderBy(desc(degreeDayRecords.date)).limit(1);

        // Reset cumulative if before biofix month
        const currentMonth = new Date().getMonth() + 1;
        const isBelowBiofix = currentMonth < model.biofix_month;
        const cumulativeDD = isBelowBiofix ? 0 : ((lastRecord?.cumulativeDd || 0) + dailyDD);

        const [biofixRecord] = await db.select().from(degreeDayRecords)
          .where(and(eq(degreeDayRecords.cimisStationId, station.id), eq(degreeDayRecords.pestModel, modelKey), sql`EXTRACT(MONTH FROM biofix_date) = ${model.biofix_month}`, sql`EXTRACT(YEAR FROM date) = ${new Date().getFullYear()}`))
          .limit(1);

        await db.insert(degreeDayRecords).values({
          cimisStationId: station.id,
          pestModel: modelKey,
          date: dateStr,
          dailyDd: dailyDD,
          cumulativeDd: cumulativeDD,
          biofixDate: biofixRecord?.biofixDate || null
        }).onConflictDoUpdate({ target: [degreeDayRecords.cimisStationId, degreeDayRecords.pestModel, degreeDayRecords.date], set: { dailyDd: dailyDD, cumulativeDd: cumulativeDD } });

        // If cumulative DD crosses action threshold → create AI recommendation
        if (cumulativeDD >= model.action_threshold_dd && (!lastRecord || lastRecord.cumulativeDd < model.action_threshold_dd)) {
          await createDDActionRecommendation(station.id, modelKey, model, cumulativeDD);
        }
      }
    }
  }

## 3. AI Irrigation Recommendation Engine (Rule-Based Expert System)

### packages/shared/src/utils/irrigationRecommender.ts
  NOTE: Phase 4 uses rule-based logic (not ML). Phase 5 can replace with ML model
  trained on historical irrigation + yield data.

  export async function generateIrrigationRecommendation(blockId: string) {
    const [block] = await db.select().from(blocks).where(eq(blocks.id, blockId));
    const [config] = await db.select().from(blockIrrigationConfig).where(eq(blockIrrigationConfig.blockId, blockId));

    const etDeficit = await getEtDeficit(blockId);
    const [centroid] = await db.execute(sql`SELECT ST_Y(ST_Centroid(geometry::geometry)) as lat, ST_X(ST_Centroid(geometry::geometry)) as lng FROM blocks WHERE id = ${blockId}`);

    // Get 48-hour rain forecast from Open-Meteo
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${centroid.lat}&longitude=${centroid.lng}&daily=precipitation_sum&forecast_days=2&timezone=America/Los_Angeles`;
    const forecast = await fetch(forecastUrl).then(r => r.json());
    const next48hRainInches = (forecast.daily.precipitation_sum[0] + forecast.daily.precipitation_sum[1]) * 0.0394;

    const recommendations = [];
    const trigger = config?.deficitTriggerInches || 1.5;

    // Rule 1: ET deficit exceeds trigger
    if (etDeficit >= trigger) {
      const runtime = calculateIrrigationRuntime({ etDeficit, ...config });
      const urgency = etDeficit > trigger * 1.5 ? 'urgent' : 'suggestion';
      recommendations.push({
        type: 'irrigation', urgency,
        title_en: `${block.name} needs irrigation`,
        title_es: `${block.name} necesita riego`,
        body_en: `ET deficit is ${etDeficit.toFixed(2)}" since last irrigation. Recommend ${runtime.recommendedRuntimeHours}hr run.`,
        body_es: `El déficit de ET es ${etDeficit.toFixed(2)}" desde el último riego. Se recomienda correr ${runtime.recommendedRuntimeHours}hr.`,
        data_inputs: { et_deficit: etDeficit, runtime: runtime.recommendedRuntimeHours }
      });
    }

    // Rule 2: Rain expected — skip irrigation
    if (next48hRainInches > 0.3 && etDeficit < trigger * 0.8) {
      recommendations.push({
        type: 'irrigation', urgency: 'info',
        title_en: `Skip irrigation — rain expected`,
        title_es: `Omitir riego — se espera lluvia`,
        body_en: `${next48hRainInches.toFixed(2)}" of rain forecast in 48 hours. Consider delaying irrigation.`,
        body_es: `Se pronostican ${next48hRainInches.toFixed(2)}" de lluvia en 48 horas. Considere retrasar el riego.`,
        data_inputs: { rain_forecast_inches: next48hRainInches }
      });
    }

    // Rule 3: Almond hull split — reduce irrigation in August
    if (block.cropType === 'almond' && new Date().getMonth() === 7) {
      recommendations.push({
        type: 'hull_split', urgency: 'warning',
        title_en: `Hull split period — reduce irrigation`,
        title_es: `Período de apertura de cáscaras — reducir riego`,
        body_en: `August hull split period. Avoid irrigation 2 weeks before harvest to reduce hull rot and NOW damage.`,
        body_es: `Período de apertura en agosto. Evite regar 2 semanas antes de la cosecha para reducir pudredumbre y daño de gusano.`,
        data_inputs: { month: 'august', crop: 'almond' }
      });
    }

    // Persist recommendations
    for (const rec of recommendations) {
      await db.insert(aiRecommendations).values({ orgId: block.orgId, blockId, ...rec });
      await redis.publish(`org:${block.orgId}`, JSON.stringify({ type: 'new_recommendation', block_id: blockId }));
    }
  }

## 4. Harvest Handler Reconciliation Module

### Web: app/(dashboard)/harvest/reconcile/page.tsx
  This closes the financial loop for almond operations. Handlers send ticket reports
  2–6 weeks after delivery. Growers need to match these against their harvest records.

  Features:
  - CSV import of handler tickets (Blue Diamond, Huller/Packer format)
    → Parse: load_ticket, net_pounds, gross_pounds, moisture_pct, price_per_pound, gross_value
    → Store in handler_ticket_imports table
  - Auto-match by load_ticket number to harvest_events.load_ticket
  - For matched records: compare net_pounds vs harvest_events.total_pounds
    → If within 2%: status = 'matched'
    → If > 2% variance: status = 'discrepancy' — flag for manager review
  - Unmatched tickets: show in "Unmatched Tickets" list for manual matching
  - Summary: Total pounds delivered vs total pounds recorded in field = discrepancy %
  - Update block_seasons.total_yield_lbs when reconciliation is complete

### API: /api/v1/harvest/import-tickets (POST)
  Accepts multipart/form-data with CSV file.
  Parses CSV, validates columns, inserts into handler_ticket_imports.
  Runs auto-match logic and returns match results.

## 5. Multi-Ranch Management View (Web)

### app/(dashboard)/overview/page.tsx
  Layout:
  - Full-width Mapbox map showing ALL ranches and blocks for the org
  - Color by alert level: gray = normal, yellow = attention (ET alert or moderate pest), red = action needed
  - Summary bar: total active acres | open tasks | ET alerts | pest alerts | frost alerts
  - Ranch cards below map:
    - Ranch name + total acreage
    - Active task count
    - Today's ET deficit range (min–max across blocks)
    - Highest pest pressure level
    - Frost alert status (citrus ranches)
    - Last irrigation date
    - "View Ranch" button → ranch-filtered dashboard

## 6. Public API for Ag Advisors (PCAs, CCAs)

  Base URL: /api/v1/advisor/
  Auth: Bearer token (API key from api_keys table). All endpoints scope-check the key's scopes[].
  Rate limit: 100 req/hour per API key (Redis sliding window).

  Endpoints:
  GET  /api/v1/advisor/blocks?ranch_id=        scope: read:blocks
       Returns: blocks[] with geometry, variety, acreage, crop_type, is_organic, apn

  GET  /api/v1/advisor/blocks/:id/scouting?start=&end=   scope: read:scouting
       Returns: scouting_logs[] with pest_species, rating, gps, photo_urls

  GET  /api/v1/advisor/blocks/:id/spray-records?start=&end=  scope: read:spray_records
       Returns: application_records[] with product, rate, date, rei_expiry, phi_expiry, is_organic_block

  GET  /api/v1/advisor/blocks/:id/irrigation?start=&end=  scope: read:irrigation
       Returns: irrigation_events[] with et_deficit_inches, runtime, water_applied_acre_inches

  GET  /api/v1/advisor/degree-days?station_id=&pest_model=  scope: read:degree_days
       Returns: { cumulative_dd, days_to_threshold, pest_model, action_threshold_dd, biofix_date }

  All responses include headers:
    X-RanchOS-Org-Locale: en|es
    X-RanchOS-Rate-Limit-Remaining: N

  API key management UI: Settings → API Keys → Create (shows plaintext once) / Revoke

## 7. AgWorld Integration

### lib/integrations/agworld.ts
  AgWorld API (api.agworld.com.au — used in CA through Wilbur-Ellis partnership)
  OAuth setup in org_integrations (type = 'agworld')

  Bidirectional sync:
  Push → RanchOS application_records → AgWorld spray records
  Pull → AgWorld PCA recommendations → RanchOS tasks (as suggested tasks, manager approval required)
  Sync → Block boundaries (RanchOS blocks ↔ AgWorld paddocks)

  Field mapping stored in org_integrations.settings:
  {
    "field_mappings": [{ "ranchos_block_id": "uuid", "agworld_paddock_id": "123" }],
    "auto_push_spray_records": true,
    "auto_pull_recommendations": false
  }

  Log every sync attempt (success/failed/conflict) in agworld_sync_log.

## 8. SSE Scaling + Polling Fallback

  At 100+ orgs with concurrent SSE connections, the Redis pub/sub channel approach
  (from Phase 0) scales well — each Hono server instance subscribes to Redis,
  not to each other. Use Redis Pub/Sub (not Redis Streams) for simplicity.

  WEB (Next.js) — SSE fallback:
  // In ActivityFeed.tsx: if EventSource fails, fall back to 30-second polling
  let source: EventSource | null = null;
  function connectSSE() {
    source = new EventSource(`${API_URL}/api/v1/events/${orgId}`, { withCredentials: true });
    source.onerror = () => {
      source?.close();
      // Switch to polling every 30 seconds
      setInterval(() => refetchRecentActivity(), 30000);
    };
  }

  MOBILE — SSE not used. Mobile uses the pull sync endpoint every time app comes to foreground.
  Push notifications handle urgent alerts (frost, ET, scouting action threshold).

## 9. Performance Optimizations (100+ orgs)

  Database:
  - Partial indexes on tasks WHERE status != 'completed' (queries hit only open tasks)
  - Materialized view for org-level dashboards (refresh every hour via BullMQ):
    CREATE MATERIALIZED VIEW org_dashboard_summary AS
      SELECT org_id, COUNT(*) FILTER (WHERE status='pending') as pending_tasks,
        COUNT(*) FILTER (WHERE status='overdue') as overdue_tasks,
        COUNT(DISTINCT b.id) as active_blocks
      FROM tasks t JOIN task_blocks tb ON tb.task_id = t.id JOIN blocks b ON b.id = tb.block_id
      WHERE b.active = true GROUP BY t.org_id;
  - Connection pooling: use pg-pool with max: 20 in Drizzle config

  Web:
  - React Query stale-while-revalidate for all data fetching
  - Next.js ISR for org-level dashboard pages (revalidate: 60)
  - Mapbox tile caching via Cloudflare (enable cache on mapbox.com domain)

  Mobile:
  - WatermelonDB lazy loading — pull only tasks assigned to the logged-in crew member
  - Expo Updates for OTA JS fixes without app store review
  - Minimize sync payload: only pull tasks with updated_at > last_pulled_at and assigned to this user

  API (Hono):
  - Response compression (hono/compress middleware)
  - Request ID middleware for tracing
  - Sentry for error tracking

## 10. Degree-Day Dashboard (Web — app/(dashboard)/pest-models/page.tsx)

  - Station selector (dropdown of active CIMIS stations for org's ranches)
  - Tabs: NOW | PTB | Citrus Thrips | ACP
  - Per-model card:
    - Cumulative degree days accumulated (progress bar to action threshold)
    - Days since biofix
    - Days to action threshold (projected at current accumulation rate)
    - Historical DD chart (last 30 days, bar chart via recharts)
    - "Action threshold reached" red alert banner if exceeded
  - All labels bilingual
```

---

## Phase 4 Acceptance Criteria

- [ ] Degree-day accumulation correct for NOW and PTB — validate against UC IPM published tables
- [ ] Degree-day resets correctly at biofix month each year
- [ ] AI irrigation recommendation fires when ET deficit exceeds trigger threshold
- [ ] Rain forecast integration prevents spurious irrigation recommendations (test: mock >0.3" rain forecast)
- [ ] Almond hull-split warning fires in August (test with mocked date)
- [ ] Harvest handler CSV import parses correctly and auto-matches by load_ticket
- [ ] Matched records within 2% variance show 'matched' status
- [ ] Discrepancies > 2% flagged with discrepancy_notes prompt
- [ ] block_seasons.total_yield_lbs updates on reconciliation completion
- [ ] Multi-ranch overview shows all ranches on one Mapbox map with correct alert colors
- [ ] API key creation stores bcrypt hash; plaintext shown only once
- [ ] Advisor API endpoints return correct data scoped to key permissions
- [ ] API rate limiting: 101st request within 1 hour returns 429 Too Many Requests
- [ ] AgWorld OAuth connects and at least one spray record syncs bidirectionally
- [ ] SSE fallback: if EventSource fails, web falls back to 30s polling within 5 seconds
- [ ] Materialized view refreshes on schedule (verify with pg_stat_user_tables)
- [ ] p95 API response time under 500ms at 100 concurrent users (load test with k6)
- [ ] Mobile app bundle under 30MB (verify with expo-bundle-analyzer)
- [ ] All new features bilingual EN/ES

---

## Future: Phase 5 Considerations (Not in Scope)

- ML-based irrigation model trained on org-specific historical irrigation + yield data
- Satellite NDVI integration (Planet Labs or Sentinel-2) for block health monitoring
- Automated soil moisture sensor integration (Irrometer, Campbell Scientific)
- Grower community benchmarking ("Your almond yield vs county average")
- Marketplace: connect growers with PCAs, water brokers, equipment dealers
