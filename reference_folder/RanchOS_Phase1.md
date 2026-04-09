# RanchOS — Phase 1: MVP Core — Blocks, Tasks & Mobile
### Weeks 5–16 | Goal: First paying beta customers. Field crew completing tasks on mobile daily. Offline sync working. MRR ≥ $1,000.

> **Read `RanchOS_Overview.md` and `RanchOS_Phase0.md` first.**
> **WatermelonDB adapter used:** [FILL IN AFTER PHASE 0 SPIKE — either `@nozbe/watermelondb` or `@op-engineering/op-sqlite`]

---

## Phase 1 Task for IDE

```
RANCHOS PHASE 1: Build the MVP — Block management, Task system, Mobile crew app, Owner dashboard, Billing.

Phase 0 infrastructure is in place: Turborepo monorepo, Postgres + PostGIS on VPS,
Drizzle ORM, Better Auth, Cloudflare R2, BullMQ + Redis, SSE realtime, i18n.

## 1. Database Schema Additions

### Migration 005 — Ranches
  CREATE TABLE ranches (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    county     TEXT CHECK (county IN ('Fresno','Tulare','Kings','Kern','Madera','Merced','San Joaquin','San Bernardino','Riverside','Ventura')),
    address    TEXT,
    gps_lat    DECIMAL(10,8),
    gps_lng    DECIMAL(11,8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX ranches_org_id_idx ON ranches(org_id);

### Migration 006 — Blocks (core farm unit — includes organic and SGMA fields)
  CREATE TABLE blocks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ranch_id        UUID NOT NULL REFERENCES ranches(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    crop_type       TEXT NOT NULL CHECK (crop_type IN ('almond','navel_orange','valencia_orange','lemon','mandarin','grapefruit')),
    variety         TEXT NOT NULL,
    acreage         DECIMAL(10,2),
    tree_count      INTEGER,
    year_planted    INTEGER,
    rootstock       TEXT,
    irrigation_type TEXT CHECK (irrigation_type IN ('drip','micro_spray','flood','overhead')),
    geometry        GEOGRAPHY(POLYGON, 4326),
    -- Organic certification
    is_organic      BOOLEAN NOT NULL DEFAULT false,
    organic_since   DATE,
    -- SGMA / Water reporting
    apn             TEXT,   -- Assessor Parcel Number e.g. "019-020-010"
    water_district  TEXT,
    gsa_name        TEXT,   -- Groundwater Sustainability Agency name
    notes           TEXT,
    active          BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_by      UUID REFERENCES profiles(id)
  );
  CREATE INDEX blocks_org_id_idx ON blocks(org_id);
  CREATE INDEX blocks_ranch_id_idx ON blocks(ranch_id);
  CREATE INDEX blocks_geometry_idx ON blocks USING GIST(geometry);
  CREATE INDEX blocks_is_organic_idx ON blocks(org_id, is_organic);

### Migration 007 — Block Seasons (year-over-year tracking)
  CREATE TABLE block_seasons (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    block_id         UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    season_year      INTEGER NOT NULL,
    bloom_date       DATE,
    hull_split_start DATE,   -- almonds: when hull split begins
    harvest_start    DATE,
    harvest_end      DATE,
    total_yield_lbs  DECIMAL(12,2),
    yield_per_acre   DECIMAL(8,2),  -- auto-calculated on harvest_end
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(block_id, season_year)
  );

### Migration 008 — Task Types (org-configurable, system defaults seeded)
  CREATE TABLE task_types (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id     UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = system default
    name_en    TEXT NOT NULL,
    name_es    TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6B7280',
    icon       TEXT,
    is_system  BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  INSERT INTO task_types (name_en, name_es, color, is_system) VALUES
    ('Irrigate', 'Regar', '#3B82F6', true),
    ('Spray', 'Aplicar Pesticida', '#EF4444', true),
    ('Fertilize', 'Fertilizar', '#10B981', true),
    ('Scout', 'Monitorear', '#F59E0B', true),
    ('Prune', 'Podar', '#8B5CF6', true),
    ('Disc', 'Pasar Rastra', '#6B7280', true),
    ('Mow', 'Cortar Hierba', '#84CC16', true),
    ('Harvest', 'Cosechar', '#F97316', true),
    ('Repair', 'Reparación', '#78716C', true),
    ('Frost Protection', 'Protección de Heladas', '#06B6D4', true);
    -- NOTE: Frost Protection here is a manually-assigned task type.
    -- Automated frost ALERTS are handled by the FrostAlertWorker (Phase 2).

### Migration 009 — Tasks (no UUID arrays — uses junction tables)
  CREATE TABLE tasks (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    task_type_id          UUID NOT NULL REFERENCES task_types(id),
    title                 TEXT NOT NULL,
    description           TEXT,
    due_date              DATE NOT NULL,
    status                TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','in_progress','completed','overdue')),
    priority              TEXT NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('low','normal','high','urgent')),
    created_by            UUID NOT NULL REFERENCES profiles(id),
    completed_at          TIMESTAMPTZ,
    completed_by          UUID REFERENCES profiles(id),
    completion_notes      TEXT,
    completion_photo_urls TEXT[] DEFAULT '{}',
    completion_gps_lat    DECIMAL(10,8),
    completion_gps_lng    DECIMAL(11,8),
    -- Conflict resolution support
    last_sync_at          TIMESTAMPTZ,   -- when last synced from mobile
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_by            UUID REFERENCES profiles(id)
  );
  CREATE INDEX tasks_org_id_status_idx ON tasks(org_id, status);
  CREATE INDEX tasks_due_date_idx ON tasks(org_id, due_date);

### Migration 010 — Task Blocks (junction — replaces block_ids UUID[])
  CREATE TABLE task_blocks (
    task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, block_id)
  );
  CREATE INDEX task_blocks_block_id_idx ON task_blocks(block_id);

### Migration 011 — Task Assignments (junction — replaces assigned_to UUID[])
  CREATE TABLE task_assignments (
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (task_id, profile_id)
  );
  CREATE INDEX task_assignments_profile_id_idx ON task_assignments(profile_id);

## 2. Web App File Structure (apps/web/src)

  app/
  ├── (auth)/
  │   ├── login/page.tsx
  │   ├── signup/page.tsx
  │   └── onboarding/
  │       ├── page.tsx          # Multi-step: org → ranch → first block
  │       └── steps/
  │           ├── CreateOrg.tsx
  │           ├── AddRanch.tsx
  │           └── AddBlocks.tsx
  ├── (dashboard)/
  │   ├── layout.tsx            # Sidebar nav, auth guard, locale provider
  │   ├── page.tsx              # Owner dashboard home
  │   ├── blocks/
  │   │   ├── page.tsx          # Block list + map view (toggle)
  │   │   ├── [id]/page.tsx     # Block detail + season history
  │   │   └── new/page.tsx      # Create block with map draw or manual entry
  │   ├── tasks/
  │   │   ├── page.tsx          # Kanban board by status
  │   │   ├── [id]/page.tsx     # Task detail + assignments + photos
  │   │   └── new/page.tsx      # Create task with block + crew picker
  │   └── settings/
  │       ├── page.tsx
  │       ├── team/page.tsx
  │       └── billing/page.tsx
  ├── api/
  │   ├── auth/[...all]/route.ts   # Better Auth handler
  │   └── webhooks/stripe/route.ts
  └── layout.tsx

  components/
  ├── ui/                       # Button, Input, Select, Badge, Dialog, Toast
  ├── map/
  │   ├── BlockMap.tsx          # Mapbox satellite + GeoJSON polygons
  │   ├── BlockDrawTool.tsx     # @mapbox/mapbox-gl-draw polygon tool
  │   └── BlockPopup.tsx        # Click popup — name, variety, acreage, organic badge, open tasks
  ├── blocks/
  │   ├── BlockCard.tsx         # Shows organic badge if is_organic=true
  │   ├── BlockForm.tsx         # Includes is_organic toggle, APN field, organic_since date
  │   └── BlockList.tsx
  ├── tasks/
  │   ├── TaskCard.tsx
  │   ├── TaskForm.tsx          # Block multi-select + crew multi-assign (from junction tables)
  │   ├── TaskKanban.tsx
  │   └── TaskStatusBadge.tsx
  ├── dashboard/
  │   ├── WeatherWidget.tsx     # Open-Meteo API (free, no key)
  │   ├── ActiveTasksSummary.tsx
  │   ├── BlockStatusMap.tsx
  │   └── ActivityFeed.tsx      # SSE-powered live feed
  └── layout/
      ├── Sidebar.tsx
      ├── TopBar.tsx
      └── LocaleSwitcher.tsx

  lib/
  ├── auth/
  │   ├── client.ts             # Better Auth browser client
  │   └── server.ts             # Better Auth server helpers
  ├── db/
  │   └── client.ts             # Drizzle + postgres connection (server only)
  ├── api/
  │   └── client.ts             # fetch wrapper to Hono API (port 3001)
  └── utils/
      ├── area.ts               # turf.js area() for polygon acreage
      └── formatters.ts

## 3. Key Components

### BlockMap.tsx
  - Mapbox GL JS satellite base map
  - Load block polygons from /api/v1/blocks?ranch_id=X as GeoJSON FeatureCollection
  - Color blocks: almond = amber (#F59E0B), citrus = orange (#FB923C)
  - Organic blocks get a green dashed border overlay
  - Show active tasks as colored pins at block centroid
  - Click block → BlockPopup with name, variety, acreage, organic badge (if is_organic), open task count
  - "Draw Block" button activates @mapbox/mapbox-gl-draw polygon mode
  - On polygon complete: calculate acreage via turf.area(), open BlockForm modal pre-filled
  - FALLBACK: "Enter manually / Import shapefile" link for growers who won't draw

### TaskKanban.tsx
  - Four columns: Pending | In Progress | Completed | Overdue
  - Each TaskCard: task type icon+color, title, blocks affected, assigned crew avatars, due date
  - Drag between columns updates status via PATCH /api/v1/tasks/:id
  - Publish SSE event on status change so other dashboard users see it live
  - Filter bar: by ranch, by block, by assigned user, by task type, by organic/conventional

### ActivityFeed.tsx (SSE-powered)
  const source = new EventSource(`${API_URL}/api/v1/events/${orgId}`, { withCredentials: true });
  source.addEventListener('update', (e) => {
    const event = JSON.parse(e.data);
    // Prepend to activity list — task_completed, task_created, etc.
  });

### Owner Dashboard (app/(dashboard)/page.tsx)
  - Weather from Open-Meteo (free): fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=America/Los_Angeles`)
  - Active tasks count with urgency breakdown
  - BlockStatusMap mini-map (non-interactive)
  - ActivityFeed component (last 20 events via SSE)

