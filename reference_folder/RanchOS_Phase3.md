# RanchOS — Phase 3: Compliance, Labor & Records
### Weeks 31–46 | Goal: 50+ growers. Spray records in active use. Labor tracking 100+ crew. Organic compliance auditable. ARR > $300K.

> **Read `RanchOS_Overview.md` first.** All Phase 0–2 features are live and stable.

---

## Phase 3 Task for IDE

```
RANCHOS PHASE 3: Build compliance records (DPR spray logs, organic CCOF records), harvest tracking,
labor management (clock-in/out, CA OT, piece rate), QuickBooks integration.

Existing tables: organizations, profiles, ranches, blocks (with is_organic, apn), block_seasons,
tasks, task_blocks, task_assignments, subscriptions, cimis_stations, et_data,
block_irrigation_config, irrigation_events, frost_alert_config, pest_species, scouting_logs, alert_rules.

## 1. Database Schema Additions

### Migration 020 — Products (with organic support — DPR/CDMS/EPA PPLS fallback)
  CREATE TABLE products (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Source identifiers (try CDMS first; fallback to EPA PPLS or California DPR)
    cdms_id           TEXT UNIQUE,
    epa_reg_number    TEXT,
    cdfa_reg_number   TEXT,
    dpr_product_id    TEXT,            -- CA DPR label database ID (public fallback)
    product_name      TEXT NOT NULL,
    manufacturer      TEXT,
    active_ingredients JSONB,          -- [{name: string, percentage: number}]
    rei_hours         INTEGER,
    phi_days          INTEGER,
    formulation       TEXT,
    applicable_crops  TEXT[],
    target_pests      TEXT[],
    restricted_use    BOOLEAN DEFAULT false,
    -- Organic certification
    is_omri_listed    BOOLEAN DEFAULT false,
    is_cdfa_organic   BOOLEAN DEFAULT false,   -- CDFA organic input approved
    organic_approved_states TEXT[] DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX products_name_idx ON products USING GIN(to_tsvector('english', product_name));
  CREATE INDEX products_organic_idx ON products(is_omri_listed, is_cdfa_organic);

### Migration 021 — Application Records (DPR-compliant, organic-aware)
  CREATE TABLE application_records (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    block_id              UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    task_id               UUID REFERENCES tasks(id),
    record_type           TEXT NOT NULL CHECK (record_type IN ('pesticide','fertilizer','soil_amendment')),
    -- Applicator (required for pesticide DPR records)
    applicator_name       TEXT NOT NULL,
    applicator_license    TEXT,
    -- Product info
    product_id            UUID REFERENCES products(id),
    product_name_manual   TEXT,         -- if not in DB
    epa_reg_number        TEXT,
    rate_per_acre         DECIMAL(10,4),
    rate_unit             TEXT,
    total_product_used    DECIMAL(10,4),
    total_product_unit    TEXT,
    water_volume_gpa      DECIMAL(8,2),
    -- Application conditions (required by DPR)
    applied_date          DATE NOT NULL,
    applied_start_time    TIME,
    applied_end_time      TIME,
    wind_speed_mph        DECIMAL(5,2),
    wind_direction        TEXT,
    temp_f                DECIMAL(5,2),
    -- Target
    target_pest           TEXT,
    target_pest_scouting_log_id UUID REFERENCES scouting_logs(id),
    -- Area
    acres_treated         DECIMAL(10,2) NOT NULL,
    equipment_used        TEXT,
    -- Compliance
    rei_expiry            TIMESTAMPTZ,
    phi_expiry            DATE,
    -- Organic compliance
    is_organic_block      BOOLEAN NOT NULL DEFAULT false,  -- denormalized from block.is_organic at record time
    omri_confirmed        BOOLEAN DEFAULT false,           -- applicator confirms product is OMRI-listed
    certifier_notified    BOOLEAN DEFAULT false,           -- required for some certifiers for restricted materials
    -- Sign-off
    verified_by           UUID REFERENCES profiles(id),
    verified_at           TIMESTAMPTZ,
    notes                 TEXT,
    created_by            UUID NOT NULL REFERENCES profiles(id),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_by            UUID REFERENCES profiles(id)
  );
  CREATE INDEX app_records_org_date_idx ON application_records(org_id, applied_date DESC);
  CREATE INDEX app_records_block_idx ON application_records(block_id);
  CREATE INDEX app_records_rei_idx ON application_records(org_id, rei_expiry) WHERE rei_expiry > NOW();

### Migration 022 — Harvest Events
  CREATE TABLE harvest_events (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    block_id         UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    block_season_id  UUID REFERENCES block_seasons(id),  -- link to season for year-over-year
    harvest_date     DATE NOT NULL,
    harvest_method   TEXT CHECK (harvest_method IN ('mechanical','hand','shake_catch')),
    total_pounds     DECIMAL(12,2),
    total_bins       INTEGER,
    bin_weight_lbs   DECIMAL(8,2) DEFAULT 1000,
    picker_count     INTEGER,
    crew_ids         UUID[] DEFAULT '{}',
    -- Almonds
    hulled_weight_lbs DECIMAL(12,2),
    hull_split_pct   DECIMAL(5,2),
    -- Citrus
    brix             DECIMAL(5,2),
    acid_ratio       DECIMAL(6,3),
    -- Handler/market
    handler_name     TEXT,
    load_ticket      TEXT,
    -- Reconciliation (Phase 4 adds handler_reconciliation table)
    handler_ticket_reconciled BOOLEAN DEFAULT false,
    notes            TEXT,
    created_by       UUID NOT NULL REFERENCES profiles(id),
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );

### Migration 023 — Crew Members (H-2A clearly scoped)
  CREATE TABLE crew_members (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    profile_id  UUID REFERENCES profiles(id),
    full_name   TEXT NOT NULL,
    phone       TEXT,
    employee_id TEXT,
    hire_date   DATE,
    position    TEXT,
    pay_type    TEXT CHECK (pay_type IN ('hourly','piece_rate','salary')),
    hourly_rate DECIMAL(8,2),
    -- H-2A: FOR IDENTIFICATION PURPOSES ONLY
    -- This field indicates the worker is on an H-2A visa.
    -- RanchOS does NOT manage H-2A housing, DOL WH-516 compliance, or AEWR verification.
    -- Consult your H-2A agent or labor contractor for full compliance.
    h2a_worker  BOOLEAN DEFAULT false,
    h2a_disclaimer_acknowledged BOOLEAN DEFAULT false,  -- owner must acknowledge the disclaimer
    active      BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX crew_members_org_idx ON crew_members(org_id, active);

### Migration 024 — Labor Entries
  CREATE TABLE labor_entries (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    crew_member_id     UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
    task_id            UUID REFERENCES tasks(id),
    block_id           UUID REFERENCES blocks(id),
    work_date          DATE NOT NULL,
    clock_in           TIMESTAMPTZ,
    clock_out          TIMESTAMPTZ,
    hours_worked       DECIMAL(5,2),
    clock_in_gps_lat   DECIMAL(10,8),
    clock_in_gps_lng   DECIMAL(11,8),
    clock_out_gps_lat  DECIMAL(10,8),
    clock_out_gps_lng  DECIMAL(11,8),
    -- Piece rate
    piece_rate_type    TEXT CHECK (piece_rate_type IN ('bins','boxes','trees','lbs')),
    piece_rate_quantity DECIMAL(10,2),
    piece_rate_per_unit DECIMAL(8,4),
    -- Calculated
    gross_pay          DECIMAL(10,2),
    -- Approval
    notes              TEXT,
    approved_by        UUID REFERENCES profiles(id),
    approved_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_by         UUID REFERENCES profiles(id)
  );
  CREATE INDEX labor_entries_crew_date_idx ON labor_entries(crew_member_id, work_date DESC);
  CREATE INDEX labor_entries_org_date_idx ON labor_entries(org_id, work_date DESC);

### Migration 025 — Org Integrations
  CREATE TABLE org_integrations (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL CHECK (integration_type IN ('quickbooks','agworld','cdms')),
    access_token     TEXT,
    refresh_token    TEXT,
    token_expires_at TIMESTAMPTZ,
    realm_id         TEXT,   -- QuickBooks company ID
    settings         JSONB DEFAULT '{}',
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );

## 2. Product Database (CDMS Fallback Strategy)

  IMPORTANT: CDMS does NOT have a public API with guaranteed SLAs. Access requires a licensing agreement.
  Contact CDMS (cdms.org) before starting Phase 3.

  FALLBACK PRIORITY (in order):
  1. CDMS API (if licensed) — best coverage, includes REI/PHI for CA
  2. California DPR Label Database (public, free) — https://www.cdpr.ca.gov/docs/label/search.htm
     → Batch download available as CSV/XML. Parse and import monthly.
  3. EPA PPLS (public) — https://iaspub.epa.gov/apex/pesticides/f?p=PPLS:1
     → Less CA-specific but covers all EPA-registered products

  Regardless of source, all products are stored in the products table.
  Monthly sync job in BullMQ: refresh products from whichever source is available.

  Organic products filter: products WHERE is_omri_listed = true OR is_cdfa_organic = true
  When creating an application record for an organic block:
    1. Show only organic-approved products in the search
    2. If user selects a non-organic product: show warning "⚠️ This product is not OMRI-listed.
       Applying it to a certified organic block may jeopardize your certification."
    3. Require `omri_confirmed = true` checkbox before saving

## 3. DPR-Compliant Spray Record PDF Generator

### packages/shared/src/compliance/sprayReport.ts
  Use jsPDF to generate pest_control_report_format matching CA DPR Pesticide Use Report.

  Layout:
  Header: Grower name | Operator name | License number | Report period (start–end date)
  Table columns:
    Date Applied | County | Study Site | Commodity/Site | Pest | Total Acres Planted
    Total Acres Treated | Product Name | EPA Reg # | Amount/Acre | Total Amount Used
    Applicator Name | License # | Start Time | End Time | Temp (°F) | Wind Speed | Wind Direction
  Footer: Grower signature line + date

  ORGANIC VARIANT:
  Add header banner: "ORGANIC OPERATION — CCOF Certified" (or actual certifier name from org settings)
  Add column: "OMRI Listed: YES/NO" and "Certifier Notified: YES/NO"

  Export endpoint: GET /api/v1/compliance/spray-report?start=DATE&end=DATE&block_id=UUID&organic=true
  Returns: PDF binary for download

## 4. CCOF/Organic Certifier Compliance Report

### packages/shared/src/compliance/organicReport.ts
  Generates a summary suitable for organic certification inspections:

  Section 1: Organic Blocks List
    - Block name, APN, acreage, certified since date

  Section 2: All Field Activities on Organic Blocks (date range)
    - Spray applications (product, OMRI status, rate, applicator)
    - Fertilizer applications (product type, rate)
    - Scouting logs (pest, rating, action taken)

  Section 3: Input Verification
    - All products used on organic blocks
    - OMRI listed: YES/NO for each
    - Flag any non-organic applications with RED highlight

  Section 4: Buffer Zone Activities
    - Any spray applications within 300ft of organic block boundaries
    - Calculated using PostGIS: ST_DWithin(block.geometry, organic_block.geometry, 300)

  Export: GET /api/v1/compliance/organic-report?year=2025

## 5. Labor Module — Clock In/Out (Mobile)

### apps/mobile/src/app/labor/clockin.tsx
  Step 1: Manager selects crew member (or crew member auto-selects themselves)
  Step 2: Select today's task from assigned tasks
  Step 3: GPS check — if outside all active block boundaries, show warning (not a block)
  Step 4: Confirm clock-in → POST /api/v1/labor/clock-in

  Clock-out flow:
  Step 1: Show current shift: crew member, start time, task, block
  Step 2: GPS stamp
  Step 3: Auto-calculate hours_worked = (clock_out - clock_in) in decimal hours
  Step 4: If pay_type = 'piece_rate': show quantity input
    "¿Cuántas cajas/bins completó?" / "How many bins/boxes completed?"
    gross_pay = quantity × piece_rate_per_unit
  Step 5: Confirm → PATCH /api/v1/labor/clock-out/:entry_id

  H-2A crew: if h2a_worker = true, show non-intrusive label "H-2A" on clock-in screen.
  No special enforcement — just identification. Manager is responsible for compliance.

## 6. California Agricultural OT Rules (packages/shared/src/utils/payroll.ts)

  IMPORTANT: Apply CA agricultural OT rules per AB 1066 (fully phased in by 2022–2025):
  - Daily OT: > 8 hours/day = 1.5x; > 12 hours/day = 2x
  - Weekly OT: > 40 hours/week = 1.5x (if not already covered by daily OT)

  interface DayEntry { date: string; hoursWorked: number; }

  export function calculateWeeklyPayroll(entries: DayEntry[], hourlyRate: number) {
    let weeklyHours = 0;
    let totalPay = 0;

    for (const day of entries) {
      const h = day.hoursWorked;
      let regularH = 0, otH = 0, dtH = 0;

      if (h <= 8) { regularH = h; }
      else if (h <= 12) { regularH = 8; otH = h - 8; }
      else { regularH = 8; otH = 4; dtH = h - 12; }  // 2× for > 12hrs

      // Weekly OT check
      if (weeklyHours < 40 && weeklyHours + regularH > 40) {
        const spillover = (weeklyHours + regularH) - 40;
        regularH -= spillover;
        otH += spillover;
      } else if (weeklyHours >= 40) {
        otH += regularH;
        regularH = 0;
      }

      weeklyHours += day.hoursWorked;
      totalPay += (regularH * hourlyRate) + (otH * hourlyRate * 1.5) + (dtH * hourlyRate * 2);
    }
    return { totalPay, weeklyHours };
  }

  // Weekly payroll summary export: Excel/CSV via exceljs package
  // Interface: WeeklyPayrollLine { crew_member_name, employee_id, days_worked,
  //   total_hours, regular_hours, overtime_hours, double_time_hours,
  //   piece_rate_pay, hourly_pay, ot_pay, gross_pay }

## 7. QuickBooks Online Integration

  OAuth 2.0 flow:
  1. Settings → "Connect to QuickBooks" → redirect to QB OAuth authorize URL
  2. Callback: GET /api/v1/integrations/quickbooks/callback → save access_token + refresh_token in org_integrations
  3. Weekly BullMQ job pushes:
     a. Payroll summary as Journal Entry
     b. Product purchases as Expenses
     c. Harvest data as custom reports
  
  Token refresh: check token_expires_at before each QB API call, refresh if < 5min remaining.

## 8. Compliance Dashboard (Web — app/(dashboard)/compliance/page.tsx)

  Tabs:
  1. Spray Records
     - Searchable table: filter by date range, block, product, applicator
     - REI countdown: "Re-entry safe in X hours" (red if < 4 hours, yellow if < 24 hours)
     - PHI countdown: "Harvest safe in X days"
     - Organic indicator: green badge on records for organic blocks
     - Export → DPR PDF, Organic PDF (CCOF format)

  2. Fertilizer Records — same table, no applicator license required

  3. REI Calendar — all active REI restrictions on a calendar view
     - Block name, product, REI expiry time
     - Red highlight on blocks with active REI (workers cannot enter)

  4. Annual Summary — total products by active ingredient (for DPR annual report)
     - Acres treated by county (required for DPR reporting by county subdivision)

  5. Organic Records (visible only if org has is_organic blocks)
     - All inputs on organic blocks
     - OMRI verification status
     - Certifier notification log
     - Export → CCOF-format organic system plan input log

  6. SGMA Water Report (from Phase 2)
     - Annual applied water by APN/block
     - Export → CSV for GSA portal submission

  7. H-2A Disclaimer Panel
     - If org has h2a_worker crew members: prominent yellow banner:
       "RanchOS tracks H-2A workers for identification only. Full H-2A compliance
       (housing, DOL WH-516, AEWR wage verification) is your responsibility.
       Contact your H-2A agent or labor attorney."
```

