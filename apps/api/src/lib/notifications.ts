import { and, desc, eq, gte, inArray, isNotNull, isNull, like, sql } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  aiRecommendations,
  blocks,
  notificationDeliveries,
  notifications,
  notificationSettings,
  organizations,
  profiles,
} from '@ranchos/db/src/schema';
import { publishNotificationsUpdated } from './orgEvents';
import { sourceCategoryFromRecommendation } from './intelligenceRecommendations';

const DEFAULT_NOTIFICATION_SETTINGS = {
  pushEnabled: true,
  emailEnabled: false,
  urgentOnly: true,
  quietHoursEnabled: true,
  quietHoursStart: '21:00',
  quietHoursEnd: '06:00',
} as const;

const DELIVERY_TIMEOUT_REASONS = [
  'expo_receipt_timeout',
  'expo_missing_ticket_id_timeout',
] as const;

const DELIVERY_DEVICE_ISSUE_REASONS = [
  'expo_DeviceNotRegistered',
  'expo_receipt_DeviceNotRegistered',
  'invalid_push_token',
] as const;
const DELIVERY_RECEIPT_FAILURE_EXCLUDED_REASONS = [
  ...DELIVERY_TIMEOUT_REASONS,
  'expo_receipt_ok',
  'expo_receipt_DeviceNotRegistered',
] as const;

const DELIVERY_HISTORY_WINDOW_DAYS = 7;
const DELIVERY_HISTORY_LIMIT_DEFAULT = 12;
const DELIVERY_HISTORY_LIMIT_MAX = 50;

export type NotificationDeliveryHistoryStatusFilter =
  | 'all'
  | 'pending'
  | 'deferred'
  | 'sent'
  | 'failed'
  | 'canceled';

export type NotificationDeliveryHistoryReasonGroup =
  | 'all'
  | 'receipt_failure'
  | 'timeout'
  | 'device'
  | 'receipt_confirmed';

function getDeliveryReasonGroupCondition(reasonGroup: NotificationDeliveryHistoryReasonGroup) {
  if (reasonGroup === 'all') {
    return null;
  }

  if (reasonGroup === 'timeout') {
    return inArray(notificationDeliveries.reason, [...DELIVERY_TIMEOUT_REASONS]);
  }

  if (reasonGroup === 'device') {
    return inArray(notificationDeliveries.reason, [...DELIVERY_DEVICE_ISSUE_REASONS]);
  }

  if (reasonGroup === 'receipt_confirmed') {
    return eq(notificationDeliveries.reason, 'expo_receipt_ok');
  }

  return and(
    eq(notificationDeliveries.status, 'failed'),
    like(notificationDeliveries.reason, 'expo_receipt_%'),
    sql`${notificationDeliveries.reason} not in (${sql.join(
      DELIVERY_RECEIPT_FAILURE_EXCLUDED_REASONS.map((reason) => sql`${reason}`),
      sql`, `,
    )})`,
  );
}

function clampDeliveryHistoryLimit(limit: number | null | undefined) {
  if (!limit || !Number.isFinite(limit)) {
    return DELIVERY_HISTORY_LIMIT_DEFAULT;
  }

  return Math.max(1, Math.min(Math.trunc(limit), DELIVERY_HISTORY_LIMIT_MAX));
}

function isForecastAwareRecommendation(
  recommendation: Pick<typeof aiRecommendations.$inferSelect, 'dataInputs'>,
) {
  const dataInputs =
    recommendation.dataInputs && typeof recommendation.dataInputs === 'object'
      ? (recommendation.dataInputs as Record<string, unknown>)
      : null;

  return dataInputs?.forecastAware === true;
}

function parseHourMinute(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    return null;
  }

  return { hour, minute, totalMinutes: hour * 60 + minute };
}

function getMinuteOfDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  return hour * 60 + minute;
}

