import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import { notificationDeliveries, profiles } from '@ranchos/db/src/schema';
import { publishNotificationSnapshot } from './notifications';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_API_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_ATTEMPTS = 5;
const SEND_BATCH_LIMIT = 100;
const RECEIPT_BATCH_LIMIT = 300;
const RECEIPT_LOOKBACK_DELAY_MS = 5 * 60 * 1000;
const RECEIPT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export const notificationDeliveryQueueName = 'notification-delivery-send';
export const notificationReceiptQueueName = 'notification-delivery-receipts';

type DeliveryRow = {
  id: string;
  orgId: string;
  notificationId: string;
  profileId: string;
  status: string;
  attemptCount: number;
  payload: unknown;
  expoPushToken: string | null;
};

type DeliveryPayload = {
  title?: string;
  body?: string;
  notificationId?: string;
  urgency?: string | null;
  sourceCategory?: string | null;
  blockId?: string | null;
  blockName?: string | null;
};

function isExpoPushToken(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /^ExponentPushToken\[.+\]$/.test(value) || /^ExpoPushToken\[.+\]$/.test(value);
}

function asPayload(value: unknown): DeliveryPayload {
  return value && typeof value === 'object' ? (value as DeliveryPayload) : {};
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function retryDelayMs(attemptCount: number) {
  const minutes = Math.min(2 ** Math.max(attemptCount - 1, 0), 30);
  return minutes * 60 * 1000;
}

function isPermanentExpoError(code: string | null | undefined) {
  return (
    code === 'DeviceNotRegistered' ||
    code === 'MessageTooBig' ||
    code === 'InvalidCredentials'
  );
}

async function markAttempted(rows: DeliveryRow[], attemptedAt: Date) {
  if (rows.length === 0) {
    return;
  }

  await db
    .update(notificationDeliveries)
    .set({
      attemptCount: sql`${notificationDeliveries.attemptCount} + 1`,
      lastAttemptAt: attemptedAt,
      updatedAt: attemptedAt,
    })
    .where(inArray(notificationDeliveries.id, rows.map((row) => row.id)));
}

async function scheduleRetry(
  rows: DeliveryRow[],
  attemptedAt: Date,
  reason: string,
) {
  let retried = 0;
  let failed = 0;

  for (const row of rows) {
    const attemptCount = row.attemptCount + 1;
    if (attemptCount >= MAX_ATTEMPTS) {
      await db
        .update(notificationDeliveries)
        .set({
          status: 'failed',
          failedAt: attemptedAt,
          reason,
          scheduledFor: null,
          updatedAt: attemptedAt,
        })
        .where(eq(notificationDeliveries.id, row.id));
      failed += 1;
      continue;
    }

    await db
      .update(notificationDeliveries)
      .set({
        status: 'pending',
        failedAt: null,
        scheduledFor: new Date(attemptedAt.getTime() + retryDelayMs(attemptCount)),
        reason: `${reason}_retry_${attemptCount}`,
        updatedAt: attemptedAt,
      })
      .where(eq(notificationDeliveries.id, row.id));
    retried += 1;
  }

  return { retried, failed };
}

async function markFailed(
  row: DeliveryRow,
  attemptedAt: Date,
  reason: string,
) {
  await db
    .update(notificationDeliveries)
    .set({
      status: 'failed',
      failedAt: attemptedAt,
      reason,
      scheduledFor: null,
      receiptCheckedAt: attemptedAt,
      updatedAt: attemptedAt,
    })
    .where(eq(notificationDeliveries.id, row.id));
}

async function markSent(
  row: DeliveryRow,
  attemptedAt: Date,
  ticketId: string | null,
) {
  const payload = asPayload(row.payload);

  await db
    .update(notificationDeliveries)
    .set({
      status: 'sent',
      sentAt: attemptedAt,
      reason: ticketId ? 'expo_ticket_ok' : 'expo_ticket_ok_without_id',
      scheduledFor: null,
      providerMessageId: ticketId,
      receiptCheckedAt: null,
      payload: {
        ...payload,
        expoTicketId: ticketId,
      },
      updatedAt: attemptedAt,
    })
    .where(eq(notificationDeliveries.id, row.id));
}

type SentReceiptRow = {
  id: string;
  orgId: string;
  profileId: string;
  providerMessageId: string | null;
  sentAt: Date | null;
};

async function loadPendingReceipts() {
  const receiptCutoff = new Date(Date.now() - RECEIPT_LOOKBACK_DELAY_MS);

  return db
    .select({
        id: notificationDeliveries.id,
        orgId: notificationDeliveries.orgId,
        profileId: notificationDeliveries.profileId,
        providerMessageId: notificationDeliveries.providerMessageId,
        sentAt: notificationDeliveries.sentAt,
      })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.channel, 'push'),
        eq(notificationDeliveries.status, 'sent'),
        isNull(notificationDeliveries.receiptCheckedAt),
        lte(notificationDeliveries.sentAt, receiptCutoff),
      ),
    )
    .orderBy(asc(notificationDeliveries.sentAt))
    .limit(RECEIPT_BATCH_LIMIT);
}