## 4. Hono API Routes (apps/api/src/routes/)

  /api/v1/
  ├── blocks/
  │   ├── GET    /          → list blocks for org (with ranch filter)
  │   ├── POST   /          → create block (validates geometry, calculates acreage)
  │   ├── GET    /:id       → block detail + season data
  │   ├── PATCH  /:id       → update block
  │   └── DELETE /:id       → soft delete (active = false)
  ├── tasks/
  │   ├── GET    /          → list tasks (filter by status, block, assignee)
  │   ├── POST   /          → create task + insert task_blocks + task_assignments rows
  │   ├── GET    /:id       → task detail (with blocks and assignees joined)
  │   ├── PATCH  /:id       → update task (publishes SSE event on status change)
  │   └── DELETE /:id       → delete task
  ├── sync/
  │   ├── POST   /pull      → WatermelonDB pull changes endpoint
  │   └── POST   /push      → WatermelonDB push changes endpoint (with conflict resolution)
  └── events/:orgId         → SSE stream

## 5. Offline Sync Architecture (WatermelonDB)

### WatermelonDB Schema (apps/mobile/src/lib/watermelon/schema.ts)
  import { appSchema, tableSchema } from '@nozbe/watermelondb';
  export const schema = appSchema({
    version: 1,
    tables: [
      tableSchema({
        name: 'tasks',
        columns: [
          { name: 'server_id', type: 'string', isOptional: true },
          { name: 'org_id', type: 'string' },
          { name: 'title', type: 'string' },
          { name: 'status', type: 'string' },
          { name: 'priority', type: 'string' },
          { name: 'due_date', type: 'number' },
          { name: 'completion_notes', type: 'string', isOptional: true },
          { name: 'completion_photo_urls', type: 'string', isOptional: true }, // JSON array
          { name: 'completion_gps_lat', type: 'number', isOptional: true },
          { name: 'completion_gps_lng', type: 'number', isOptional: true },
          { name: 'completed_at', type: 'number', isOptional: true },
          { name: 'task_type_color', type: 'string' },
          { name: 'task_type_name_es', type: 'string' },
          { name: 'block_names_es', type: 'string', isOptional: true }, // JSON array
          { name: 'updated_at', type: 'number' },
        ]
      }),
      tableSchema({
        name: 'blocks',
        columns: [
          { name: 'server_id', type: 'string', isOptional: true },
          { name: 'org_id', type: 'string' },
          { name: 'name', type: 'string' },
          { name: 'crop_type', type: 'string' },
          { name: 'is_organic', type: 'boolean' },
          { name: 'geometry_json', type: 'string', isOptional: true },
        ]
      })
    ]
  });

