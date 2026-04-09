import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './index';

function getEnv(name: string) {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

const localDevSecret = 'ranchos-local-dev-auth-secret-2026-keep';
const baseURL = getEnv('BETTER_AUTH_URL') ?? 'http://localhost:3000';
const appURL = getEnv('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  secret: getEnv('BETTER_AUTH_SECRET') ?? localDevSecret,
  emailAndPassword: { enabled: true },
  session: { cookieCache: { enabled: true, maxAge: 86400 * 7 } }, // 7 days
  advanced: {
    database: {
      generateId: 'uuid',
    },
  },
  baseURL,
  trustedOrigins: [appURL],
});