function isExpoReceiptOk(receipt: unknown) {
  return Boolean(
    receipt &&
      typeof receipt === 'object' &&
      (receipt as { status?: unknown }).status === 'ok',
  );
}

function getExpoReceiptErrorCode(receipt: unknown) {
  if (!receipt || typeof receipt !== 'object') {
    return null;
  }

  const details = (receipt as { details?: unknown }).details;
  if (!details || typeof details !== 'object') {
    return null;
  }

  return typeof (details as { error?: unknown }).error === 'string'
    ? (details as { error: string }).error
    : null;
}

function hasReceiptTimedOut(sentAt: Date | null, now: Date) {
  if (!sentAt) {
    return true;
  }

  return now.getTime() - sentAt.getTime() >= RECEIPT_TIMEOUT_MS;
}

async function markReceiptFailed(
  row: SentReceiptRow,
  attemptedAt: Date,
  reason: string,
) {
  await db
    .update(notificationDeliveries)
    .set({
      status: 'failed',
      failedAt: attemptedAt,
      receiptCheckedAt: attemptedAt,
      reason,
      updatedAt: attemptedAt,
    })
    .where(eq(notificationDeliveries.id, row.id));
}

export async function reconcileNotificationDeliveryReceipts() {
  const receiptRows = await loadPendingReceipts();
  if (receiptRows.length === 0) {
    return {
      pending: 0,
      confirmed: 0,
      failed: 0,
      missing: 0,
    };
  }

  const attemptedAt = new Date();
  const rowsWithoutTicketId = receiptRows.filter((row) => !row.providerMessageId);
  const rowsWithTicketId = receiptRows.filter((row): row is SentReceiptRow & { providerMessageId: string } => Boolean(row.providerMessageId));
  const receiptIds = receiptRows
    .map((row) => row.providerMessageId)
    .filter((value): value is string => Boolean(value));
  let confirmed = 0;
  let failed = 0;
  let missing = 0;
  let agedOut = 0;

  try {
    for (const row of rowsWithoutTicketId) {
      if (hasReceiptTimedOut(row.sentAt, attemptedAt)) {
        await markReceiptFailed(row, attemptedAt, 'expo_missing_ticket_id_timeout');
        failed += 1;
        agedOut += 1;
      } else {
        missing += 1;
      }
    }

    if (receiptIds.length === 0) {
      return {
        pending: receiptRows.length,
        confirmed,
        failed,
        missing,
        agedOut,
      };
    }

    const response = await fetch(EXPO_PUSH_RECEIPTS_API_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ ids: receiptIds }),
    });

    if (!response.ok) {
      return {
        pending: receiptRows.length,
        confirmed,
        failed,
        missing: missing + rowsWithTicketId.length,
        agedOut,
      };
    }

    const payload = await response.json();
    const receiptMap =
      payload?.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : {};

    for (const row of rowsWithTicketId) {
      const receipt = receiptMap[row.providerMessageId];
      if (!receipt) {
        if (hasReceiptTimedOut(row.sentAt, attemptedAt)) {
          await markReceiptFailed(row, attemptedAt, 'expo_receipt_timeout');
          failed += 1;
          agedOut += 1;
        } else {
          missing += 1;
        }
        continue;
      }

      if (isExpoReceiptOk(receipt)) {
        await db
          .update(notificationDeliveries)
          .set({
            receiptCheckedAt: attemptedAt,
            reason: 'expo_receipt_ok',
            updatedAt: attemptedAt,
          })
          .where(eq(notificationDeliveries.id, row.id));
        confirmed += 1;
        continue;
      }

      const errorCode = getExpoReceiptErrorCode(receipt);
      if (errorCode === 'DeviceNotRegistered') {
        await db
          .update(profiles)
          .set({
            expoPushToken: null,
            updatedAt: attemptedAt,
          })
          .where(eq(profiles.id, row.profileId));
      }

      await markReceiptFailed(
        row,
        attemptedAt,
        errorCode ? `expo_receipt_${errorCode}` : 'expo_receipt_error',
      );
      failed += 1;
    }
  } finally {
    const touchedOrgIds = Array.from(new Set(receiptRows.map((row) => row.orgId)));
    for (const orgId of touchedOrgIds) {
      await publishNotificationSnapshot(orgId, {
        reason: 'notification_delivery_receipts',
        confirmed,
        failed,
        missing,
        agedOut,
      });
    }
  }

  return {
    pending: receiptRows.length,
    confirmed,
    failed,
    missing,
    agedOut,
  };
}

