# RanchOS

RanchOS is a monorepo for an orchard and ranch operations platform. It includes a Next.js web app, a Hono API, shared database and utility packages, and an Expo mobile app for field workflows.

The product covers onboarding, ranch and block mapping, irrigation, scouting, compliance records, labor logging, harvest tracking, notifications, and operational recommendations.

## Repo layout

```text
RanchOS/
|- apps/
|  |- web/       Next.js 16 web app
|  |- api/       Hono API and background workers
|  `- mobile/    Expo mobile app
|- packages/
|  |- db/        Drizzle schema, migrations, auth, seed script
|  |- shared/    Shared types and business logic
|  |- redis/     Shared Redis client helpers
|  `- i18n/      Translation resources
|- docs/         User-facing documentation
|- scripts/      Utility scripts
|- docker-compose.yml
`- package.json
```

## Tech stack

- Web: Next.js 16, React 19, Tailwind CSS 4, Better Auth, MapLibre
- API: Hono, BullMQ, Redis, PostgreSQL, Stripe, ExcelJS
- Database: PostgreSQL 16 with PostGIS, Drizzle ORM
- Mobile: Expo SDK 51, React Native, WatermelonDB, Expo Notifications
- Tooling: npm workspaces, Turborepo, TypeScript, ESLint

## Requirements

| Requirement | Version / Notes |
| --- | --- |
| Node.js | 20.x recommended. CI is pinned to Node 20. |
| npm | 11.6.2 is declared in `package.json`. |
| PostgreSQL | 16 with PostGIS enabled. |
| Redis | 7.x for queues, SSE, and notification processing. |
| Docker | Recommended for local Postgres + Redis via `docker compose`. |

## Key dependencies

These are the main runtime dependencies other developers should know about:

- Root tooling: `turbo`, `tsx`, `cross-env`, `typescript`, `eslint`
- Web app: `next`, `react`, `react-dom`, `better-auth`, `maplibre-gl`, `@turf/turf`, `framer-motion`, `recharts`, `jspdf`
- API: `hono`, `@hono/node-server`, `bullmq`, `ioredis`, `pg`, `stripe`, `exceljs`, `node-quickbooks`
- Mobile: `expo`, `react-native`, `@nozbe/watermelondb`, `expo-camera`, `expo-location`, `expo-notifications`
- Shared/data packages: `drizzle-orm`, `drizzle-kit`, `i18next`, `react-i18next`

For exact pinned versions, check:

- [`package.json`](./package.json)
- [`apps/web/package.json`](./apps/web/package.json)
- [`apps/api/package.json`](./apps/api/package.json)
- [`apps/mobile/package.json`](./apps/mobile/package.json)

## Ports used locally

| Service | Port |
| --- | --- |
| Web app | `3000` |
| API | `3001` |
| PostgreSQL | `5432` |
| Redis | `6379` |

## Environment variables

Copy `.env.example` to `.env` at the repo root before running the app.

### Required for core local development

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Drizzle, Better Auth, and migrations. |
| `BETTER_AUTH_SECRET` | Yes | Secret used to sign auth sessions. Use a strong random value outside local dev. |
| `BETTER_AUTH_URL` | Yes | Public base URL for auth callbacks, usually the web app URL. |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL of the web app. Also used by API CORS/auth trusted origins. |
| `NEXT_PUBLIC_API_URL` | Yes | Public URL of the API. Used by Next.js rewrites. |
| `REDIS_URL` | Recommended | Redis connection string. The API can boot without Redis, but workers and queue-backed features will be offline. |

### Optional integrations and overrides

| Variable | Purpose |
| --- | --- |
| `API_URL` | Convenience variable for local tooling and docs; not a primary runtime setting in the current codebase. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Optional custom map style URL override for the web app. |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID for object storage. |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key. |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key. |
| `R2_BUCKET_NAME` | Cloudflare R2 bucket name. |
| `R2_PUBLIC_URL` | Public base URL for uploaded files. |
| `STRIPE_SECRET_KEY` | Stripe secret key for billing and webhooks. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for the web app. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret for `/api/webhooks/stripe`. |
| `STRIPE_STARTER_PRICE_ID` | Starter plan price ID. |
| `STRIPE_GROWTH_PRICE_ID` | Growth plan price ID. |
| `STRIPE_ENTERPRISE_PRICE_ID` | Enterprise plan price ID. |
| `CIMIS_APP_KEY` | California CIMIS API key used by irrigation/weather workers. |
| `QBO_CLIENT_ID` | QuickBooks Online client ID. |
| `QBO_CLIENT_SECRET` | QuickBooks Online client secret. |
| `AGWORLD_API_BASE_URL` | Base URL for AgWorld integration. Defaults to `https://api.agworld.com.au`. |
| `AGWORLD_SPRAY_PUSH_PATH` | AgWorld spray record create endpoint path. |
| `AGWORLD_SPRAY_READ_PATH` | AgWorld spray record read endpoint path. |
| `EXPO_ACCESS_TOKEN` | Optional Expo access token for push notification API calls. |
| `EXPO_PUBLIC_API_URL` | Public API URL used by the Expo mobile app. |
| `EXPO_PUBLIC_DEV_USER_ID` | Local-dev fallback user ID for the mobile app's dev bearer token flow. |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Expo/EAS project ID used for push registration. |

