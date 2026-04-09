# RanchOS — Project Overview & Cross-Phase Reference
### Bilingual Orchard Operations Platform for California Almond & Citrus Growers

> **How to use:** Read this file before starting any phase. It defines the full stack, monorepo structure, shared types, environment config, and cross-phase standards that every phase builds on. Each phase file is self-contained but assumes this document is understood.

---

## Product

**RanchOS** — a bilingual (ES/EN) SaaS platform for owner-operators, ranch managers, and field crews managing 20–500 acre almond and citrus operations in California. Supports both organic and conventional operations.

**Core users:**
- Owner-operators (web dashboard, English-primary)
- Ranch managers (web + mobile, bilingual)
- Field crew (mobile-only, Spanish-primary, offline-first)

---

## Tech Stack (Fixed for All Phases)

| Layer | Technology | Notes |
|---|---|---|
| Monorepo | Turborepo | All apps and packages in one repo |
| Web | Next.js 14 (App Router), TypeScript, Tailwind CSS | Vercel deployment |
| Mobile | Expo SDK 51, React Native, TypeScript | EAS Build |
| Backend API | **Hono** on Node.js 20 | Separate service, port 3001. Handles sync endpoint, background workers, webhooks |
| Database | **PostgreSQL 16 + PostGIS** on VPS | Self-hosted, no Supabase |
| ORM | **Drizzle ORM** + drizzle-kit | Type-safe, migrations via `drizzle-kit push` |
| Auth | **Better Auth** | Multi-tenant, TypeScript-native, Drizzle adapter |
| File Storage | **Cloudflare R2** | S3-compatible, cheap egress. Use `@aws-sdk/client-s3` with R2 endpoint |
| Realtime (web) | **Server-Sent Events (SSE)** | Native EventSource in browser, Hono SSE handler |
| Background Jobs | **BullMQ + Redis** | Nightly CIMIS sync, alerts, degree-days, payroll |
| DB-level Jobs | **pg_cron** | Installed on Postgres VPS, triggers BullMQ jobs via NOTIFY |
| Maps (web) | Mapbox GL JS + react-map-gl | Satellite base, polygon draw via @mapbox/mapbox-gl-draw |
| Maps (mobile) | react-native-maps | |
| Offline sync | WatermelonDB | SQLite on device, custom `/api/v1/sync` endpoint (not Supabase protocol) |
| i18n | i18next + react-i18next | Shared translation files in `packages/i18n` |
| Payments | Stripe | Linear acre-based pricing, no hard tier ceilings |
| Push notifications | Expo Push Notifications | Via Expo Notifications service |
| CI/CD | GitHub Actions + Vercel (web) + EAS Build (mobile) | |
| VPS deployment | Docker Compose | Postgres, PostGIS, Redis, Hono API as containers |

---

## Monorepo Structure

```
ranchos/
├── apps/
│   ├── web/                    # Next.js 14 App Router
│   ├── api/                    # Hono Node.js API server
│   └── mobile/                 # Expo SDK 51
├── packages/
│   ├── db/                     # Drizzle schema + queries (shared by web + api)
│   │   ├── src/
│   │   │   ├── schema/         # All Drizzle table definitions
│   │   │   ├── queries/        # Shared query functions
│   │   │   └── migrations/     # Drizzle-kit generated migrations
│   │   └── package.json
│   ├── shared/                 # TypeScript types, utils, constants
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── utils/
│   │   │   └── constants/
│   │   └── package.json
│   └── i18n/                   # Translation files
│       ├── locales/
│       │   ├── en/             # common.json, tasks.json, blocks.json, irrigation.json, auth.json
│       │   └── es/             # same files in Spanish
│       └── index.ts
├── docker-compose.yml          # Local dev: Postgres + PostGIS + Redis
├── turbo.json
├── package.json
└── .env.example
```

---

## Root package.json

```json
{
  "name": "ranchos",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "db:generate": "drizzle-kit generate --config=packages/db/drizzle.config.ts",
    "db:migrate": "drizzle-kit migrate --config=packages/db/drizzle.config.ts",
    "db:seed": "tsx packages/db/src/seed.ts"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "eslint": "^8.57.0"
  }
}
```

---

## Docker Compose (Local Dev)

```yaml
# docker-compose.yml
version: '3.9'
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: ranchos
      POSTGRES_USER: ranchos
      POSTGRES_PASSWORD: ranchos_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

---

## Environment Variables (.env.example)

```bash
# Database (VPS Postgres)
DATABASE_URL=postgresql://ranchos:password@localhost:5432/ranchos

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379