function getDeferredDeliveryTime(input: {
  now: Date;
  timeZone: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}) {
  const start = parseHourMinute(input.quietHoursStart);
  const end = parseHourMinute(input.quietHoursEnd);

  if (!input.quietHoursEnabled || !start || !end || start.totalMinutes === end.totalMinutes) {
    return {
      scheduledFor: input.now,
      status: 'pending' as const,
      reason: 'ready',
    };
  }

  const currentMinuteOfDay = getMinuteOfDay(input.now, input.timeZone);
  const withinQuietHours =
    start.totalMinutes < end.totalMinutes
      ? currentMinuteOfDay >= start.totalMinutes && currentMinuteOfDay < end.totalMinutes
      : currentMinuteOfDay >= start.totalMinutes || currentMinuteOfDay < end.totalMinutes;

  if (!withinQuietHours) {
    return {
      scheduledFor: input.now,
      status: 'pending' as const,
      reason: 'ready',
    };
  }

  const minutesUntilEnd =
    start.totalMinutes < end.totalMinutes
      ? end.totalMinutes - currentMinuteOfDay
      : currentMinuteOfDay >= start.totalMinutes
        ? (24 * 60 - currentMinuteOfDay) + end.totalMinutes
        : end.totalMinutes - currentMinuteOfDay;

  return {
    scheduledFor: new Date(input.now.getTime() + minutesUntilEnd * 60 * 1000),
    status: 'deferred' as const,
    reason: 'quiet_hours',
  };
}

export async function loadNotificationSnapshot(orgId: string) {
  const [activeCountRows, unreadCountRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.orgId, orgId), isNull(notifications.archivedAt))),
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
    activeCount: activeCountRows[0]?.count ?? 0,
    unreadCount: unreadCountRows[0]?.count ?? 0,
  };
}

export async function loadNotificationDeliverySettings(orgId: string) {
  const [orgRow, settingsRow] = await Promise.all([
    db
      .select({
        id: organizations.id,
        timezone: organizations.timezone,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
    db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.orgId, orgId))
      .limit(1),
  ]);

  const organization = orgRow[0] ?? null;
  const settings = settingsRow[0] ?? null;

  return {
    id: settings?.id ?? null,
    orgId,
    timezone: organization?.timezone ?? 'America/Los_Angeles',
    pushEnabled: settings?.pushEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.pushEnabled,
    emailEnabled: settings?.emailEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.emailEnabled,
    urgentOnly: settings?.urgentOnly ?? DEFAULT_NOTIFICATION_SETTINGS.urgentOnly,
    quietHoursEnabled:
      settings?.quietHoursEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.quietHoursEnabled,
    quietHoursStart:
      settings?.quietHoursStart ?? DEFAULT_NOTIFICATION_SETTINGS.quietHoursStart,
    quietHoursEnd: settings?.quietHoursEnd ?? DEFAULT_NOTIFICATION_SETTINGS.quietHoursEnd,
    createdAt: settings?.createdAt ?? null,
    updatedAt: settings?.updatedAt ?? null,
  };
}

export async function loadNotificationDeliverySummary(orgId: string) {
  const [deliveryRows, receiptRows, recipientRows, pushConfiguredRows] = await Promise.all([
    db
      .select({
        status: notificationDeliveries.status,
        count: sql<number>`count(*)::int`,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.orgId, orgId))
      .groupBy(notificationDeliveries.status),
    db
      .select({
        receiptConfirmed: sql<number>`count(*) filter (where ${notificationDeliveries.status} = 'sent' and ${notificationDeliveries.receiptCheckedAt} is not null)::int`,
        sentAwaitingReceipt: sql<number>`count(*) filter (where ${notificationDeliveries.status} = 'sent' and ${notificationDeliveries.receiptCheckedAt} is null)::int`,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.orgId, orgId)),
    db
      .select({
        count: sql<number>`count(distinct ${notificationDeliveries.profileId})::int`,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.orgId, orgId)),
    db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(profiles)
      .where(and(eq(profiles.orgId, orgId), isNotNull(profiles.expoPushToken))),
  ]);

  const counts = {
    pending: 0,
    deferred: 0,
    sent: 0,
    failed: 0,
    canceled: 0,
  };

  for (const row of deliveryRows) {
    if (
      row.status === 'pending' ||
      row.status === 'deferred' ||
      row.status === 'sent' ||
      row.status === 'failed' ||
      row.status === 'canceled'
    ) {
      counts[row.status] = row.count;
    }
  }

  return {
    ...counts,
    receiptConfirmed: receiptRows[0]?.receiptConfirmed ?? 0,
    sentAwaitingReceipt: receiptRows[0]?.sentAwaitingReceipt ?? 0,
    recipients: recipientRows[0]?.count ?? 0,
    pushConfiguredProfiles: pushConfiguredRows[0]?.count ?? 0,
  };
}

