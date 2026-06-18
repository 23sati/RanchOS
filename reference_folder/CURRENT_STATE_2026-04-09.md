# RanchOS Current State

Superseded on 2026-04-10 by `CURRENT_STATE_2026-04-10.md`.

Use the newer file first for future threads.

Last updated: 2026-04-09
Workspace: `C:\Users\sati1\Desktop\RanchOS`

This is the current source-of-truth handoff document for the repo state as of April 9, 2026.

Use this file before older handoff docs when choosing the next slice.

## Read Order

Read these in this order:

1. `CURRENT_STATE_2026-04-09.md`
2. `RanchOS_Handover_2026-04-05.md`
3. `Higher_Phase_Options_2026-04-06.md`

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
- scouting page is live
- scouting log CRUD is live
- pest species flow exists and is wired into scouting/compliance/intelligence

### Compliance, Labor, and Harvest

- compliance product catalog is live
- application record create/edit/verification flow is live
- REI / PHI / organic-aware summaries are live
- DPR export is live
- crew member CRUD is live
- labor entry create/edit flow is live
- team settings page is live
- harvest event create/edit flow is live
- handler ticket import and reconciliation are live
- harvest CSV export is live

### Intelligence

- intelligence dashboard is live
- persisted recommendations are used instead of dashboard-time generation
- recommendation dismiss / mark-acted flow is live
- async recommendation refresh exists for:
  - seasonal ET / degree-day refresh
  - operational writes across tasks, scouting, irrigation, and compliance
- forecast-aware environmental intelligence is persisted and worker-driven

### Notifications and Delivery Ops

- persisted notifications and persisted delivery outbox architecture are in place
- urgent forecast recommendations can fan out into persisted notifications and delivery rows
- Expo sender worker is wired
- Expo receipt worker is wired
- mobile Expo push token registration path exists
- notification settings page includes:
  - delivery preferences
  - quiet hours
  - queue health
  - recent delivery history
  - failure / timeout / device-churn / receipt-confirmed filters
- `/settings/notifications` now refreshes live from the existing org event stream
- notification ops/history uses the current persisted architecture and does not introduce a second transient client store

## Verification Completed On The Notification Live-Refresh Slice

The recently completed `/settings/notifications` org-event slice was verified with:

- `npm.cmd run build`
- `npm.cmd run db:migrate`
- direct DB checks on notification tables
- Redis-backed worker drill
- seeded pending/sent delivery rows
- sender worker execution
- receipt worker execution
- confirmation of persisted state transitions and ops counters
- confirmation that `notifications_updated` org events carry the expected summary changes

Verified delivery transitions included:

- `pending -> failed` with `invalid_push_token`
- `sent -> failed` with `expo_missing_ticket_id_timeout`

Verified live event reasons included:

- `notification_delivery_send`
- `notification_delivery_receipts`

Known verification gap:

- browser-visible automated confirmation of the repaint on `/settings/notifications` was blocked by local headless Edge/CDP behavior
- backend publish/subscribe path and persisted state transitions were verified end to end
- a manual browser sanity pass remains the best final UX confirmation for that slice

## Current Early-Stage Or Preview Surfaces

These exist, but should not be described as fully hardened:

- frost settings page
- visual themes flow
- mobile runtime hardening on device
- deeper payroll export UX
- full advisor/integration surface area

## Deferred Until End Of Phase 4

These remain intentionally deferred:

1. real offline-first mobile DB stack fully in production shape
2. full billing / Stripe workflow verification

Reason:

- both matter, but they are not the best blocker for current product depth
- finishing the remaining contained Phase 4 and operational polish slices first gives those areas a more stable target

## What Is No Longer A Good "Next Task"

Do not use these as the next recommended slice anymore:

- wiring notification ops/history into the org event stream
- crew member CRUD
- first labor entry workflow
- harvest handler reconciliation
- DPR export

Those were already completed and verified in recent threads.

## Real Remaining Work

### High-confidence Remaining Product Work

- degree-day dashboard page
- advisor API / API keys flow
- AgWorld integration
- SSE fallback / scaling hardening
- performance and materialized-view work where needed
- advanced multi-ranch management views
- CIMIS ET data validation in active environments
- SGMA export/report flow
- richer irrigation dashboard depth from the original phase concepts
- richer scouting dashboard depth from the original phase concepts
- mobile runtime hardening
- payroll/export depth

### Early Existing Surface That Still Needs Real Product Completion

- frost settings and alert workflow
- mobile scouting and true offline walk mode
- deeper labor/payroll flows

## Recommended Next Clean Slice

If continuing contained Phase 4 product work, the cleanest next slice is:

- build the first degree-day dashboard page on top of the persisted environmental intelligence and existing degree-day records

Why this is the best next slice:

- it stays inside current Phase 4 depth
- it uses already-persisted data rather than inventing a new subsystem
- it is user-visible and product-deepening
- it does not conflict with the deferred mobile DB or Stripe verification work

Suggested scope:

- add a dashboard page for degree-day trends and current accumulation
- keep data reads on the existing persisted schema
- avoid introducing speculative forecasting layers beyond what already exists
- verify with build, migrations, and direct DB checks

## Recommended Working Constraints

- start from current code and persisted flows, not from stale phase assumptions
- prefer one contained slice that can be fully implemented and verified in a single thread
- keep mobile offline-first DB hardening deferred until the end of Phase 4
- keep full Stripe/billing verification deferred until the end of Phase 4
- prefer extending the current org event, notification, intelligence, and DB-backed architectures rather than inventing parallel stores or duplicate systems

## Historical Reference Files

These are still useful for context, but are no longer primary:

- `START_HERE.md`
- `RanchOS_Done_vs_Remaining_By_Phase_2026-04-06.md`
- `RanchOS_Handover_2026-04-05.md`
- `Higher_Phase_Options_2026-04-06.md`
