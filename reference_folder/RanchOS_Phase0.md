# RanchOS — Phase 0: Foundation & Validation
### Weeks 1–4 | Goal: Monorepo running, DB schema locked, auth working, i18n architecture set, WatermelonDB spike done, 2 grower LOIs signed.

> **Read `RanchOS_Overview.md` first.** This file assumes the full stack, monorepo structure, and architectural decisions documented there.

---

## Week 1–2 Priority: WatermelonDB Compatibility Spike

Before anything else, run this spike:

```bash
cd apps/mobile
npx expo install @nozbe/watermelondb
npx expo install expo-camera expo-location
npx expo run:android  # Test JSI mode
```

**Test:** Create a simple WatermelonDB model, write a record, read it back. Confirm JSI mode works with your Expo SDK 51 + New Architecture config.

**If JSI fails:** Switch to `@op-engineering/op-sqlite` as the SQLite adapter. The sync logic stays identical — only the adapter changes. Document which you chose at top of `RanchOS_Phase1.md`.

---

## Phase 0 Task for IDE

```
RANCHOS PHASE 0: Set up the complete project foundation.

Stack: Turborepo monorepo, Next.js 14 (web), Hono API (Node.js), Expo SDK 51 (mobile),
PostgreSQL 16 + PostGIS on VPS (via Docker locally), Drizzle ORM, Better Auth,
Cloudflare R2 storage, BullMQ + Redis for background jobs, SSE for realtime.

NO SUPABASE. All infrastructure is self-hosted.

## 1. Monorepo Setup

Initialize Turborepo:
  npx create-turbo@latest ./ --package-manager npm

Apps:
  apps/web   — npx create-next-app@latest web --typescript --tailwind --app --src-dir --import-alias "@/*"
  apps/api   — npm init -y, install hono @hono/node-server
  apps/mobile — npx create-expo-app mobile --template expo-template-blank-typescript

Packages:
  packages/db      — Drizzle schema, migrations, seed
  packages/shared  — TypeScript types, utils, constants
  packages/i18n    — Translation files

## 2. turbo.json

{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^typecheck"] }
  }
}

## 3. Hono API (apps/api)

Install: hono @hono/node-server bullmq ioredis better-auth drizzle-orm pg

apps/api/src/index.ts:
  import { serve } from '@hono/node-server';
  import { Hono } from 'hono';
  import { cors } from 'hono/cors';
  import { logger } from 'hono/logger';

  const app = new Hono();
  app.use('*', cors({ origin: process.env.NEXT_PUBLIC_APP_URL!, credentials: true }));
  app.use('*', logger());
  app.get('/health', (c) => c.json({ status: 'ok' }));

  serve({ fetch: app.fetch, port: 3001 });

## 4. Database Schema (packages/db/src/schema/)

Run migrations with: drizzle-kit migrate

### Migration 001 — Extensions
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS pg_cron;

### Migration 002 — Organizations
  CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    timezone    TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    locale      TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es')),
    primary_crop TEXT CHECK (primary_crop IN ('almond', 'citrus', 'both')),
    -- Organic certification
    has_organic_blocks BOOLEAN DEFAULT false,
    certification_body TEXT CHECK (certification_body IN ('ccof', 'ocia', 'oregon_tilth', 'primus', 'other')),
    certification_number TEXT,
    -- Billing
    stripe_customer_id TEXT UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  );

### Migration 003 — Profiles (Better Auth managed, extended here)
  -- Better Auth creates its own users/sessions/accounts tables via its Drizzle adapter.
  -- This table extends it with app-specific fields.
  CREATE TABLE profiles (
    id              UUID PRIMARY KEY,  -- matches Better Auth user.id
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'crew')),
    preferred_locale TEXT NOT NULL DEFAULT 'en' CHECK (preferred_locale IN ('en', 'es')),
    phone           TEXT,
    avatar_url      TEXT,
    expo_push_token TEXT,   -- for mobile push notifications
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_by      UUID REFERENCES profiles(id)
  );

  CREATE INDEX profiles_org_id_idx ON profiles(org_id);
  CREATE INDEX profiles_role_idx ON profiles(org_id, role);

### Migration 004 — Subscriptions
  CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_subscription_id  TEXT UNIQUE,
    plan                    TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'enterprise')),
    status                  TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
    total_acres             DECIMAL(10,2),
    mobile_seats            INTEGER DEFAULT 5,
    monthly_amount_cents    INTEGER,
    trial_ends_at           TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
  );

## 5. Drizzle Config (packages/db/drizzle.config.ts)

  import type { Config } from 'drizzle-kit';

  export default {
    schema: './src/schema/index.ts',
    out: './src/migrations',
    dialect: 'postgresql',
    dbCredentials: { url: process.env.DATABASE_URL! }
  } satisfies Config;

## 6. Better Auth Setup (packages/db/src/auth.ts)

  import { betterAuth } from 'better-auth';
  import { drizzleAdapter } from 'better-auth/adapters/drizzle';
  import { organization } from 'better-auth/plugins';
  import { db } from './index';

  export const auth = betterAuth({
    database: drizzleAdapter(db, { provider: 'pg' }),
    plugins: [organization()],
    emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: true, maxAge: 86400 * 7 } },
    trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL!]
  });

  // Mount in Hono API:
  // app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));

  // Mount in Next.js:
  // app/api/auth/[...all]/route.ts → export { GET, POST } from better-auth/next

## 7. i18n Architecture (packages/i18n)

Install: i18next react-i18next i18next-resources-to-backend

packages/i18n/locales/en/common.json:
  {
    "app_name": "RanchOS",
    "nav": {
      "dashboard": "Dashboard", "blocks": "Blocks", "tasks": "Tasks",
      "irrigation": "Irrigation", "scouting": "Scouting", "records": "Records",
      "labor": "Labor", "compliance": "Compliance", "settings": "Settings"
    },
    "actions": { "save": "Save", "cancel": "Cancel", "delete": "Delete", "edit": "Edit",
      "add": "Add", "submit": "Submit", "back": "Back", "next": "Next", "done": "Done", "search": "Search" },
    "status": { "pending": "Pending", "in_progress": "In Progress", "completed": "Completed", "overdue": "Overdue" },
    "sync": { "syncing": "Syncing...", "synced": "Synced", "offline": "Offline — changes saved locally" },
    "organic": { "badge": "Organic", "warning": "This block is certified organic. Only OMRI-listed inputs are permitted." }
  }

packages/i18n/locales/es/common.json:
  {
    "app_name": "RanchOS",
    "nav": {
      "dashboard": "Panel Principal", "blocks": "Bloques", "tasks": "Tareas",
      "irrigation": "Riego", "scouting": "Monitoreo", "records": "Registros",
      "labor": "Labor", "compliance": "Cumplimiento", "settings": "Configuración"
    },
    "actions": { "save": "Guardar", "cancel": "Cancelar", "delete": "Eliminar", "edit": "Editar",
      "add": "Agregar", "submit": "Enviar", "back": "Regresar", "next": "Siguiente", "done": "Listo", "search": "Buscar" },
    "status": { "pending": "Pendiente", "in_progress": "En Progreso", "completed": "Completado", "overdue": "Vencido" },
    "sync": { "syncing": "Sincronizando...", "synced": "Sincronizado", "offline": "Sin conexión — cambios guardados localmente" },
    "organic": { "badge": "Orgánico", "warning": "Este bloque es certificado orgánico. Solo se permiten insumos aprobados por OMRI." }
  }

## 8. BullMQ Worker Setup (apps/api/src/workers/index.ts)

  import { Worker } from 'bullmq';
  import { redis } from '../lib/redis';

  // All background jobs run as BullMQ workers
  export const cimisSyncWorker = new Worker('cimis-sync', async (job) => {
    // Implemented in Phase 2
  }, { connection: redis });

  export const alertWorker = new Worker('check-alerts', async (job) => {
    // Implemented in Phase 2
  }, { connection: redis });

  export const frostAlertWorker = new Worker('frost-check', async (job) => {
    // Implemented in Phase 2 — runs every 30min for citrus orgs
  }, { connection: redis });

  // Schedule recurring jobs on startup:
  import { Queue } from 'bullmq';
  const cimisSyncQueue = new Queue('cimis-sync', { connection: redis });
  await cimisSyncQueue.add('nightly', {}, { repeat: { cron: '0 6 * * *' } }); // 6 AM PT

## 9. GitHub Actions CI (.github/workflows/ci.yml)

  name: CI
  on: [push, pull_request]
  jobs:
    ci:
      runs-on: ubuntu-latest
      services:
        postgres:
          image: postgis/postgis:16-3.4
          env: { POSTGRES_DB: ranchos_test, POSTGRES_USER: ranchos, POSTGRES_PASSWORD: test }
          ports: ['5432:5432']
        redis:
          image: redis:7-alpine
          ports: ['6379:6379']
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '20', cache: 'npm' }
        - run: npm ci
        - run: npm run typecheck
        - run: npm run lint
        - run: npm run db:migrate
          env: { DATABASE_URL: postgresql://ranchos:test@localhost:5432/ranchos_test }
        - run: npm run build
```

