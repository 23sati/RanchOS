# RanchOS Higher-Phase Options

Last updated: 2026-04-06

This is the current higher-phase menu for RanchOS after the core DB-backed MVP slices and first intelligence pass were completed.

## Recommended Order

1. Asynchronous Intelligence
2. Notification Delivery
3. Forecast-Aware Intelligence
4. Mobile Runtime Hardening

That sequence keeps the product getting smarter without outrunning the data foundation.

## 1. Asynchronous Intelligence

Have workers create and refresh recommendations proactively instead of generating them only when the dashboard loads.

Examples:

- ET worker writes irrigation-pressure recommendations
- degree-day worker writes pest and hull-split timing recommendations
- dedupe / refresh / expiry rules for worker-managed recommendations

## 2. Notification Delivery

Turn important recommendations into actual delivery, not just dashboard state.

Examples:

- in-app notification center
- unread / acknowledged state
- later: email, SMS, or push hooks

## 3. Forecast-Aware Intelligence

Use upcoming weather, not just historical ET and degree days.

Examples:

- near-term irrigation timing
- frost risk windows
- spray timing warnings
- scouting timing suggestions

Recommended posture:

- keep this rules-based first
- do not jump directly to "AI advice" before the forecast and signal plumbing are trustworthy

## 4. Mobile Runtime Hardening

Move the current mobile task slice from source-complete to actually usable on device.

Examples:

- real Expo runtime boot
- real auth/session
- stable sync flows
- completion UX/device validation

## 5. Offline-First Mobile Sync

Make mobile reliable in real field conditions.

Examples:

- local DB models
- pull/push conflict handling
- offline task completion
- resumable sync

## 6. Intelligent Task Automation

Let recommendations create or suggest operational work.

Examples:

- convert recommendation to task
- auto-create recurring irrigation or scouting work
- assign by block or crew rules

## 7. Compliance Reporting

Go beyond record entry into exportable operations and review workflows.

Examples:

- REI / PHI dashboards
- printable or exportable application logs
- certifier-ready organic review packets
- DPR / CDMS-oriented exports later

## 8. Integration Layer

Connect RanchOS to outside systems.

Examples:

- CIMIS hardening first
- then Agworld / CDMS / DPR / accounting / payroll candidates
- import plus reconciliation workflows

## 9. Advanced Spatial Intelligence

Use the map as more than storage.

Examples:

- block heatmaps
- overlap / problem layers
- scouting hotspots
- irrigation / compliance spatial views

## 10. AI-Assisted Recommendations

Only after the rule-based intelligence is trustworthy.

Examples:

- recommendation explanation layer
- anomaly summaries
- block-by-block daily briefing
- human review before action

## Current Best Next Slice

If opening a new thread right now, the best next higher-phase slice is:

- make intelligence asynchronous by having ET and degree-day workers create or refresh recommendation records proactively
