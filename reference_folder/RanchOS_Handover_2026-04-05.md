# RanchOS Handover

Last updated: 2026-04-08
Workspace: `C:\Users\sati1\Desktop\RanchOS`

## Current State

RanchOS is now past the early MVP handoff. The main DB-backed ranch operations flows are live, the first Phase 3 depth slices landed, and Phase 4 async intelligence has begun.

## What Was Completed Across The Latest Threads

### Foundation, Auth, And Mapping

1. Fixed API/web build and migration reliability so:
   - `npm.cmd run build` passes
   - `npm.cmd run db:migrate` is reliable and idempotent
2. Added Better Auth persistence and aligned auth-backed IDs with the app schema.
3. Made signup, login, onboarding, and session-backed org/profile/ranch creation work end to end.
4. Removed Mapbox and migrated web mapping to:
   - `MapLibre GL JS`
   - `@geoman-io/maplibre-geoman-free`
   - `OpenFreeMap`
5. Made ranch and block geometry/map state persist as GeoJSON in `jsonb`.
6. Replaced the static overview page with live ranch/block/task-driven data.

### Operational Web Slices Now Live

1. Tasks:
   - task CRUD
   - block assignment
   - assignee support
   - live summaries
2. Irrigation:
   - block irrigation config
   - irrigation event create/list/update
3. Scouting:
   - scouting log create/edit/delete
   - starter/system pest species
4. Compliance:
   - starter product catalog
   - application record create/list/update
   - REI / PHI / organic-aware summaries
   - verification fields: `verifiedBy`, `verifiedAt`, `certifierNotified`
   - DPR CSV export
5. Labor:
   - crew member create/list/update
   - labor entry create/list/update
   - team settings surface
   - labor dashboard page
6. Harvest:
   - harvest event create/list/update
   - handler ticket import
   - handler ticket reconciliation / event matching
   - harvest CSV export

### Intelligence And Async Follow-Through

1. Added a live intelligence dashboard backed by `ai_recommendations`.
2. Added deterministic recommendations from operational records:
   - tasks
   - scouting logs
   - irrigation config/events
   - compliance records
3. Added seasonal recommendations from:
   - ET history
   - ET freshness / deficit trigger checks
   - degree-day timing
   - hull split / pest timing thresholds
4. Added recommendation dismiss / mark-acted updates.
5. Started Phase 4 async intelligence:
   - ET worker now refreshes seasonal recommendations proactively
   - degree-day worker is now scheduled and refreshes seasonal recommendations proactively
   - operational recommendations now refresh after task / scouting / irrigation / compliance writes
   - dashboard recommendation generation was removed from request-time path; `/intelligence` now reads persisted recommendations
6. Added shared recommendation lifecycle support so generated recommendations can be inserted, updated, sorted, summarized, and stale active records removed cleanly.

### Phase 4 Async Intelligence And Notification Follow-Through

1. Recommendation refresh moved onto a real BullMQ queue / worker path:
   - mutation routes enqueue refresh work
   - worker refresh is idempotent and safe for repeated jobs
   - `/intelligence` stays read-only against persisted `ai_recommendations`
2. Live org-level update publishing was wired so the intelligence page can refresh from pushed changes instead of relying on manual reloads.
3. Forecast-aware intelligence was extended using persisted forecast data:
   - `weather_forecasts` table added
   - CIMIS sync now also persists forecast rows
   - environmental recommendations now include projected irrigation pressure
   - spray/scouting timing recommendations now use forecast windows
4. Urgent forecast-driven recommendations now create persisted notifications.
5. Notification delivery controls and outbox persistence were added:
   - `notification_settings`
   - `notification_deliveries`
   - org quiet hours
   - urgent-only push fanout
6. Expo push sender worker is live for due deliveries:
   - retries transient failures
   - marks permanent failures
   - clears dead tokens on `DeviceNotRegistered`
7. Mobile/API Expo token registration path is implemented.
8. Expo receipt reconciliation is live:
   - sent deliveries store ticket ids
   - receipt polling confirms successful receipts
   - dead-token receipt failures clear saved tokens
   - missing ticket ids and missing receipts now age out into terminal failed states instead of hanging forever