# Auth (Better Auth)
BETTER_AUTH_SECRET=                  # 32+ char random string
BETTER_AUTH_URL=http://localhost:3000

# Cloudflare R2 Storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=ranchos
R2_PUBLIC_URL=                       # e.g. https://pub.r2.dev/ranchos

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_GROWTH_PRICE_ID=
STRIPE_ENTERPRISE_PRICE_ID=

# CIMIS (free from CDFA)
CIMIS_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
API_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## Auth Architecture (Better Auth)

Better Auth replaces Supabase Auth. It provides:
- Email/password sessions with secure httpOnly cookies
- Organization (multi-tenant) plugin built-in
- Drizzle ORM adapter
- TypeScript-native client and server utilities

```typescript
// packages/db/src/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db } from './index';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  plugins: [organization()],
  emailAndPassword: { enabled: true },
  session: {
    cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 7 } // 7 days
  }
});
```

**Org-isolation middleware (Hono):** Every API route passes through this:
```typescript
// apps/api/src/middleware/orgScope.ts
export const orgScopeMiddleware = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user.id);
  c.set('orgId', session.session.activeOrganizationId);
  await next();
};
// All DB queries in handlers MUST filter by c.get('orgId') — this is your RLS replacement.
```

---

## File Storage (Cloudflare R2)

```typescript
// packages/shared/src/storage.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function uploadFile(key: string, body: Buffer, contentType: string) {
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType }));
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
```

---

## SSE Realtime (Web)

Instead of Supabase Realtime, use Server-Sent Events from the Hono API:

```typescript
// apps/api/src/routes/sse.ts
import { streamSSE } from 'hono/streaming';

app.get('/api/v1/events/:orgId', orgScopeMiddleware, async (c) => {
  const orgId = c.req.param('orgId');
  return streamSSE(c, async (stream) => {
    // Subscribe to Redis pub/sub for this org's events
    const sub = redis.duplicate();
    await sub.subscribe(`org:${orgId}`);
    sub.on('message', async (_, message) => {
      await stream.writeSSE({ data: message, event: 'update' });
    });
    // Cleanup on disconnect
    c.req.raw.signal.addEventListener('abort', () => sub.unsubscribe());
  });
});

// Publishing events from any API handler:
await redis.publish(`org:${orgId}`, JSON.stringify({ type: 'task_updated', id: taskId }));
```

---

## Shared Types (packages/shared/src/types/index.ts)

```typescript
export type UserRole = 'owner' | 'manager' | 'crew';
export type Locale = 'en' | 'es';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
export type CropType = 'almond' | 'navel_orange' | 'valencia_orange' | 'lemon' | 'mandarin' | 'grapefruit';
export type IrrigationType = 'drip' | 'micro_spray' | 'flood' | 'overhead';
export type SoilType = 'sandy' | 'sandy_loam' | 'loam' | 'clay_loam' | 'clay';

export type AlmondVariety = 'nonpareil' | 'carmel' | 'butte' | 'padre' | 'monterey' | 'wood_colony' | 'fritz' | 'mission' | 'price' | 'other';
export type CitrusVariety = 'navel' | 'valencia' | 'cara_cara' | 'blood_orange' | 'eureka_lemon' | 'lisbon_lemon' | 'satsuma' | 'clementine' | 'w_murcott' | 'tango' | 'other';

export type CertificationBody = 'ccof' | 'ocia' | 'oregon_tilth' | 'primus' | 'other' | null;

export interface Organization { id: string; name: string; slug: string; timezone: string; locale: Locale; }
export interface Profile { id: string; orgId: string; fullName: string; role: UserRole; preferredLocale: Locale; phone?: string; avatarUrl?: string; }
```

---

## Pricing Model (Revised — No Hard Acre Ceiling)