export async function loadNotificationDeliveryHistory(
  orgId: string,
  options: {
    status?: NotificationDeliveryHistoryStatusFilter;
    reasonGroup?: NotificationDeliveryHistoryReasonGroup;
    limit?: number | null;
  } = {},
) {
  const status = options.status ?? 'all';
  const reasonGroup = options.reasonGroup ?? 'all';
  const limit = clampDeliveryHistoryLimit(options.limit);
  const historyWhere = [eq(notificationDeliveries.orgId, orgId)];

  if (status !== 'all') {
    historyWhere.push(eq(notificationDeliveries.status, status));
  }

  const reasonCondition = getDeliveryReasonGroupCondition(reasonGroup);
  if (reasonCondition) {
    historyWhere.push(reasonCondition);
  }

  const windowStart = new Date(Date.now() - DELIVERY_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [items, recentOpsRows] = await Promise.all([
    db
      .select({
        id: notificationDeliveries.id,
        notificationId: notificationDeliveries.notificationId,
        profileId: notificationDeliveries.profileId,
        profileName: profiles.fullName,
        status: notificationDeliveries.status,
        channel: notificationDeliveries.channel,
        reason: notificationDeliveries.reason,
        attemptCount: notificationDeliveries.attemptCount,
        scheduledFor: notificationDeliveries.scheduledFor,
        lastAttemptAt: notificationDeliveries.lastAttemptAt,
        sentAt: notificationDeliveries.sentAt,
        failedAt: notificationDeliveries.failedAt,
        canceledAt: notificationDeliveries.canceledAt,
        receiptCheckedAt: notificationDeliveries.receiptCheckedAt,
        providerMessageId: notificationDeliveries.providerMessageId,
        createdAt: notificationDeliveries.createdAt,
        updatedAt: notificationDeliveries.updatedAt,
        notificationTitleEn: notifications.titleEn,
        notificationUrgency: notifications.urgency,
        sourceCategory: notifications.sourceCategory,
        hasPushToken: sql<boolean>`${profiles.expoPushToken} is not null`,
      })
      .from(notificationDeliveries)
      .innerJoin(profiles, eq(profiles.id, notificationDeliveries.profileId))
      .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
      .where(and(...historyWhere))
      .orderBy(desc(notificationDeliveries.updatedAt), desc(notificationDeliveries.createdAt))
      .limit(limit),
    db
      .select({
        receiptFailures: sql<number>`count(*) filter (
          where ${notificationDeliveries.updatedAt} >= ${windowStart}
            and ${notificationDeliveries.status} = 'failed'
            and ${notificationDeliveries.reason} like 'expo_receipt_%'
            and ${notificationDeliveries.reason} not in (${sql.join(
              DELIVERY_RECEIPT_FAILURE_EXCLUDED_REASONS.map((reason) => sql`${reason}`),
              sql`, `,
            )})
        )::int`,
        timeouts: sql<number>`count(*) filter (
          where ${notificationDeliveries.updatedAt} >= ${windowStart}
            and ${notificationDeliveries.reason} in (${sql.join(
              DELIVERY_TIMEOUT_REASONS.map((reason) => sql`${reason}`),
              sql`, `,
            )})
        )::int`,
        deviceIssues: sql<number>`count(*) filter (
          where ${notificationDeliveries.updatedAt} >= ${windowStart}
            and ${notificationDeliveries.reason} in (${sql.join(
              DELIVERY_DEVICE_ISSUE_REASONS.map((reason) => sql`${reason}`),
              sql`, `,
            )})
        )::int`,
        receiptConfirmed: sql<number>`count(*) filter (
          where ${notificationDeliveries.updatedAt} >= ${windowStart}
            and ${notificationDeliveries.reason} = 'expo_receipt_ok'
        )::int`,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.orgId, orgId)),
  ]);

  return {
    filters: {
      status,
      reasonGroup,
      limit,
    },
    opsSummary: {
      windowDays: DELIVERY_HISTORY_WINDOW_DAYS,
      receiptFailures: recentOpsRows[0]?.receiptFailures ?? 0,
      timeouts: recentOpsRows[0]?.timeouts ?? 0,
      deviceIssues: recentOpsRows[0]?.deviceIssues ?? 0,
      receiptConfirmed: recentOpsRows[0]?.receiptConfirmed ?? 0,
    },
    items: items.map((item) => ({
      ...item,
      hasPushToken: Boolean(item.hasPushToken),
    })),
  };
}

export async function publishNotificationSnapshot(
  orgId: string,
  payload: Record<string, unknown> = {},
) {
  const [snapshot, deliverySummary] = await Promise.all([
    loadNotificationSnapshot(orgId),
    loadNotificationDeliverySummary(orgId),
  ]);

  await publishNotificationsUpdated(orgId, {
    ...payload,
    activeCount: snapshot.activeCount,
    unreadCount: snapshot.unreadCount,
    deliverySummary,
  });

  return {
    ...snapshot,
    deliverySummary,
  };
}

export async function syncNotificationDeliveries(orgId: string) {
  const [settings, notificationRows, recipientRows, existingDeliveryRows] = await Promise.all([
    loadNotificationDeliverySettings(orgId),
    db
      .select({
        id: notifications.id,
        titleEn: notifications.titleEn,
        titleEs: notifications.titleEs,
        bodyEn: notifications.bodyEn,
        bodyEs: notifications.bodyEs,
        urgency: notifications.urgency,
        sourceCategory: notifications.sourceCategory,
        metadata: notifications.metadata,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, orgId),
          isNull(notifications.archivedAt),
          isNull(notifications.readAt),
        ),
      )
      .orderBy(desc(notifications.createdAt)),
    db
      .select({
        id: profiles.id,
        preferredLocale: profiles.preferredLocale,
        expoPushToken: profiles.expoPushToken,
      })
      .from(profiles)
      .where(and(eq(profiles.orgId, orgId), isNotNull(profiles.expoPushToken))),
    db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.orgId, orgId),
          eq(notificationDeliveries.channel, 'push'),
        ),
      ),
  ]);

  const now = new Date();
  const deliveryWindow = getDeferredDeliveryTime({
    now,
    timeZone: settings.timezone,
    quietHoursEnabled: settings.quietHoursEnabled,
    quietHoursStart: settings.quietHoursStart,
    quietHoursEnd: settings.quietHoursEnd,
  });

  const eligibleNotifications = notificationRows.filter(
    (notification) => !settings.urgentOnly || notification.urgency === 'urgent',
  );
  const recipients = settings.pushEnabled ? recipientRows : [];
  const desiredKeys = new Set<string>();
  const existingByKey = new Map(
    existingDeliveryRows.map((row) => [`${row.notificationId}:${row.profileId}:${row.channel}`, row]),
  );

  const inserts: typeof notificationDeliveries.$inferInsert[] = [];
  const updates: Array<{
    id: string;
    values: Partial<typeof notificationDeliveries.$inferInsert>;
  }> = [];

  for (const notification of eligibleNotifications) {
    for (const recipient of recipients) {
      const key = `${notification.id}:${recipient.id}:push`;
      desiredKeys.add(key);

      const preferredLocale = recipient.preferredLocale === 'es' ? 'es' : 'en';
      const metadata =
        notification.metadata && typeof notification.metadata === 'object'
          ? (notification.metadata as Record<string, unknown>)
          : {};
      const payload = {
        expoPushToken: recipient.expoPushToken,
        locale: preferredLocale,
        title: preferredLocale === 'es' ? notification.titleEs : notification.titleEn,
        body: preferredLocale === 'es' ? notification.bodyEs : notification.bodyEn,
        notificationId: notification.id,
        urgency: notification.urgency,
        sourceCategory: notification.sourceCategory,
        blockId: typeof metadata.blockId === 'string' ? metadata.blockId : null,
        blockName: typeof metadata.blockName === 'string' ? metadata.blockName : null,
      };

      const existing = existingByKey.get(key);
      const nextValues: Partial<typeof notificationDeliveries.$inferInsert> = {
        status: deliveryWindow.status,
        attemptCount: 0,
        scheduledFor: deliveryWindow.scheduledFor,
        lastAttemptAt: null,
        providerMessageId: null,
        receiptCheckedAt: null,
        reason: deliveryWindow.reason,
        payload,
        canceledAt: null,
        failedAt: null,
        updatedAt: new Date(),
      };

      if (!existing) {
        inserts.push({
          orgId,
          notificationId: notification.id,
          profileId: recipient.id,
          channel: 'push',
          status: deliveryWindow.status,
          attemptCount: 0,
          scheduledFor: deliveryWindow.scheduledFor,
          lastAttemptAt: null,
          providerMessageId: null,
          receiptCheckedAt: null,
          reason: deliveryWindow.reason,
          payload,
        });
        continue;
      }

      if (existing.status === 'sent' || existing.status === 'failed') {
        continue;
      }

      const scheduledChanged =
        (existing.scheduledFor?.getTime?.() ?? null) !==
        (deliveryWindow.scheduledFor?.getTime?.() ?? null);
      const needsUpdate =
        existing.status !== deliveryWindow.status ||
        existing.reason !== deliveryWindow.reason ||
        scheduledChanged ||
        existing.canceledAt !== null ||
        JSON.stringify(existing.payload ?? null) !== JSON.stringify(payload);

      if (needsUpdate) {
        updates.push({ id: existing.id, values: nextValues });
      }
    }
  }

  const staleDeliveryIds = existingDeliveryRows
    .filter((row) => row.status === 'pending' || row.status === 'deferred')
    .filter((row) => !desiredKeys.has(`${row.notificationId}:${row.profileId}:${row.channel}`))
    .map((row) => row.id);

  if (inserts.length > 0) {
    await db.insert(notificationDeliveries).values(inserts);
  }

  for (const update of updates) {
    await db
      .update(notificationDeliveries)
      .set(update.values)
      .where(eq(notificationDeliveries.id, update.id));
  }

  if (staleDeliveryIds.length > 0) {
    await db
      .update(notificationDeliveries)
      .set({
        status: 'canceled',
        reason: settings.pushEnabled ? 'notification_inactive' : 'push_disabled',
        canceledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(notificationDeliveries.id, staleDeliveryIds));
  }

  const summary = await loadNotificationDeliverySummary(orgId);
  return {
    inserted: inserts.length,
    updated: updates.length,
    canceled: staleDeliveryIds.length,
    summary,
    settings,
  };
}

