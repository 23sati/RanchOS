# RanchOS Production Readiness Sprint Plan

Last updated: 2026-04-11
Workspace: `C:\Users\sati1\Desktop\RanchOS`

This document turns the current RanchOS state into a practical production-readiness plan.

It is written for future development threads so the team can distinguish:

- what must be done before launch
- what should be done before launch
- what can safely wait until after launch

## Assumed Launch Shape

This plan assumes a **web-first production launch** for the strongest current workflows:

- auth and onboarding
- ranch and block mapping
- tasks
- irrigation
- scouting
- compliance
- labor
- harvest
- intelligence
- notifications

This plan does **not** assume that the first production launch promises:

- fully hardened offline-first mobile workflows
- full advanced integrations
- fully mature frost automation

If mobile offline is part of the launch promise, move those items from deferred into the must-have bucket.

## Production-Ready Definition

RanchOS should be considered production-ready only when all of these are true:

1. the launch workflows are complete and stable
2. billing and subscription behavior is verified end to end
3. data integrity is trustworthy under normal and failure conditions
4. workers and live updates behave safely under retries, restarts, and backlog
5. the app is observable in production
6. authorization and security are reviewed
7. a real pilot validates the product with real users and real data

## Launch Buckets

## Must Have Before Launch

These are the real blockers for calling RanchOS production-ready.

### Product Scope and UX

- lock the v1 launch scope in writing
- clearly mark preview or non-launch surfaces
- remove ambiguity around early-stage pages like frost
- confirm exactly which workflows are officially supported in production

### Billing and Commercial Readiness

- fully verify billing / Stripe workflow end to end
- verify trial behavior, activation, renewal, cancellation, and failure states
- verify subscription gating and entitlements

### Data Integrity and Core Reliability

- review DB constraints, indexes, and uniqueness rules
- verify foreign-key and cascade behavior across blocks, tasks, labor, harvest, compliance, intelligence, and notifications
- test duplicate submission paths
- test race conditions on create/update flows
- verify idempotency in worker-triggered writes
- validate import and reconciliation paths against malformed data

### Workers and Async Reliability

- harden notification sender and receipt worker behavior
- harden intelligence worker behavior
- verify retries, restart recovery, timeout behavior, and backlog handling
- add safe handling for stuck jobs and repeated delivery attempts
- verify org-event / SSE live-update behavior under realistic concurrency

### Security and Access Control

- perform an auth and org-authorization review
- verify every sensitive route is org-scoped correctly
- verify session handling and secret management
- add rate limits where needed
- review export/import surfaces for abuse and leakage risks

### Observability and Operations

- centralize production logs
- add error tracking
- add worker/job metrics
- add DB and Redis health metrics
- create alerts for critical failures
- create deployment and rollback runbooks

### Testing and Validation

- run end-to-end QA on supported workflows
- validate launch-critical exports
- test empty states, bad data states, and failure recovery
- run a real pilot with a small group of users before full rollout

## Should Have Before Launch

These are not always hard blockers, but they should be completed if the team wants a safer and smoother first release.

### Product Depth

- tighten the remaining multi-ranch admin/export semantics beyond the current page-level scope switching if portfolio use is expected early
- tighten remaining setup guidance and operational empty states on launch workflows

### UX Polish

- tighten success/error messaging across forms
- improve destructive-action confirmations
- improve loading, retry, and stale-data indicators
- standardize empty states and setup guidance

### Reporting and Admin Depth

- deepen labor and payroll export flow
- improve compliance reporting depth beyond the first DPR export
- add more admin visibility into queue health and system state where useful

### Platform Hardening

- deepen worker/live-update stress hardening beyond the current SSE fallback path
- review query performance and materialized-view needs
- add staging data and QA scripts for repeated validation

## Can Wait Until After Launch

These are good roadmap items, but they should not block a focused web-first production launch.

### Mobile and Offline

- full offline-first mobile DB stack in production shape
- mobile scouting walk mode
- deeper mobile runtime hardening beyond launch-critical surface area

### Advanced Integrations

- advisor API / API keys flow
- AgWorld integration
- QuickBooks end-to-end integration if not required for launch

### Extended Workflow Depth

- mature frost alert workflow
- SGMA export/report flow
- advanced seasonal forecasting layers beyond current intelligence scope
- deeper multi-ranch operations views if not needed by launch users

### Non-Critical Polish

- theme-system expansion
- advanced analytics views
- broader export/reporting catalog

## Recommended Sprint Phases

These sprint phases are arranged to reduce risk in the right order.

## Sprint 0: Launch Scope Lock

