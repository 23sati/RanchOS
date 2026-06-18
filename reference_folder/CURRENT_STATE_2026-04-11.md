# RanchOS Current State

Last updated: 2026-04-11 (end of day)
Workspace: `C:\Users\sati1\Desktop\RanchOS`

This is the current source-of-truth handoff document for the repo state as of April 11, 2026, updated through the latest completed thread that day.

Use this file before older handoff docs when choosing the next slice.

## Read Order

Read these in this order:

1. `CURRENT_STATE_2026-04-11.md`
2. `Production_Readiness_Sprint_Plan_2026-04-09.md`
3. `RanchOS_Handover_2026-04-05.md`
4. `Higher_Phase_Options_2026-04-06.md`

Use older files for historical context only, not as the primary source of current status.

## Verified Commands

These commands pass in the current workspace:

```powershell
npm.cmd run build
```

```powershell
npm.cmd run db:migrate
```

## Current Verified Product State

### Foundation

- monorepo is in place
- web and API build successfully
- DB migrations run successfully
- Better Auth persistence is real and DB-backed
- signup, login, and onboarding are real
- org/profile/ranch/session flows are DB-backed
- BullMQ and Redis worker framework exist

### Mapping and Core Operations

- ranch setup is real
- ranch center and ranch boundary editing are real
- block CRUD is real and DB-backed
- ranch/block maps run on MapLibre + Geoman Free
- block and ranch geometry remain `jsonb` GeoJSON, not PostGIS
- task CRUD is real and DB-backed
- task block assignment is real
- task summary and dashboard overview are real
- overview, task, and block surfaces now support portfolio-level and single-ranch operational views from persisted ranch, block, and task data

### Irrigation and Scouting

- irrigation page is live
- block irrigation config is live
- irrigation event create/update flow is live
- irrigation dashboard depth is live on persisted ET, forecast, and event data
- irrigation page now supports portfolio-level and single-ranch operational views from persisted block, config, and event data
- irrigation page now includes an operational workbench, selected-block action guidance, copyable handoff summary, and ranch-pressure rollups on top of the current persisted ET insight and event flow
- scouting page is live
- scouting log CRUD is live
- richer scouting dashboard depth is live
- scouting page now supports portfolio-level and single-ranch operational views from persisted ranch, block, and scouting-log data
- scouting page now includes an operational workbench, selected-block follow-up guidance, recent-log context, copyable handoff summary, and ranch-pressure rollups on top of the current persisted scouting-log flow
- pest species flow exists and is wired into scouting/compliance/intelligence

### Compliance, Labor, and Harvest

- compliance product catalog is live
- application record create/edit/verification flow is live
- REI / PHI / organic-aware summaries are live
- DPR export is live
- crew member CRUD is live
- labor entry create/edit flow is live
- payroll review depth is live, including crew rollups and approval queue
- approved-entry payroll period review and CSV/XLSX export are live
- payroll admin summary depth is live, including approval activity, pay-type mix, and H-2A rollups
- labor page now supports portfolio-level and single-ranch review views from persisted block-linked labor data while keeping approved payroll export org-wide
- team settings page is live
- harvest event create/edit flow is live
- handler ticket import and reconciliation are live
- harvest CSV export is live
- compliance and harvest pages now support portfolio-level and single-ranch operational views from persisted block-linked records

### Intelligence and Environment

- intelligence dashboard is live
- persisted recommendations are used instead of dashboard-time generation
- recommendation dismiss / mark-acted flow is live
- async recommendation refresh exists for:
  - seasonal ET / degree-day refresh
  - operational writes across tasks, scouting, irrigation, and compliance
- forecast-aware environmental intelligence is persisted and worker-driven
- degree-day dashboard page is live on persisted degree-day records
- frost settings and alert workflow are now persisted and worker-aligned
- SGMA report/export flow is live on persisted irrigation, ET, and crop coefficient data

### Notifications and Delivery Ops

- persisted notifications and persisted delivery outbox architecture are in place
- urgent forecast recommendations can fan out into persisted notifications and delivery rows
- frost alerts can fan out into persisted notifications and targeted delivery rows
- Expo sender worker is wired
- Expo receipt worker is wired
- mobile Expo push token registration path exists
- notification settings page includes:
  - delivery preferences
  - quiet hours
  - queue health
  - recent delivery history
  - failure / timeout / device-churn / receipt-confirmed filters
- `/settings/notifications` refreshes live from the existing org event stream
- `/settings/frost` refreshes live from the existing org notification event stream
- notification ops/history uses the current persisted architecture and does not introduce a second transient client store
- SSE clients now fall back to safe polling when Redis-backed live streams are unavailable

### Integrations and External Access

