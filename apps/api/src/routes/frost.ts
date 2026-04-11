import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import { frostAlertConfig, profiles } from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import {
  createFrostTestAlert,
  loadFrostWorkspace,
  syncFrostNotifications,
} from '../lib/frost';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

function normalizeBoolean(value: unknown, fieldName: string) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(`${fieldName} is invalid.`);
}

function normalizeDecimal(value: unknown, fieldName: string, options: { min?: number; max?: number } = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    (options.min !== undefined && parsed < options.min) ||
    (options.max !== undefined && parsed > options.max)
  ) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return parsed.toFixed(1);
}

function normalizeHour(value: unknown, fieldName: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    throw new Error(`${fieldName} must be between 0 and 23.`);
  }

  return parsed;
}

function normalizeNotifyProfiles(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error('Dispatch roster is invalid.');
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)),
  );
}

async function ensureProfilesBelongToOrg(orgId: string, profileIds: string[]) {
  if (profileIds.length === 0) {
    return;
  }

  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(inArray(profiles.id, profileIds));
  const ownedProfileIds = new Set(rows.map((row) => row.id));
  const allOwned = profileIds.every((profileId) => ownedProfileIds.has(profileId));

  if (!allOwned) {
    throw new Error('Dispatch roster includes a profile outside this organization.');
  }

  const foreignRow = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.orgId, orgId));
  const orgProfileIds = new Set(foreignRow.map((row) => row.id));
  if (!profileIds.every((profileId) => orgProfileIds.has(profileId))) {
    throw new Error('Dispatch roster includes a profile outside this organization.');
  }
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');
  return c.json(await loadFrostWorkspace(orgId));
});

app.patch('/', async (c) => {
  const orgId = c.get('orgId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const currentWorkspace = await loadFrostWorkspace(orgId);

    const enabled = 'enabled' in body
      ? normalizeBoolean(body.enabled, 'Enabled status')
      : currentWorkspace.settings.enabled;
    const warningTempF =
      'warningTempF' in body
        ? normalizeDecimal(body.warningTempF, 'Warning temperature', { min: 20, max: 45 })
        : currentWorkspace.settings.warningTempF.toFixed(1);
    const dangerTempF =
      'dangerTempF' in body
        ? normalizeDecimal(body.dangerTempF, 'Danger temperature', { min: 20, max: 45 })
        : currentWorkspace.settings.dangerTempF.toFixed(1);
    const monitorStartHour =
      'monitorStartHour' in body
        ? normalizeHour(body.monitorStartHour, 'Monitor start hour')
        : currentWorkspace.settings.monitorStartHour;
    const monitorEndHour =
      'monitorEndHour' in body
        ? normalizeHour(body.monitorEndHour, 'Monitor end hour')
        : currentWorkspace.settings.monitorEndHour;
    const notifyProfiles =
      'notifyProfiles' in body
        ? normalizeNotifyProfiles(body.notifyProfiles)
        : currentWorkspace.settings.notifyProfiles;

    if (Number(warningTempF) < Number(dangerTempF)) {
      throw new Error('Warning temperature must stay above or equal to danger temperature.');
    }

    await ensureProfilesBelongToOrg(orgId, notifyProfiles);

    await db
      .insert(frostAlertConfig)
      .values({
        orgId,
        enabled,
        warningTempF,
        dangerTempF,
        monitorHours: {
          start: monitorStartHour,
          end: monitorEndHour,
        },
        notifyProfiles,
      })
      .onConflictDoUpdate({
        target: frostAlertConfig.orgId,
        set: {
          enabled,
          warningTempF,
          dangerTempF,
          monitorHours: {
            start: monitorStartHour,
            end: monitorEndHour,
          },
          notifyProfiles,
          updatedAt: new Date(),
        },
      });

    const sync = await syncFrostNotifications(orgId, { publishEvent: true });
    const workspace = await loadFrostWorkspace(orgId);

    return c.json({
      ...workspace,
      sync: {
        inserted: sync.inserted,
        updated: sync.updated,
        archived: sync.archived,
        deliveryInserted: sync.deliverySync.inserted,
        deliveryUpdated: sync.deliverySync.updated,
        deliveryCanceled: sync.deliverySync.canceled,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update frost settings.';
    return c.json({ error: message }, 400);
  }
});

app.post('/test-alert', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const result = await createFrostTestAlert(orgId, profileId);
    const workspace = await loadFrostWorkspace(orgId);

    return c.json({
      ok: true,
      ...workspace,
      sync: {
        deliveryInserted: result.deliverySync.inserted,
        deliveryUpdated: result.deliverySync.updated,
        deliveryCanceled: result.deliverySync.canceled,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send frost test alert.';
    return c.json({ error: message }, 400);
  }
});

export default app;