---

## Phase 0 Acceptance Criteria

- [ ] `npm run dev` starts web (localhost:3000), api (localhost:3001), and mobile
- [ ] Docker Compose starts Postgres + PostGIS + Redis cleanly
- [ ] TypeScript compiles with zero errors across all workspaces
- [ ] Better Auth sign-up creates a user and a profile row with correct org_id and role
- [ ] Org isolation tested: user A's org_id cannot be accessed by user B's session
- [ ] i18n loads correctly in EN and ES — switching locale reflects all nav strings
- [ ] WatermelonDB compatibility spike RESULT DOCUMENTED in Phase 1 file header
- [ ] GitHub Actions CI passes (runs migrations against test DB)
- [ ] Vercel preview deployment works on PR (web only)
- [ ] 2 grower LOIs signed before proceeding to Phase 1

---

## Pre-Phase 1 Grower Validation Checklist

Before writing a single line of Phase 1 code, complete these:

1. **5 grower interviews** — Fresno/Tulare/Kings/Kern county almond or citrus operations, 20–500 acres
2. **2 signed LOIs** ($149–$299/mo commitment, waived for beta period)
3. **Polygon-draw test** — Show 2 growers a satellite map and ask them to draw their block boundary. If either struggles, add "import from shapefile / APN parcel lookup" as a fallback to Phase 1 scope.
4. **Spray record PCA interview** — Talk to one licensed PCA. Understand who fills out spray records in their workflow.
5. **Organic interview** — Talk to one CCOF-certified grower. What does their certifier ask for at inspection?
