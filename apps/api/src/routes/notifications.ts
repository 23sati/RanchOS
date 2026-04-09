import { Hono } from 'hono';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import { notificationSettings, notifications, profiles } from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import {
  loadNotificationDeliveryHistory,
  loadNotificationDeliverySettings,
  loadNotificationDeliverySummary,
  type NotificationDeliveryHistoryReasonGroup,
  type NotificationDeliveryHistoryStatusFilter,
  publishNotificationSnapshot,
  syncNotificationDeliveries,
} from '../lib/notifications';
import { publishNotificationsUpdated } from '../lib/orgEvents';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeAction(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (normalized !== 'read' && normalized !== 'archive' && normalized !== 'unread') {
    throw new Error('Action is invalid.');
  }

  return normalized;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  return null;
}

function normalizeTime(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error('Time must use HH:MM format.');
  }

  const [hour, minute] = normalized.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    throw new Error('Time must use HH:MM format.');
  }

  return normalized;
}

function normalizeExpoPushToken(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^Expo(nent)?PushToken\[[A-Za-z0-9-]+\]$/.test(normalized)) {
    throw new Error('Expo push token is invalid.');
  }

  return normalized;
}

function normalizeHistoryStatus(value: unknown): NotificationDeliveryHistoryStatusFilter {
  if (typeof value !== 'string' || !value.trim()) {
    return 'all';
  }

  const normalized = value.trim();
  if (
    normalized === 'all' ||
    normalized === 'pending' ||
    normalized === 'deferred' ||
    normalized === 'sent' ||
    normalized === 'failed' ||
    normalized === 'canceled'
  ) {
    return normalized;
  }

  throw new Error('Delivery status filter is invalid.');
}

function normalizeHistoryReasonGroup(value: unknown): NotificationDeliveryHistoryReasonGroup {
  if (typeof value !== 'string' || !value.trim()) {
    return 'all';
  }

  const normalized = value.trim();
  if (
    normalized === 'all' ||
    normalized === 'receipt_failure' ||
    normalized === 'timeout' ||
    normalized === 'device' ||
    normalized === 'receipt_confirmed'
  ) {
    return normalized;
  }

  throw new Error('Delivery issue filter is invalid.');
}

function normalizeHistoryLimit(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('Delivery history limit is invalid.');
  }

  return numeric;
}

async function loadNotificationSummary(orgId: string) {
  const [items, unreadCountRows] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.orgId, orgId), isNull(notifications.archivedAt)))
      .orderBy(sql`case when ${notifications.readAt} is null then 0 else 1 end`, desc(notifications.createdAt))
      .limit(8),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, orgId),
          isNull(notifications.archivedAt),
          isNull(notifications.readAt),
        ),
      ),
  ]);

  return {
    items,
    unreadCount: unreadCountRows[0]?.count ?? 0,
  };
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');
  return c.json(await loadNotificationSummary(orgId));
});

app.get('/preferences', async (c) => {
  const orgId = c.get('orgId');
  const [settings, deliverySummary] = await Promise.all([
    loadNotificationDeliverySettings(orgId),
    loadNotificationDeliverySummary(orgId),
  ]);

  return c.json({
    settings,
    deliverySummary,
  });
});