### Custom Sync API Endpoint (apps/api/src/routes/sync.ts)

  // PULL: return changes since last_pulled_at, filtered to crew member's assigned tasks
  app.post('/api/v1/sync/pull', orgScopeMiddleware, async (c) => {
    const { last_pulled_at, profile_id } = await c.req.json();
    const orgId = c.get('orgId');
    const since = last_pulled_at ? new Date(last_pulled_at) : new Date(0);

    const tasks = await db.select().from(tasksTable)
      .innerJoin(taskAssignmentsTable, eq(taskAssignmentsTable.taskId, tasksTable.id))
      .where(and(eq(tasksTable.orgId, orgId), eq(taskAssignmentsTable.profileId, profile_id), gt(tasksTable.updatedAt, since)));

    return c.json({ changes: { tasks: { created: [], updated: tasks, deleted: [] } }, timestamp: Date.now() });
  });

  // PUSH: apply local changes with conflict resolution
  app.post('/api/v1/sync/push', orgScopeMiddleware, async (c) => {
    const { changes } = await c.req.json();
    const orgId = c.get('orgId');

    if (changes.tasks?.updated) {
      for (const localTask of changes.tasks.updated) {
        const serverTask = await db.query.tasks.findFirst({ where: eq(tasks.id, localTask.server_id) });

        // CONFLICT RESOLUTION POLICY:
        // 1. Status: monotonic — only move "forward" (pending → in_progress → completed)
        const STATUS_ORDER = { pending: 0, in_progress: 1, completed: 2, overdue: 3 };
        const newStatus = STATUS_ORDER[localTask.status] >= STATUS_ORDER[serverTask.status]
          ? localTask.status : serverTask.status;

        // 2. Photos: merge arrays — never discard photos from either side
        const mergedPhotos = [...new Set([...(serverTask.completionPhotoUrls || []), ...JSON.parse(localTask.completion_photo_urls || '[]')])];

        await db.update(tasks).set({
          status: newStatus,
          completionNotes: localTask.completion_notes || serverTask.completionNotes,
          completionPhotoUrls: mergedPhotos,
          completionGpsLat: localTask.completion_gps_lat ?? serverTask.completionGpsLat,
          completionGpsLng: localTask.completion_gps_lng ?? serverTask.completionGpsLng,
          completedAt: newStatus === 'completed' ? (serverTask.completedAt || new Date()) : null,
          updatedAt: new Date(),
          lastSyncAt: new Date()
        }).where(and(eq(tasks.id, localTask.server_id), eq(tasks.orgId, orgId)));

        // Publish SSE update
        await redis.publish(`org:${orgId}`, JSON.stringify({ type: 'task_synced', id: localTask.server_id }));
      }
    }
    return c.json({ success: true });
  });