- advisor API key management and read-only snapshot flow are live
- broader advisor settings and external handoff UX are live on top of the existing snapshot/key architecture
- AgWorld persisted spray-sync lane is now materially complete for the current Phase 4 scope:
  - org-level workspace/token settings
  - paddock mappings
  - manual push attempts for verified spray records
  - persisted sync log rows
  - queue-state filtering for verified spray records
  - targeted record selection and re-sync
  - sync-log status filtering for triage
  - readiness checklist
  - mapping coverage and blocker summaries
  - grouped sync-failure visibility
  - immediate reconciliation pressure panel
  - record-level sync-history drill-in
  - narrow manual readback and pull logging
  - push-vs-pull blocker visibility
  - comparison/mismatch summaries
  - batch readback workbench
  - copy/download external handoff UX around the existing sync log

## Recent Completed Slices

These were completed and verified in recent threads and should not be chosen again as the next slice:

- payroll/export depth from approved labor entries
- SGMA export/report flow
- broader payroll export/admin depth
- deeper payroll export and downstream admin flows
- advisor API / API keys flow
- broader advisor snapshot / handoff UX around the existing key model
- AgWorld integration first slice
- AgWorld selective sync/reconciliation UX
- broader AgWorld settings and reconciliation visibility on top of the existing sync log
- deeper AgWorld persisted reconciliation/readback drill-in on top of the current sync-log architecture
- SSE fallback / scaling hardening
- advanced multi-ranch management views at the overview/dashboard level
- broader multi-ranch admin/export semantics across compliance, harvest, labor, and overview
- overview-level portfolio admin handoff board
- deeper multi-ranch task and block operational views
- deeper multi-ranch scouting operational views
- deeper multi-ranch irrigation operational views
- deeper multi-ranch harvest operational views
- deeper multi-ranch compliance operational views
- deeper multi-ranch labor operational views
- deeper web operational workflow polish on tasks, irrigation, and scouting
- degree-day dashboard page
- richer irrigation dashboard depth
- richer scouting dashboard depth
- labor payroll review depth
- frost settings and alert workflow
- notification ops/history org-event live refresh
- crew member CRUD
- first labor entry workflow
- harvest handler reconciliation
- DPR export

## Current Early-Stage Or Preview Surfaces

These exist, but should not be described as fully hardened:

- visual themes flow
- mobile runtime hardening on device
- mobile scouting / offline walk mode
- broader AgWorld platform-level work beyond the current spray-record sync lane:
  - recommendation ingestion into intelligence
  - token lifecycle / OAuth hardening beyond the stored workspace/token model

## Deferred Until End Of Phase 4

These remain intentionally deferred unless a thread explicitly requires them:

1. real offline-first mobile DB stack fully in production shape
2. full billing / Stripe workflow verification

Reason:

- both matter, but they are not the best blocker for current product depth
- finishing the remaining contained Phase 4 and operational polish slices first gives those areas a more stable target

## Real Remaining Work

### High-confidence Remaining Product Work

- performance and materialized-view work where needed
- CIMIS ET data validation in active environments
- mobile runtime hardening

### Early Existing Surface That Still Needs Real Product Completion

- mobile scouting and true offline walk mode
- deeper web operational workflow polish beyond tasks, irrigation, and scouting
- broader AgWorld platform-level work beyond the current persisted spray-sync lane

## Recommended Next Clean Slice

If continuing contained Phase 4 product work, the cleanest next slice is:

- deeper web operational workflow polish on the intelligence page around the current persisted recommendation flow

Why this is the best next slice:

- it stays in web and continues the current operational-polish lane the last threads were already extending
- it is a contained, user-visible extension on top of the already-live persisted recommendation, dismiss, and mark-acted flow
- it keeps momentum on day-to-day operating depth without jumping into mobile hardening, billing, or a larger platform integration lane
- it should be easier to verify cleanly in one thread than CIMIS active-environment validation or mobile runtime work

Suggested scope:

- extend the current intelligence dashboard instead of inventing a second workflow
- improve recommendation triage clarity, selected-item drill-in, handoff UX, and portfolio pressure visibility around the existing persisted recommendation data
- keep changes grounded in the current recommendation records, acted/dismissed states, and org/ranch scope architecture
- avoid sprawling into mobile walk mode, billing, or broader AgWorld platform work
- verify with build and migrations, and use direct DB checks only if the slice changes persisted behavior

## Recommended Working Constraints

- start from current code and persisted flows, not from stale phase assumptions
- prefer one contained slice that can be fully implemented and verified in a single thread
- keep mobile offline-first DB hardening deferred until the end of Phase 4 unless the task clearly requires it
- keep full Stripe/billing verification deferred until the end of Phase 4 unless the task is explicitly production-readiness hardening
- prefer extending the current org event, notification, intelligence, integration, and DB-backed architectures rather than inventing parallel stores or duplicate systems

## Production-Hardening Switch

If the thread is for production hardening instead of product depth:

- use `Production_Readiness_Sprint_Plan_2026-04-09.md`
- start with the highest-value must-have item
- the best current entry point is Sprint 1 core reliability and data integrity work

## Historical Reference Files

These are still useful for context, but are no longer primary:

- `CURRENT_STATE_2026-04-10.md`
- `START_HERE.md`
- `RanchOS_Done_vs_Remaining_By_Phase_2026-04-06.md`
- `RanchOS_Handover_2026-04-05.md`
- `Higher_Phase_Options_2026-04-06.md`