9. Notification settings now show:
   - queue health
   - receipt-confirmed vs awaiting-receipt state
   - recent delivery ops/history with filters for status, receipt failures, timeouts, device churn, and receipt-confirmed rows

### Map Stability Follow-Through

1. Added a safe inline MapLibre fallback style so map boot no longer depends on a remote style payload exposing `layers`.
2. Fixed editable Geoman cleanup sequencing so navigating away from `/blocks/new` no longer tears the map out from under async Geoman destroy work.

### Mobile Follow-Through

1. Added the mobile task follow-through source slice:
   - sync-fed mobile task list
   - task completion push path
   - local dev auth bridge
   - mobile typecheck harness
2. This is still not the final offline-first production shape.

## Key Product Decisions

### 1. Geometry Remains `jsonb` GeoJSON For Now

The configured Postgres server still does not expose PostGIS.

That means RanchOS currently stores:

- `blocks.geometry` as `jsonb`
- `ranches.map_viewport` as `jsonb`
- `ranches.boundary` as `jsonb`

Current consequence:

- no PostGIS queries or indexes yet
- no `ST_*` functions yet
- Turf-based geometry operations are still happening in the app for the current stage

### 2. Mapbox Has Been Removed

The mapping stack is now:

- `maplibre-gl`
- `@geoman-io/maplibre-geoman-free`
- remote style support when configured
- a safe inline fallback raster style for local/dev reliability

### 3. Offline-First Mobile And Full Stripe Verification Are Still Deferred

These two items are intentionally deferred until the end of Phase 4:

1. real offline-first mobile DB stack fully in production shape
2. full billing / Stripe workflow verification

They matter, but they are not the best next blocker while the planned operations + async intelligence roadmap is still being completed.

## Current Verified State

These commands pass:

```powershell
npm.cmd run build
```

```powershell
npm.cmd run db:migrate
```

Known still-valid warning:

- `web` still emits the existing Next/Turbopack warning involving `apps/web/next.config.ts` and `apps/web/src/lib/theme-specs.ts`

This warning does not currently fail the build.

## Current Local Workspace Reality

The current local workspace can still show empty states depending on data loaded into the local org.

Recent direct DB checks in this workspace returned zero rows for several newly-built flows, including:

- `crew_members`
- `labor_entries`
- `harvest_events`
- `handler_ticket_imports`
- `application_records`
- `tasks`
- `scouting_logs`
- `irrigation_events`
- `ai_recommendations`
- `degree_day_records`
- `block_irrigation_config`
- `weather_forecasts`
- `notifications`
- `notification_settings`
- `notification_deliveries`

That is expected if the local org has not been populated yet. It is not automatically a bug.

## Most Relevant Files Touched In The Latest Work

### Labor / Harvest / Compliance Depth

- `apps/api/src/routes/labor.ts`
- `apps/api/src/routes/harvest.ts`
- `apps/api/src/routes/compliance.ts`
- `apps/api/src/utils/payrollExport.ts`
- `apps/api/src/utils/complianceExport.ts`
- `apps/web/src/app/(dashboard)/settings/team/page.tsx`
- `apps/web/src/app/(dashboard)/labor/page.tsx`
- `apps/web/src/app/(dashboard)/harvest/page.tsx`
- `apps/web/src/app/(dashboard)/harvest/HandlerTicketPanel.tsx`
- `apps/web/src/app/(dashboard)/compliance/page.tsx`
- `apps/web/src/lib/labor.ts`
- `apps/web/src/lib/harvest.ts`
- `apps/web/src/lib/compliance.ts`

### Intelligence / Async Recommendation Work

- `apps/api/src/routes/intelligence.ts`
- `apps/api/src/lib/intelligenceRecommendations.ts`
- `apps/api/src/lib/environmentalRecommendations.ts`
- `apps/api/src/lib/operationalRecommendations.ts`
- `apps/api/src/lib/refreshRecommendations.ts`
- `apps/api/src/workers/etAlertWorker.ts`
- `apps/api/src/workers/degreeDayWorker.ts`
- `apps/api/src/index.ts`
- `apps/web/src/app/(dashboard)/intelligence/page.tsx`
- `apps/web/src/lib/intelligence.ts`