function buildExpoMessage(row: DeliveryRow) {
  const payload = asPayload(row.payload);
  const title = typeof payload.title === 'string' ? payload.title : null;
  const body = typeof payload.body === 'string' ? payload.body : null;

  if (!title || !body || !isExpoPushToken(row.expoPushToken)) {
    return null;
  }

  return {
    to: row.expoPushToken,
    title,
    body,
    sound: 'default',
    priority: payload.urgency === 'urgent' ? 'high' : 'default',
    data: {
      notificationId:
        typeof payload.notificationId === 'string'
          ? payload.notificationId
          : row.notificationId,
      route: '/intelligence',
      sourceCategory: payload.sourceCategory ?? null,
      urgency: payload.urgency ?? null,
      blockId: payload.blockId ?? null,
      blockName: payload.blockName ?? null,
    },
  };
}

async function loadDueDeliveries() {
  return db
    .select({
      id: notificationDeliveries.id,
      orgId: notificationDeliveries.orgId,
      notificationId: notificationDeliveries.notificationId,
      profileId: notificationDeliveries.profileId,
      status: notificationDeliveries.status,
      attemptCount: notificationDeliveries.attemptCount,
      payload: notificationDeliveries.payload,
      expoPushToken: profiles.expoPushToken,
    })
    .from(notificationDeliveries)
    .innerJoin(profiles, eq(profiles.id, notificationDeliveries.profileId))
    .where(
      and(
        eq(notificationDeliveries.channel, 'push'),
        or(
          eq(notificationDeliveries.status, 'pending'),
          eq(notificationDeliveries.status, 'deferred'),
        ),
        or(
          isNull(notificationDeliveries.scheduledFor),
          lte(notificationDeliveries.scheduledFor, new Date()),
        ),
      ),
    )
    .orderBy(asc(notificationDeliveries.scheduledFor), asc(notificationDeliveries.createdAt))
    .limit(SEND_BATCH_LIMIT);
}

export async function processDueNotificationDeliveries() {
  const dueDeliveries = await loadDueDeliveries();
  if (dueDeliveries.length === 0) {
    return {
      due: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      invalid: 0,
    };
  }

  const invalidRows = dueDeliveries.filter((row) => !buildExpoMessage(row));
  const validRows = dueDeliveries.filter((row) => Boolean(buildExpoMessage(row)));
  const attemptedAt = new Date();
  const touchedOrgIds = new Set<string>();
  let sent = 0;
  let retried = 0;
  let failed = 0;

  for (const row of invalidRows) {
    touchedOrgIds.add(row.orgId);
    await markFailed(row, attemptedAt, isExpoPushToken(row.expoPushToken) ? 'invalid_payload' : 'invalid_push_token');
  }

  for (const batch of chunkArray(validRows, SEND_BATCH_LIMIT)) {
    if (batch.length === 0) {
      continue;
    }

    batch.forEach((row) => touchedOrgIds.add(row.orgId));
    await markAttempted(batch, attemptedAt);

    const messages = batch.map((row) => buildExpoMessage(row)!);
    try {
      const response = await fetch(EXPO_PUSH_API_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const retryResult = await scheduleRetry(batch, attemptedAt, `expo_http_${response.status}`);
        retried += retryResult.retried;
        failed += retryResult.failed;
        continue;
      }

      const payload = await response.json();
      const tickets = Array.isArray(payload?.data) ? payload.data : null;

      if (!tickets || tickets.length !== batch.length) {
        const retryResult = await scheduleRetry(batch, attemptedAt, 'expo_invalid_response');
        retried += retryResult.retried;
        failed += retryResult.failed;
        continue;
      }

      for (let index = 0; index < batch.length; index += 1) {
        const row = batch[index];
        const ticket = tickets[index];

        if (ticket?.status === 'ok') {
          await markSent(row, attemptedAt, typeof ticket.id === 'string' ? ticket.id : null);
          sent += 1;
          continue;
        }

        const errorCode =
          typeof ticket?.details?.error === 'string' ? ticket.details.error : null;

        if (errorCode === 'DeviceNotRegistered') {
          await db
            .update(profiles)
            .set({
              expoPushToken: null,
              updatedAt: attemptedAt,
            })
            .where(eq(profiles.id, row.profileId));
        }

        if (isPermanentExpoError(errorCode)) {
          await markFailed(
            row,
            attemptedAt,
            errorCode ? `expo_${errorCode}` : 'expo_permanent_error',
          );
          failed += 1;
          continue;
        }

        const retryResult = await scheduleRetry(
          [row],
          attemptedAt,
          errorCode ? `expo_${errorCode}` : 'expo_transient_error',
        );
        retried += retryResult.retried;
        failed += retryResult.failed;
      }
    } catch (error) {
      const retryResult = await scheduleRetry(
        batch,
        attemptedAt,
        error instanceof Error ? 'expo_request_failed' : 'expo_unknown_failure',
      );
      retried += retryResult.retried;
      failed += retryResult.failed;
    }
  }

  for (const orgId of touchedOrgIds) {
    await publishNotificationSnapshot(orgId, {
      reason: 'notification_delivery_send',
      sent,
      retried,
      failed,
      invalid: invalidRows.length,
    });
  }

  return {
    due: dueDeliveries.length,
    sent,
    retried,
    failed,
    invalid: invalidRows.length,
  };
}
