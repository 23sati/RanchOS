# Start Here

Continue from these reference docs first:

- [RanchOS_Handover_2026-04-05.md](/C:/Users/sati1/Desktop/RanchOS/reference_folder/RanchOS_Handover_2026-04-05.md)
- [Higher_Phase_Options_2026-04-06.md](/C:/Users/sati1/Desktop/RanchOS/reference_folder/Higher_Phase_Options_2026-04-06.md)
- [RanchOS_Done_vs_Remaining_By_Phase_2026-04-06.md](/C:/Users/sati1/Desktop/RanchOS/reference_folder/RanchOS_Done_vs_Remaining_By_Phase_2026-04-06.md)

## Current Verified State

These commands pass:

```powershell
npm.cmd run build
```

```powershell
npm.cmd run db:migrate
```

Verified app state:

- Better Auth persistence, login, signup, and onboarding are real and DB-backed
- block CRUD and ranch/block map flows are real and DB-backed
- map startup and editable-map teardown crashes were patched for the blocks flow
- task CRUD with block assignment is real and DB-backed
- overview, irrigation, scouting, compliance, intelligence, harvest, labor, and team settings pages are live against the real database
- crew member CRUD and first labor entry CRUD are real and DB-backed
- harvest events plus handler ticket import/reconciliation are real and DB-backed
- compliance includes DPR export plus application edit/verification flow
- intelligence now reads persisted recommendations rather than generating them on dashboard load
- async intelligence is live for both:
  - seasonal ET / degree-day recommendation refresh
  - operational task / scouting / irrigation / compliance recommendation refresh on write
- forecast-aware environmental intelligence is persisted and worker-driven
- urgent forecast recommendations now fan out into persisted notifications and a push-ready delivery outbox
- Expo sender and receipt workers are wired
- mobile Expo push token registration path exists
- notification settings now include queue health plus recent delivery ops/history filters for failures, timeouts, device churn, and receipt confirmation
- block and ranch geometry remain `jsonb` GeoJSON because the current DB server still does not support PostGIS
- Mapbox has been removed; the web app uses MapLibre + Geoman Free + a safe MapLibre fallback style path
- mobile task follow-through is source-complete and typechecked, but not yet fully runtime-hardened

## Recommended Next Task

Phase 4 async intelligence has started. Continue that contained roadmap before jumping to deferred mobile DB hardening or full Stripe verification.

Do this next:

- wire the notification ops/history section into the existing org event stream so `/settings/notifications` refreshes live while sender and receipt workers are running
- keep it on the current persisted notification and outbox architecture
- do not jump to offline-first mobile DB work yet
- do not prioritize full billing / Stripe verification yet

Defer these two items until the end of Phase 4:

1. real offline-first mobile DB stack fully in production shape
2. full billing / Stripe workflow verification

## Recommended Working Constraints

- read the handoff file first
- read the done-vs-remaining file before choosing the next slice
- read the higher-phase options file before choosing a new slice
- prefer one contained slice that can be fully implemented and verified in a single thread
- keep the next slice grounded in the current codebase and existing data flows rather than inventing a new subsystem