Goal:

- decide what RanchOS v1 is and is not

Deliverables:

- written launch scope
- written list of non-launch / preview features
- updated handoff docs aligned to launch scope
- acceptance criteria for "production-ready"

Exit criteria:

- the team agrees on the exact supported workflows
- mobile offline and advanced integrations are explicitly in or out

## Sprint 1: Core Reliability and Data Integrity

Goal:

- make the current web workflows trustworthy

Focus:

- DB constraint and schema review
- duplicate-submission protection
- import/reconciliation validation
- cross-feature consistency checks
- destructive-action safety review

Deliverables:

- data-integrity checklist
- patched validation gaps
- test cases for critical create/update/delete paths
- verified export and reconciliation behavior

Exit criteria:

- core records can be trusted
- common failure paths do not corrupt workflow state

## Sprint 2: Worker, SSE, and Ops Hardening

Goal:

- make background processing and live refresh safe for production

Focus:

- notification workers
- intelligence workers
- retries and idempotency
- stuck-job handling
- Redis and queue visibility
- SSE fallback and scaling hardening

Deliverables:

- queue and worker metrics
- alerting for job failures and backlog
- verified retry/restart behavior
- documented live-update failure modes

Exit criteria:

- worker-driven features remain trustworthy under operational stress
- org-event and live-refresh paths degrade safely

## Sprint 3: Security, Billing, and Access Review

Goal:

- remove the biggest launch-risk gaps

Focus:

- full Stripe and billing verification
- auth/session review
- org-level authorization review
- secret handling and rate limiting

Deliverables:

- billing test matrix
- access-control checklist
- verified entitlement behavior
- documented security findings and fixes

Exit criteria:

- subscription state is trustworthy
- users cannot cross org boundaries
- billing does not break the product promise

## Sprint 4: Observability and Release Readiness

Goal:

- make the app operable in production by a real team

Focus:

- logging
- error tracking
- metrics
- alerts
- staging/prod deployment process
- rollback and incident response

Deliverables:

- production dashboards
- alert rules
- deployment runbook
- rollback runbook
- environment checklist

Exit criteria:

- the team can detect, diagnose, and recover from failures

## Sprint 5: Product Depth and Pre-Launch UX Pass

Goal:

- close the most visible product gaps without expanding scope too broadly

Focus:

- payroll/export depth
- targeted workflow polish on the completed degree-day, irrigation, scouting, labor, and frost surfaces
- clearer status messaging
- setup guidance and empty states

Deliverables:

- payroll/export completion on top of approved labor entries
- key UX polish on launch workflows
- reduced ambiguity in early-stage surfaces

Exit criteria:

- the product feels intentional and coherent for first customers

## Sprint 6: Pilot and Launch Decision

Goal:

- validate the app with real usage before broad release

Focus:

- pilot users
- realistic ranch data
- support issues
- real worker/job load
- export accuracy

Deliverables:

- pilot feedback log
- launch blocker list
- launch/no-launch decision memo

Exit criteria:

- pilot proves that the launch workflows are usable and trustworthy
- remaining blockers are understood and small enough to ship

## Suggested Order Of Actual Work

If the team wants the cleanest path, use this order:

1. Sprint 0
2. Sprint 1
3. Sprint 2
4. Sprint 3
5. Sprint 4
6. Sprint 5
7. Sprint 6

Reason:

- data trust and async reliability should come before polish
- billing and security should be verified before release
- observability should exist before pilot load
- pilot should happen after the team can actually support the system

## Current Recommendation For The Very Next Development Thread

If staying within product-development work while the broader production plan is being prepared, the best next contained product slice is now:

- deepen AgWorld reconciliation UX around the current persisted workspace, mapping, and sync-log flow

But if the team shifts from product depth into launch readiness immediately, the best next thread should instead be:

- perform a production-readiness audit of billing, authz, workers, observability, and critical data flows, then turn the results into actionable tickets

## Simple Go / No-Go Checklist

RanchOS should be **no-go for production** if any of these remain unresolved:

- billing behavior is not verified end to end
- org authorization is not fully reviewed
- worker retries/idempotency are untrusted
- there is no production observability
- no pilot has been run on real workflows

RanchOS can move toward **go for production** when:

- launch scope is locked
- launch workflows are stable
- billing is verified
- security review is complete
- workers are hardened
- alerts and runbooks exist
- pilot feedback is acceptable

## Related Reference Files

- `CURRENT_STATE_2026-04-11.md`
- `RanchOS_Handover_2026-04-05.md`
- `Higher_Phase_Options_2026-04-06.md`