```typescript
// packages/shared/src/constants/pricing.ts
export const PRICING = {
  starter: {
    name: 'Starter',
    baseMonthly: 149,       // USD/month
    baseAcres: 50,
    perAcreOver: 2.50,      // $/acre over 50 — linear, no ceiling
    mobileSeatsIncluded: 5,
    perExtraSeat: 12,       // $/month per mobile seat above 5
    features: ['blocks', 'tasks', 'mobile_app', 'bilingual', 'offline_sync']
  },
  growth: {
    name: 'Growth',
    baseMonthly: 299,
    baseAcres: 150,
    perAcreOver: 2.00,
    mobileSeatsIncluded: 15,
    perExtraSeat: 10,
    features: ['all_starter', 'irrigation', 'scouting', 'reports', 'frost_alerts']
  },
  enterprise: {
    name: 'Enterprise',
    baseMonthly: 599,
    baseAcres: 350,
    perAcreOver: 1.50,      // Still linear — 500 acres = $599 + (150 × $1.50) = $824/mo
    mobileSeatsIncluded: 999,
    perExtraSeat: 0,
    features: ['all_growth', 'labor', 'compliance', 'organic_records', 'api_access', 'quickbooks']
  }
};

export function calculateMonthlyPrice(plan: keyof typeof PRICING, acres: number, extraSeats = 0): number {
  const p = PRICING[plan];
  const acreCharge = Math.max(0, acres - p.baseAcres) * p.perAcreOver;
  const seatCharge = Math.max(0, extraSeats - p.mobileSeatsIncluded) * p.perExtraSeat;
  return p.baseMonthly + acreCharge + seatCharge;
}
```

---

## Cross-Phase Standards (Apply to All Phases)

### Testing
- **Unit tests (Vitest):** All utility functions — ET calculations, payroll OT rules, degree-day models, irrigation runtime calculator
- **Integration tests (Playwright):** Critical flows — onboarding, task completion, spray record creation, billing checkout
- **Mobile tests (Detox):** Offline sync scenario (create task offline → airplane mode → go online → verify sync)
- **API security tests:** Automated test that `orgId` from user A cannot access user B's data in every route

### Code Quality
- TypeScript strict mode — zero `any` types
- All DB queries via Drizzle ORM — no raw SQL in application code (except migrations)
- All user-facing strings via i18next — no hardcoded text in components
- Error boundaries on all major route segments
- Sentry for error tracking (web + mobile)

### Security
- All API routes validate session via Better Auth middleware
- Org isolation enforced in every Drizzle query (`where eq(table.orgId, orgId)`)
- Stripe webhook signature verification on every webhook
- File uploads: validate type (`image/jpeg`, `image/png`, `application/pdf`) and size (max 10MB) before R2 write
- API keys stored as bcrypt hash — plaintext shown only once at creation
- OWASP Top 10 review before each phase launch

### Accessibility
- WCAG 2.1 AA compliance for web
- Minimum 44×44pt touch targets on mobile (crew often use gloves)
- High contrast mode via CSS custom properties

### Bilingual Requirements
- Every user-facing string MUST have a key in both `en/` and `es/` locale files
- Database stores bilingual content in `_en` / `_es` column pairs where applicable
- Mobile notification text uses crew member's `preferred_locale`
- API error messages include locale-aware text

---

## Key Decisions Log (Architectural Choices Made)

| Decision | Choice | Rationale |
|---|---|---|
| Auth | Better Auth | TypeScript-native, organization plugin, Drizzle adapter, no vendor lock-in |
| Storage | Cloudflare R2 | S3-compatible, $0 egress, cheap at scale |
| Realtime | SSE + Redis pub/sub | Simpler than WebSockets, stateless Hono handlers, no proprietary protocol |
| Background jobs | BullMQ + Redis | Durable queues, retries, cron scheduling — replaces Supabase Edge Functions + pg_cron |
| Offline sync | WatermelonDB + custom endpoint | Field crew go dark in remote blocks. Custom `/api/v1/sync` instead of Supabase sync protocol |
| Task-block mapping | Junction table `task_blocks` | UUID arrays in Postgres can't be JOINed, indexed, or cascade-deleted efficiently |
| Task assignments | Junction table `task_assignments` | Same reason as above |
| Organic tracking | `is_organic` on `blocks` + `is_omri_listed` on `products` | Needed from day one — cannot bolt on after schema has data |
| SGMA compliance | `apn TEXT` on `blocks` | Required for water use reporting in San Joaquin Valley |
| Frost alerts | BullMQ job checking every 30min | pg_cron hourly is too slow for a 2 AM frost emergency |
| H-2A fields | Identification only — compliance disclaimer shown | Full H-2A module is a separate compliance product, half-built is a liability |
| Pricing | Linear per-acre, no hard ceiling | 500-acre operation at $599 cap = 0.24% of revenue. Linear is fair and grows with MRR |
