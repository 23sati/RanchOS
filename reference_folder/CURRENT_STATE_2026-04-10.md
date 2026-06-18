# RanchOS Current State

Last updated: 2026-04-10
Workspace: `C:\Users\sati1\Desktop\RanchOS`

This is the current source-of-truth handoff document for the repo state as of April 10, 2026.

Use this file before older handoff docs when choosing the next slice.

## Read Order

Read these in this order:

1. `CURRENT_STATE_2026-04-10.md`
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

### Irrigation and Scouting

- irrigation page is live
- block irrigation config is live
- irrigation event create/update flow is live
- irrigation dashboard depth is live on persisted ET, forecast, and event data
- scouting page is live
- scouting log CRUD is live
- richer scouting dashboard depth is live
- pest species flow exists and is wired into scouting/compliance/intelligence

### Compliance, Labor, and Harvest

- compliance product catalog is live
- application record create/edit/verification flow is live
- REI / PHI / organic-aware summaries are live
- DPR export is live
- crew member CRUD is live
- labor entry create/edit flow is live
- payroll review depth is live, including crew rollups and approval queue
- team settings page is live
- harvest event create/edit flow is live
- handler ticket import and reconciliation are live
- harvest CSV export is live

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

## Recent Completed Slices

These were completed and verified in recent threads and should not be chosen again as the next slice:

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
- deeper payroll export UX
- full advisor/integration surface area
- advanced multi-ranch operational views

## Deferred Until End Of Phase 4

These remain intentionally deferred unless a thread explicitly requires them:

1. real offline-first mobile DB stack fully in production shape
2. full billing / Stripe workflow verification

Reason:

- both matter, but they are not the best blocker for current product depth
- finishing the remaining contained Phase 4 and operational polish slices first gives those areas a more stable target

## Real Remaining Work

### High-confidence Remaining Product Work

- payroll/export depth from approved labor entries
- advisor API / API keys flow
- AgWorld integration
- SSE fallback / scaling hardening
- performance and materialized-view work where needed
- advanced multi-ranch management views
- CIMIS ET data validation in active environments
- SGMA export/report flow
- mobile runtime hardening

### Early Existing Surface That Still Needs Real Product Completion

- mobile scouting and true offline walk mode
- deeper payroll export and downstream admin flows
- broader advisor/integration UX around the already-planned surfaces

## Recommended Next Clean Slice

If continuing contained Phase 4 product work, the cleanest next slice is:

- deepen payroll/export from approved labor entries

Why this is the best next slice:

- it builds directly on the newly completed payroll review and approval workflow
- it stays inside the current persisted labor architecture
- it is user-visible and operationally valuable
- it avoids expanding into tax, billing, or speculative accounting subsystems

Suggested scope:

- add a pay-period review/export surface based on approved labor entries
- support approved-only rollups by crew, hours, and gross pay
- add a clean CSV export path grounded in the current labor/payroll utilities
- keep edits minimal and avoid introducing payroll tax or withholding logic
- verify with build, migrations, and direct DB checks

## Recommended Working Constraints

- start from current code and persisted flows, not from stale phase assumptions
- prefer one contained slice that can be fully implemented and verified in a single thread
- keep mobile offline-first DB hardening deferred until the end of Phase 4 unless the task clearly requires it
- keep full Stripe/billing verification deferred until the end of Phase 4 unless the task is explicitly production-readiness hardening
- prefer extending the current org event, notification, intelligence, and DB-backed architectures rather than inventing parallel stores or duplicate systems

## Production-Hardening Switch

If the thread is for production hardening instead of product depth:

- use `Production_Readiness_Sprint_Plan_2026-04-09.md`
- start with the highest-value must-have item
- the best current entry point is Sprint 1 core reliability and data integrity work

## Historical Reference Files

These are still useful for context, but are no longer primary:

- `START_HERE.md`
- `RanchOS_Done_vs_Remaining_By_Phase_2026-04-06.md`
- `RanchOS_Handover_2026-04-05.md`
- `Higher_Phase_Options_2026-04-06.md`
