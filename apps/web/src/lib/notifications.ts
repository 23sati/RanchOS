export type NotificationUrgency = 'info' | 'suggestion' | 'warning' | 'urgent' | null;
export type NotificationSourceCategory = 'tasks' | 'pest' | 'irrigation' | 'compliance' | 'seasonal';

export type NotificationRecord = {
  id: string;
  orgId: string;
  recommendationId: string | null;
  notificationType: 'forecast_recommendation' | 'frost_alert';
  titleEn: string;
  titleEs: string;
  bodyEn: string;
  bodyEs: string;
  urgency: NotificationUrgency;
  sourceCategory: NotificationSourceCategory;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type NotificationsPayload = {
  items: NotificationRecord[];
  unreadCount: number;
};

export type NotificationAction = 'read' | 'archive' | 'unread';
export type NotificationDeliveryStatus = 'pending' | 'deferred' | 'sent' | 'failed' | 'canceled';
export type NotificationDeliveryHistoryStatusFilter = NotificationDeliveryStatus | 'all';
export type NotificationDeliveryHistoryReasonGroup =
  | 'all'
  | 'receipt_failure'
  | 'timeout'
  | 'device'
  | 'receipt_confirmed';

export type NotificationDeliverySummary = {
  pending: number;
  deferred: number;
  sent: number;
  failed: number;
  canceled: number;
  receiptConfirmed: number;
  sentAwaitingReceipt: number;
  recipients: number;
  pushConfiguredProfiles: number;
};

export type NotificationDeliverySettings = {
  id: string | null;
  orgId: string;
  timezone: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  urgentOnly: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type NotificationPreferencesPayload = {
  settings: NotificationDeliverySettings;
  deliverySummary: NotificationDeliverySummary;
};

export type NotificationDeliveryHistoryItem = {
  id: string;
  notificationId: string;
  profileId: string;
  profileName: string;
  status: NotificationDeliveryStatus;
  channel: 'push' | 'email';
  reason: string | null;
  attemptCount: number;
  scheduledFor: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
  receiptCheckedAt: string | null;
  providerMessageId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  notificationTitleEn: string;
  notificationUrgency: NotificationUrgency;
  sourceCategory: NotificationSourceCategory;
  hasPushToken: boolean;
};

export type NotificationDeliveryHistoryPayload = {
  filters: {
    status: NotificationDeliveryHistoryStatusFilter;
    reasonGroup: NotificationDeliveryHistoryReasonGroup;
    limit: number;
  };
  opsSummary: {
    windowDays: number;
    receiptFailures: number;
    timeouts: number;
    deviceIssues: number;
    receiptConfirmed: number;
  };
  items: NotificationDeliveryHistoryItem[];
};

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
    ...init,
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Request failed.');
  }

  return payload as T;
}

export async function fetchNotifications() {
  return request<NotificationsPayload>('/api/v1/notifications', {
    method: 'GET',
  });
}

export async function updateNotificationStatus(id: string, action: NotificationAction) {
  return request<{
    id: string;
    action: NotificationAction;
    readAt: string | null;
    archivedAt: string | null;
    unreadCount: number;
  }>(`/api/v1/notifications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
}

export async function markAllNotificationsRead() {
  return request<NotificationsPayload>('/api/v1/notifications/read-all', {
    method: 'POST',
  });
}

export async function fetchNotificationPreferences() {
  return request<NotificationPreferencesPayload>('/api/v1/notifications/preferences', {
    method: 'GET',
  });
}

export async function updateNotificationPreferences(input: {
  pushEnabled: boolean;
  emailEnabled: boolean;
  urgentOnly: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}) {
  return request<
    NotificationPreferencesPayload & {
      sync: {
        inserted: number;
        updated: number;
        canceled: number;
      };
    }
  >('/api/v1/notifications/preferences', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function fetchNotificationDeliveryHistory(input?: {
  status?: NotificationDeliveryHistoryStatusFilter;
  reasonGroup?: NotificationDeliveryHistoryReasonGroup;
  limit?: number;
}) {
  const params = new URLSearchParams();

  if (input?.status && input.status !== 'all') {
    params.set('status', input.status);
  }

  if (input?.reasonGroup && input.reasonGroup !== 'all') {
    params.set('reasonGroup', input.reasonGroup);
  }

  if (input?.limit) {
    params.set('limit', String(input.limit));
  }

  const query = params.toString();
  return request<NotificationDeliveryHistoryPayload>(
    `/api/v1/notifications/preferences/history${query ? `?${query}` : ''}`,
    {
      method: 'GET',
    },
  );
}

export function formatNotificationDate(value: string | null) {
  if (!value) {
    return 'Now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatNotificationDeliveryReason(reason: string | null) {
  if (!reason) {
    return 'No reason recorded';
  }

  return reason
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