---

## Phase 3 Acceptance Criteria

- [ ] Spray record form collects all DPR-required fields (all 15 table columns checked against CA DPR 2025 format)
- [ ] Product search works via at least one source (CDMS or CA DPR label database or EPA PPLS — documented which)
- [ ] PDF spray report matches DPR format — test must be validated with a licensed PCA or county agent
- [ ] Organic block spray records: non-OMRI products trigger warning before saving
- [ ] `omri_confirmed` boolean must be true to save application on organic block
- [ ] CCOF-format organic report generates with OMRI verification column and buffer zone activities
- [ ] Crew can clock in/out on mobile with GPS confirmation
- [ ] Piece-rate calculation: `gross_pay = quantity × piece_rate_per_unit` — verified correct
- [ ] CA agricultural OT applied correctly (AB 1066): daily 8/12hr thresholds + weekly 40hr threshold
- [ ] OT calculation tested against at least 3 known payroll scenarios from CA DIR
- [ ] Weekly payroll CSV/Excel exports cleanly
- [ ] REI and PHI countdowns accurate to the hour
- [ ] Harvest log captures all required almond AND citrus fields
- [ ] QuickBooks OAuth connects and at least one Journal Entry syncs successfully
- [ ] H-2A disclaimer shown on crew management page when h2a_worker crew members exist
- [ ] All new screens bilingual EN/ES
- [ ] Buffer zone detection (PostGIS ST_DWithin) correctly flags spray applications within 300ft of organic blocks