### Mobile Sync Call (apps/mobile/src/lib/watermelon/sync.ts)
  import { synchronize } from '@nozbe/watermelondb/sync';

  export async function syncDatabase(database, profileId: string, authToken: string) {
    await synchronize({
      database,
      pullChanges: async ({ lastPulledAt }) => {
        const res = await fetch(`${API_URL}/api/v1/sync/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ last_pulled_at: lastPulledAt, profile_id: profileId })
        });
        return res.json();
      },
      pushChanges: async ({ changes }) => {
        await fetch(`${API_URL}/api/v1/sync/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ changes })
        });
      }
    });
  }

  // Trigger sync on: app foreground, network reconnect (NetInfo), after completing a task

## 6. Mobile App File Structure (apps/mobile/src)

  app/
  ├── (auth)/
  │   ├── index.tsx           # Login screen — email/password via Better Auth
  │   └── signup.tsx
  ├── (tabs)/
  │   ├── _layout.tsx         # Bottom tab navigator
  │   ├── index.tsx           # My tasks feed (crew home — filtered to assigned tasks)
  │   ├── map.tsx             # Block map (react-native-maps)
  │   └── profile.tsx
  └── tasks/
      ├── [id].tsx            # Task detail
      └── complete.tsx        # Task completion flow

  components/
  ├── TaskListItem.tsx        # Shows task in crew's preferred locale
  ├── TaskCompleteForm.tsx    # Steps: photo → GPS → notes → confirm
  ├── SyncIndicator.tsx       # Offline/syncing status banner
  └── OrganicWarning.tsx      # "This is an organic block — use only OMRI-listed products"