## Local development setup

### 1. Install dependencies

```bash
npm ci
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Update the values in `.env` for your machine or shared dev environment.

### 3. Start PostgreSQL and Redis

```bash
docker compose up -d postgres redis
```

This repo ships with:

- PostgreSQL 16 + PostGIS
- Redis 7

If you do not use Docker, make sure your own services match those connection details in `.env`.

### 4. Run database migrations

```bash
npm run db:migrate
```

### 5. Optionally seed sample data

```bash
npm run db:seed
```

Note: the seed script creates a sample organization and profile, but it uses a placeholder admin/profile ID. Treat it as starter data, not production onboarding.

### 6. Start the web app and API

```bash
npm run dev
```

Open:

- Web: [http://localhost:3000](http://localhost:3000)
- API health check: [http://localhost:3001/health](http://localhost:3001/health)

`npm run dev` runs workspace dev scripts through Turborepo. In the current repo, that covers the web app and API. The mobile app is started separately.

### 7. Start the mobile app separately

```bash
cd apps/mobile
npm start
```

For mobile local development, set at least:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_DEV_USER_ID`
- `EXPO_PUBLIC_EAS_PROJECT_ID` if you want push token registration

## Common scripts

From the repo root:

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Deployment overview

RanchOS is split into separate deployable parts:

1. Web app (`apps/web`)
2. API service (`apps/api`)
3. PostgreSQL + PostGIS
4. Redis

### Recommended production shape

- Deploy the web app on Vercel or another Node-capable host
- Deploy the API on a VPS/container host with stable access to Postgres and Redis
- Put HTTPS in front of both services
- Run database migrations before serving traffic
- Keep Redis enabled if you rely on notifications, SSE updates, or recurring workers

### Minimum deployment checklist

1. Provision PostgreSQL 16 with PostGIS.
2. Provision Redis 7.
3. Set all required environment variables for your production domains.
4. Run `npm ci`.
5. Run `npm run db:migrate`.
6. Build and deploy the web app.
7. Run the API behind a process manager or container.
8. Verify `/health`, auth flows, and database connectivity.
9. If using Stripe, register the webhook endpoint at `/api/webhooks/stripe`.

### Important API deployment note

The current API package has a development-first setup:

- `apps/api/package.json` defines `dev` as `tsx watch src/index.ts`
- `apps/api/package.json` defines `start` as `node dist/index.js`
- `apps/api/tsconfig.json` currently has `noEmit: true`

That means the repo does not currently produce a ready-to-run compiled API build from `apps/api` alone. Before a production rollout, you should do one of the following:

1. Add a real compiled API build pipeline that emits `dist/`
2. Run the API from TypeScript with a supported runtime/process manager strategy

Documenting that mismatch here is intentional so deployment is predictable.

## Operational notes

- The API hardcodes port `3001` in `apps/api/src/index.ts`.
- The web app proxies `/api/auth/*` and `/api/v1/*` to `NEXT_PUBLIC_API_URL`.
- Redis is optional only for a limited local boot. Without Redis, queue workers, notifications, and some live-update flows are unavailable.
- The mobile app currently uses a local development bearer token shortcut (`Bearer dev:<userId>`) when `NODE_ENV` is not production.
- The user-facing product manual lives in [`docs/RanchOS_User_Manual.md`](./docs/RanchOS_User_Manual.md).

## CI

GitHub Actions currently runs:

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm run db:migrate`
- `npm run build`

See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) for the exact workflow.

## Troubleshooting

### API returns database errors on startup

- Check `DATABASE_URL`
- Confirm Postgres is running
- Run `npm run db:migrate`

### Workers do not process notifications or scheduled jobs

- Check `REDIS_URL`
- Confirm Redis is reachable
- Review API logs for BullMQ startup warnings

### Login or session issues

- Verify `BETTER_AUTH_URL`
- Verify `NEXT_PUBLIC_APP_URL`
- Make sure the web and API URLs match your actual environment

### Web app cannot reach the API

- Verify `NEXT_PUBLIC_API_URL`
- Confirm the API is listening on port `3001`
- Check [http://localhost:3001/health](http://localhost:3001/health)

## Status

This README is intended to be the main GitHub landing page for setup and deployment. It reflects the current repository structure and scripts as of June 17, 2026.