### Notifications / Delivery Pipeline

- `packages/db/src/schema/index.ts`
- `packages/db/drizzle/0010_spotty_songbird.sql`
- `packages/db/drizzle/0011_tan_swarm.sql`
- `packages/db/drizzle/0012_bold_stilt_man.sql`
- `packages/db/drizzle/0013_calm_harrier.sql`
- `packages/db/drizzle/0014_brass_bulldozer.sql`
- `packages/db/drizzle/0015_amber_widow.sql`
- `apps/api/src/lib/notifications.ts`
- `apps/api/src/lib/notificationDeliveries.ts`
- `apps/api/src/routes/notifications.ts`
- `apps/api/src/workers/notificationDeliveryWorker.ts`
- `apps/api/src/workers/notificationReceiptWorker.ts`
- `apps/mobile/src/lib/notifications.ts`
- `apps/mobile/src/app/(tabs)/index.tsx`
- `apps/web/src/app/(dashboard)/settings/notifications/page.tsx`
- `apps/web/src/lib/notifications.ts`

### Map Stability Files

- `apps/web/src/lib/map-style.ts`
- `apps/web/src/components/map/BlockMap.tsx`
- `apps/web/src/components/map/RanchBoundaryEditorMap.tsx`
- `apps/web/src/components/map/RanchCenterPickerMap.tsx`

### Existing Core Operational Routes Still Important

- `apps/api/src/routes/tasks.ts`
- `apps/api/src/routes/scouting.ts`
- `apps/api/src/routes/irrigation.ts`
- `apps/api/src/routes/compliance.ts`

## Recommended Next Slice

Continue Phase 4 async intelligence from the current state.

### Goal

Wire the new notification delivery ops/history view into the existing org event stream so `/settings/notifications` refreshes queue health and recent delivery history live while sender and receipt workers are running.

### Scope

Keep the next slice contained:

1. inspect the existing live-update path already used by intelligence and notifications
2. subscribe the notifications settings page to org events rather than polling-only history reloads
3. update queue-health and delivery-history state from pushed events in a clean, minimal way
4. keep the UI grounded in persisted `notification_deliveries` rows rather than inventing a second transient store
5. verify with build, migrate, direct DB checks, and a quick browser sanity pass if feasible

### Good Starting Files

- `apps/api/src/lib/orgEvents.ts`
- `apps/api/src/routes/events.ts`
- `apps/api/src/lib/notifications.ts`
- `apps/api/src/lib/notificationDeliveries.ts`
- `apps/api/src/routes/notifications.ts`
- `apps/web/src/app/(dashboard)/settings/notifications/page.tsx`
- `apps/web/src/lib/notifications.ts`
- `apps/web/src/lib/intelligence.ts`

## Higher-Phase References

See:

- [Higher_Phase_Options_2026-04-06.md](/C:/Users/sati1/Desktop/RanchOS/reference_folder/Higher_Phase_Options_2026-04-06.md)
- [RanchOS_Done_vs_Remaining_By_Phase_2026-04-06.md](/C:/Users/sati1/Desktop/RanchOS/reference_folder/RanchOS_Done_vs_Remaining_By_Phase_2026-04-06.md)

## Useful Commands

```powershell
npm.cmd run build
```

```powershell
npm.cmd run db:migrate
```

If you need direct DB validation, query the configured Postgres database and inspect the relevant tables directly.

## One-Line Summary For The Next Thread

RanchOS now has live DB-backed auth, mapping, tasks, irrigation, scouting, compliance, labor, harvest, persisted async intelligence, forecast-driven notifications, Expo send/receipt workers, and notification ops/history; the next clean slice is live-refreshing `/settings/notifications` from org events while keeping offline-first mobile hardening and full Stripe verification deferred until the end of Phase 4.