## 7. Task Completion Flow (Mobile — highest priority crew UX)

### apps/mobile/src/app/tasks/complete.tsx
  Step 1: Show task details in crew's preferred_locale
          - Block name in Spanish: block.name (stored in DB language-agnostically)
          - Task type label: task.task_type_name_es (denormalized into WatermelonDB for offline use)
          - If block.is_organic → show OrganicWarning component
  Step 2: Camera — take photo (expo-camera)
          - Upload to R2: PUT /api/v1/upload/task-completion
          - Key pattern: orgs/{org_id}/tasks/{task_id}/completion_{timestamp}.jpg
          - Store public R2 URL in local WatermelonDB record
  Step 3: GPS stamp — expo-location getCurrentPositionAsync()
          - If GPS point outside block polygon (offline GeoJSON check via turf.booleanPointInPolygon):
            Show warning: "Parece que estás fuera de este bloque" / "You appear to be outside this block"
  Step 4: Notes — optional text (bilingual placeholder)
  Step 5: Confirm
          - If online: call PATCH /api/v1/tasks/:id directly + sync
          - If offline: write to WatermelonDB with status='completed', queue for next sync

## 8. Stripe Billing Integration

### Webhook Handler (apps/api/src/routes/webhooks/stripe.ts)
  Handle:
  - customer.subscription.created → set status = 'active'
  - customer.subscription.updated → update plan + monthly_amount_cents + total_acres
  - customer.subscription.deleted → set status = 'canceled'
  - invoice.payment_failed → set status = 'past_due', send push notification to owner

### Dynamic Price Calculation
  Use calculateMonthlyPrice() from packages/shared/src/constants/pricing.ts
  On billing page: show real-time price preview as grower changes their acre count.
  Create Stripe usage-based metering line item for mobile seats above included amount.

## 9. Onboarding Wizard (target: < 10 minutes)

  Step 1 — Organization:
    - Ranch/company name
    - Primary county (dropdown: Fresno, Tulare, Kings, Kern, Madera, Merced, San Joaquin)
    - Preferred language (English / Spanish)
    - Primary crop (Almond / Citrus / Both)
    - Has organic blocks? (toggle) → if yes, show certification_body dropdown + number field

  Step 2 — First Ranch:
    - Ranch name, street address or GPS coordinates
    - Total approximate acreage (used for billing estimate preview)

  Step 3 — First Block (or skip):
    - Show satellite map centered on ranch address
    - PREFERRED: Draw polygon with @mapbox/mapbox-gl-draw
    - FALLBACK: "Enter manually" form OR "I'll import later"
    - Set variety, irrigation type, is_organic, APN

  Post-onboarding:
    - Show 14-day trial banner
    - Prompt: "Invite your first crew member" → email invite flow
    - Show pricing calculator with their acre count pre-filled
```

---

## Phase 1 Acceptance Criteria

- [ ] Owner can create blocks by drawing on satellite map; acreage auto-calculates (turf.js)
- [ ] Fallback manual block entry works without map
- [ ] Organic blocks show green dashed border on map and "Organic" badge in BlockCard
- [ ] `is_organic` and `apn` fields present on all block forms
- [ ] Tasks use junction tables — `task_blocks` + `task_assignments` — no UUID arrays
- [ ] Manager creates task assigned to 3 blocks + 2 crew members — joins work correctly
- [ ] Crew logs in on mobile, sees assigned tasks in Spanish
- [ ] Crew completes task with photo + GPS — works fully offline
- [ ] Status conflict resolved correctly: server-side `completed` not overwritten by mobile `in_progress` sync
- [ ] Photos are merged (not replaced) when both mobile and web add photos to same task
- [ ] Completed tasks sync to server when connectivity returns
- [ ] SSE: completing a task on mobile triggers live update in web dashboard ActivityFeed
- [ ] Owner dashboard shows weather, active tasks, and live activity feed
- [ ] Stripe checkout works with dynamic acre-based pricing calculation
- [ ] Onboarding wizard completes in under 10 minutes (test with a non-technical grower)
- [ ] All UI strings render correctly in EN and ES
- [ ] API security: user A's JWT cannot access user B's org data (automated test)
- [ ] `block_seasons` row auto-created for current year when first block is created
