# RanchOS Done vs Remaining By Phase

Last updated: 2026-04-06
Workspace: `C:\Users\sati1\Desktop\RanchOS`

This file compares the original phase plans against the current repo state.

Important context:

- the original phase docs are directionally useful, but some implementation assumptions are stale
- current RanchOS uses `jsonb` GeoJSON plus `MapLibre`, not `PostGIS` plus `Mapbox`
- "done" means functionally implemented in the repo and verified in recent threads
- "remaining" means still missing, only partially implemented, or schema-only

## Phase 0

### Done

- monorepo is in place
- web and API build successfully
- DB migrations run successfully
- Better Auth is wired and DB-backed
- onboarding and session flows are real
- EN/ES-oriented app structure exists
- BullMQ and Redis worker framework exists

### Remaining

- formal WatermelonDB production decision is still not fully closed in a live runtime sense
- full mobile offline-first DB stack in production shape is not done
- full CI / validation items from the original doc were not all re-verified in the recent threads
- non-code validation items remain outside the repo:
  - grower interviews
  - LOIs
  - onboarding field validation with growers

### Deferral Decision

These two original Phase 0 / 1 items are intentionally deferred to the end of Phase 4:

1. real offline-first mobile DB stack fully in production shape
2. full billing / Stripe workflow verification

Reason:

- they are important, but not the best blocker for current product depth
- finishing operations, labor, compliance, and integrations first gives the mobile and billing hardening work a more stable target

## Phase 1

### Done

- ranch setup is real
- block CRUD is real
- task CRUD is real
- task block assignment is real
- dashboard task summaries are real
- overview page is live
- onboarding is real
- mobile task follow-through source slice exists

### Remaining

- mobile runtime hardening on actual device
- full offline-first mobile sync architecture in production shape
- team / invite management UX from the phase doc
- full billing / Stripe workflow verification
- some dashboard and weather/feed polish from the original doc

### Deferred To End Of Phase 4

- real offline-first mobile DB stack fully in production shape
- full billing / Stripe workflow verification

## Phase 2

### Done

- irrigation page is live
- block irrigation config is live
- irrigation event list/create/update is live
- scouting page is live
- scouting log CRUD is live
- pest species data exists
- ET utility and worker scaffolding exist
- frost worker scaffolding exists
- intelligence now reads ET and degree-day history where available

### Remaining

- actual CIMIS ET data population and validation in active environments
- frost settings page and test-alert workflow
- mobile scouting flow with true offline walk mode
- SGMA export/report flow
- richer irrigation dashboard views from the phase spec
- richer scouting dashboard views from the phase spec
- notification delivery beyond dashboard state

## Phase 3

### Done

- starter compliance/product catalog exists
- application records list/create exists
- REI / PHI / organic-aware summaries exist
- `crew_members`, `labor_entries`, `products`, and related schema exist
- payroll export utility scaffold exists
- QuickBooks service scaffold exists

### Remaining

- crew member CRUD UI/API
- labor entry CRUD UI/API
- mobile clock in / clock out
- payroll calculation workflow and exports
- harvest event workflow
- DPR spray-report export
- organic / CCOF report export
- QuickBooks integration end to end
- labor and H-2A management UX

## Phase 4

### Done

- `degree_day_records` schema exists
- `ai_recommendations` schema exists
- intelligence dashboard is live
- rule-based recommendations from operational data are live
- seasonal ET / degree-day intelligence is live
- recommendation dismiss / act-on flow is live

### Remaining

- asynchronous recommendation generation from workers
- forecast-aware recommendations
- degree-day dashboard page
- advisor API / API keys flow
- AgWorld integration
- harvest handler reconciliation
- SSE fallback / scaling hardening
- performance/materialized-view work
- advanced multi-ranch management views

## Recommended Completion Order Before Higher-Level Phase Work

If the goal is to finish planned phase work first, use this order:

1. Phase 3 labor and crew management MVP
2. Phase 3 harvest and compliance export depth
3. Phase 2 frost / SGMA / scouting and irrigation depth
4. Phase 4 asynchronous intelligence, advisor API, and integrations
5. End-of-Phase-4 deferred hardening:
   - real offline-first mobile DB stack fully in production shape
   - full billing / Stripe workflow verification

## Best Next Thread

The cleanest next thread, if finishing the phase roadmap first, is:

- implement crew member CRUD and first labor entry workflow end to end

That unlocks the currently unused `crew_members` and `labor_entries` tables and starts closing the biggest obvious gap between schema and product.