app.get('/preferences/history', async (c) => {
  const orgId = c.get('orgId');

  try {
    const status = normalizeHistoryStatus(c.req.query('status'));
    const reasonGroup = normalizeHistoryReasonGroup(c.req.query('reasonGroup'));
    const limit = normalizeHistoryLimit(c.req.query('limit'));

    return c.json(
      await loadNotificationDeliveryHistory(orgId, {
        status,
        reasonGroup,
        limit,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load delivery history.';
    return c.json({ error: message }, 400);
  }
});

app.patch('/preferences', async (c) => {
  const orgId = c.get('orgId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const currentSettings = await loadNotificationDeliverySettings(orgId);

    const pushEnabled = normalizeBoolean(body.pushEnabled) ?? currentSettings.pushEnabled;
    const emailEnabled = normalizeBoolean(body.emailEnabled) ?? currentSettings.emailEnabled;
    const urgentOnly = normalizeBoolean(body.urgentOnly) ?? currentSettings.urgentOnly;
    const quietHoursEnabled =
      normalizeBoolean(body.quietHoursEnabled) ?? currentSettings.quietHoursEnabled;
    const quietHoursStart = normalizeTime(body.quietHoursStart) ?? currentSettings.quietHoursStart;
    const quietHoursEnd = normalizeTime(body.quietHoursEnd) ?? currentSettings.quietHoursEnd;

    await db
      .insert(notificationSettings)
      .values({
        orgId,
        pushEnabled,
        emailEnabled,
        urgentOnly,
        quietHoursEnabled,
        quietHoursStart,
        quietHoursEnd,
      })
      .onConflictDoUpdate({
        target: notificationSettings.orgId,
        set: {
          pushEnabled,
          emailEnabled,
          urgentOnly,
          quietHoursEnabled,
          quietHoursStart,
          quietHoursEnd,
          updatedAt: new Date(),
        },
      });

    const deliverySync = await syncNotificationDeliveries(orgId);
    const [settings, snapshot] = await Promise.all([
      loadNotificationDeliverySettings(orgId),
      publishNotificationSnapshot(orgId, {
        reason: 'notification_preferences_updated',
        sync: {
          inserted: deliverySync.inserted,
          updated: deliverySync.updated,
          canceled: deliverySync.canceled,
        },
      }),
    ]);

    return c.json({
      settings,
      deliverySummary: snapshot.deliverySummary,
      sync: {
        inserted: deliverySync.inserted,
        updated: deliverySync.updated,
        canceled: deliverySync.canceled,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update preferences.';
    return c.json({ error: message }, 400);
  }
});

app.put('/device-token', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const expoPushToken = normalizeExpoPushToken(body.expoPushToken);
    if (!expoPushToken) {
      return c.json({ error: 'Expo push token is required.' }, 400);
    }

    await db
      .update(profiles)
      .set({
        expoPushToken,
        updatedAt: new Date(),
      })
      .where(and(eq(profiles.id, profileId), eq(profiles.orgId, orgId)));

    const deliverySync = await syncNotificationDeliveries(orgId);
    const snapshot = await publishNotificationSnapshot(orgId, {
      reason: 'device_token_registered',
      profileId,
      sync: {
        inserted: deliverySync.inserted,
        updated: deliverySync.updated,
        canceled: deliverySync.canceled,
      },
    });

    return c.json({
      ok: true,
      expoPushToken,
      deliverySummary: snapshot.deliverySummary,
      sync: {
        inserted: deliverySync.inserted,
        updated: deliverySync.updated,
        canceled: deliverySync.canceled,
      },
      snapshot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to register device token.';
    return c.json({ error: message }, 400);
  }
});

app.delete('/device-token', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  await db
    .update(profiles)
    .set({
      expoPushToken: null,
      updatedAt: new Date(),
    })
    .where(and(eq(profiles.id, profileId), eq(profiles.orgId, orgId)));

  const deliverySync = await syncNotificationDeliveries(orgId);
  const snapshot = await publishNotificationSnapshot(orgId, {
    reason: 'device_token_cleared',
    profileId,
    sync: {
      inserted: deliverySync.inserted,
      updated: deliverySync.updated,
      canceled: deliverySync.canceled,
    },
  });

  return c.json({
    ok: true,
    deliverySummary: snapshot.deliverySummary,
    sync: {
      inserted: deliverySync.inserted,
      updated: deliverySync.updated,
      canceled: deliverySync.canceled,
    },
  });
});

app.patch('/:id', async (c) => {
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const action = normalizeAction(body.action);
    if (!action) {
      return c.json({ error: 'Action is required.' }, 400);
    }

    const updateValues =
      action === 'read'
        ? { readAt: new Date(), updatedAt: new Date() }
        : action === 'unread'
          ? { readAt: null, updatedAt: new Date() }
          : { archivedAt: new Date(), updatedAt: new Date() };

    const [updatedNotification] = await db
      .update(notifications)
      .set(updateValues)
      .where(and(eq(notifications.id, id), eq(notifications.orgId, orgId)))
      .returning();

    if (!updatedNotification) {
      return c.json({ error: 'Notification not found.' }, 404);
    }

    const [summary, deliverySync] = await Promise.all([
      loadNotificationSummary(orgId),
      syncNotificationDeliveries(orgId),
    ]);
    await publishNotificationsUpdated(orgId, {
      reason: action === 'archive' ? 'notification_archived' : 'notification_read_state_changed',
      notificationId: updatedNotification.id,
      unreadCount: summary.unreadCount,
      deliverySummary: deliverySync.summary,
    });

    return c.json({
      id: updatedNotification.id,
      action,
      readAt: updatedNotification.readAt,
      archivedAt: updatedNotification.archivedAt,
      unreadCount: summary.unreadCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update notification.';
    return c.json({ error: message }, 400);
  }
});

app.post('/read-all', async (c) => {
  const orgId = c.get('orgId');

  await db
    .update(notifications)
    .set({
      readAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(notifications.orgId, orgId), isNull(notifications.archivedAt), isNull(notifications.readAt)));

  const deliverySync = await syncNotificationDeliveries(orgId);
  await publishNotificationsUpdated(orgId, {
    reason: 'notifications_read_all',
    unreadCount: 0,
    deliverySummary: deliverySync.summary,
  });

  return c.json(await loadNotificationSummary(orgId));
});

export default app;