export async function syncForecastNotifications(
  orgId: string,
  options: { publishEvent?: boolean } = {},
) {
  const { publishEvent = true } = options;
  const recommendationRows = await db
    .select({
      id: aiRecommendations.id,
      orgId: aiRecommendations.orgId,
      blockId: aiRecommendations.blockId,
      recommendationType: aiRecommendations.recommendationType,
      titleEn: aiRecommendations.titleEn,
      titleEs: aiRecommendations.titleEs,
      bodyEn: aiRecommendations.bodyEn,
      bodyEs: aiRecommendations.bodyEs,
      urgency: aiRecommendations.urgency,
      dataInputs: aiRecommendations.dataInputs,
      createdAt: aiRecommendations.createdAt,
      blockName: blocks.name,
    })
    .from(aiRecommendations)
    .innerJoin(blocks, eq(aiRecommendations.blockId, blocks.id))
    .where(
      and(
        eq(aiRecommendations.orgId, orgId),
        isNull(aiRecommendations.dismissedAt),
        isNull(aiRecommendations.actedOnAt),
      ),
    )
    .orderBy(desc(aiRecommendations.createdAt));

  const activeForecastUrgentRecommendations = recommendationRows.filter(
    (recommendation) =>
      recommendation.urgency === 'urgent' && isForecastAwareRecommendation(recommendation),
  );

  const existingNotifications = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.orgId, orgId),
        eq(notifications.notificationType, 'forecast_recommendation'),
      ),
    )
    .orderBy(desc(notifications.createdAt));

  const activeRecommendationIds = new Set(
    activeForecastUrgentRecommendations.map((recommendation) => recommendation.id),
  );
  const existingByRecommendationId = new Map(
    existingNotifications
      .filter((notification) => notification.recommendationId)
      .map((notification) => [notification.recommendationId!, notification]),
  );

  const inserts: typeof notifications.$inferInsert[] = [];
  const updates: Array<{
    id: string;
    values: Partial<typeof notifications.$inferInsert>;
  }> = [];

  for (const recommendation of activeForecastUrgentRecommendations) {
    const existing = existingByRecommendationId.get(recommendation.id);
    const metadata = {
      blockId: recommendation.blockId,
      blockName: recommendation.blockName,
      recommendationType: recommendation.recommendationType,
      recommendationId: recommendation.id,
      ...((recommendation.dataInputs as Record<string, unknown> | null) ?? {}),
    };

    if (!existing) {
      inserts.push({
        orgId,
        recommendationId: recommendation.id,
        notificationType: 'forecast_recommendation',
        titleEn: recommendation.titleEn,
        titleEs: recommendation.titleEs,
        bodyEn: recommendation.bodyEn,
        bodyEs: recommendation.bodyEs,
        urgency: recommendation.urgency,
        sourceCategory: sourceCategoryFromRecommendation(recommendation),
        metadata,
      });
      continue;
    }

    const nextValues: Partial<typeof notifications.$inferInsert> = {
      titleEn: recommendation.titleEn,
      titleEs: recommendation.titleEs,
      bodyEn: recommendation.bodyEn,
      bodyEs: recommendation.bodyEs,
      urgency: recommendation.urgency,
      sourceCategory: sourceCategoryFromRecommendation(recommendation),
      metadata,
      updatedAt: new Date(),
    };

    const needsUpdate =
      existing.titleEn !== recommendation.titleEn ||
      existing.titleEs !== recommendation.titleEs ||
      existing.bodyEn !== recommendation.bodyEn ||
      existing.bodyEs !== recommendation.bodyEs ||
      existing.urgency !== recommendation.urgency ||
      existing.sourceCategory !== sourceCategoryFromRecommendation(recommendation) ||
      JSON.stringify(existing.metadata ?? null) !== JSON.stringify(metadata);

    if (needsUpdate) {
      updates.push({ id: existing.id, values: nextValues });
    }
  }

  const staleNotificationIds = existingNotifications
    .filter((notification) => notification.recommendationId)
    .filter(
      (notification) =>
        !notification.archivedAt &&
        !activeRecommendationIds.has(notification.recommendationId!),
    )
    .map((notification) => notification.id);

  if (inserts.length > 0) {
    await db.insert(notifications).values(inserts);
  }

  for (const update of updates) {
    await db
      .update(notifications)
      .set(update.values)
      .where(eq(notifications.id, update.id));
  }

  if (staleNotificationIds.length > 0) {
    await db
      .update(notifications)
      .set({
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(notifications.id, staleNotificationIds));
  }

  const deliverySync = await syncNotificationDeliveries(orgId);
  const changed = inserts.length + updates.length + staleNotificationIds.length;
  const snapshot = await loadNotificationSnapshot(orgId);
  if (publishEvent && changed > 0) {
    await publishNotificationsUpdated(orgId, {
      inserted: inserts.length,
      updated: updates.length,
      archived: staleNotificationIds.length,
      activeCount: snapshot.activeCount,
      unreadCount: snapshot.unreadCount,
      deliverySummary: deliverySync.summary,
    });
  }

  return {
    inserted: inserts.length,
    updated: updates.length,
    archived: staleNotificationIds.length,
    activeCount: snapshot.activeCount,
    unreadCount: snapshot.unreadCount,
    deliverySync,
  };
}
