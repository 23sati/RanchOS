'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, Save } from 'lucide-react';
import { subscribeToOrgEvents } from '@/lib/org-events';
import {
  fetchNotificationDeliveryHistory,
  fetchNotificationPreferences,
  formatNotificationDate,
  formatNotificationDeliveryReason,
  NotificationDeliveryHistoryPayload,
  NotificationDeliveryHistoryReasonGroup,
  NotificationDeliveryHistoryStatusFilter,
  NotificationDeliverySettings,
  NotificationDeliverySummary,
  updateNotificationPreferences,
} from '@/lib/notifications';

const DEFAULT_SETTINGS: NotificationDeliverySettings = {
  id: null,
  orgId: '',
  timezone: 'America/Los_Angeles',
  pushEnabled: true,
  emailEnabled: false,
  urgentOnly: true,
  quietHoursEnabled: true,
  quietHoursStart: '21:00',
  quietHoursEnd: '06:00',
  createdAt: null,
  updatedAt: null,
};

const DEFAULT_SUMMARY: NotificationDeliverySummary = {
  pending: 0,
  deferred: 0,
  sent: 0,
  failed: 0,
  canceled: 0,
  receiptConfirmed: 0,
  sentAwaitingReceipt: 0,
  recipients: 0,
  pushConfiguredProfiles: 0,
};

const DEFAULT_HISTORY: NotificationDeliveryHistoryPayload = {
  filters: {
    status: 'all',
    reasonGroup: 'all',
    limit: 12,
  },
  opsSummary: {
    windowDays: 7,
    receiptFailures: 0,
    timeouts: 0,
    deviceIssues: 0,
    receiptConfirmed: 0,
  },
  items: [],
};

const STATUS_OPTIONS: Array<{
  value: NotificationDeliveryHistoryStatusFilter;
  label: string;
}> = [
  { value: 'all', label: 'All statuses' },
  { value: 'failed', label: 'Failed only' },
  { value: 'sent', label: 'Sent only' },
  { value: 'pending', label: 'Pending only' },
  { value: 'deferred', label: 'Deferred only' },
  { value: 'canceled', label: 'Canceled only' },
];

const REASON_OPTIONS: Array<{
  value: NotificationDeliveryHistoryReasonGroup;
  label: string;
}> = [
  { value: 'all', label: 'All delivery events' },
  { value: 'receipt_failure', label: 'Failed receipts' },
  { value: 'timeout', label: 'Receipt timeouts' },
  { value: 'device', label: 'Dead token churn' },
  { value: 'receipt_confirmed', label: 'Receipt confirmed' },
];

function statusBadgeClass(status: string) {
  if (status === 'failed') {
    return 'bg-red-100 text-red-800';
  }

  if (status === 'sent') {
    return 'bg-sky-100 text-sky-800';
  }

  if (status === 'pending') {
    return 'bg-amber-100 text-amber-900';
  }

  if (status === 'deferred') {
    return 'bg-violet-100 text-violet-800';
  }

  return 'bg-stone-100 text-stone-700';
}

function urgencyBadgeClass(urgency: string | null) {
  if (urgency === 'urgent') {
    return 'bg-red-50 text-red-700';
  }

  if (urgency === 'warning') {
    return 'bg-amber-50 text-amber-800';
  }

  if (urgency === 'suggestion') {
    return 'bg-emerald-50 text-emerald-800';
  }

  return 'bg-stone-100 text-stone-700';
}

function mostRelevantDeliveryTime(item: NotificationDeliveryHistoryPayload['items'][number]) {
  return (
    item.failedAt ??
    item.receiptCheckedAt ??
    item.sentAt ??
    item.lastAttemptAt ??
    item.scheduledFor ??
    item.updatedAt ??
    item.createdAt
  );
}

function formatOptionalDate(value: string | null) {
  return value ? formatNotificationDate(value) : 'Not set';
}

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationDeliverySettings>(DEFAULT_SETTINGS);
  const [deliverySummary, setDeliverySummary] =
    useState<NotificationDeliverySummary>(DEFAULT_SUMMARY);
  const [deliveryHistory, setDeliveryHistory] =
    useState<NotificationDeliveryHistoryPayload>(DEFAULT_HISTORY);
  const [historyStatus, setHistoryStatus] =
    useState<NotificationDeliveryHistoryStatusFilter>('all');
  const [historyReasonGroup, setHistoryReasonGroup] =
    useState<NotificationDeliveryHistoryReasonGroup>('all');
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [liveRefreshing, setLiveRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const payload = await fetchNotificationPreferences();
        if (cancelled) {
          return;
        }

        setSettings(payload.settings);
        setDeliverySummary(payload.deliverySummary);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to load notification settings.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setHistoryLoading(true);

      try {
        const payload = await fetchNotificationDeliveryHistory({
          status: historyStatus,
          reasonGroup: historyReasonGroup,
          limit: DEFAULT_HISTORY.filters.limit,
        });
        if (cancelled) {
          return;
        }

        setDeliveryHistory(payload);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to load delivery history.',
          );
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [historyReasonGroup, historyStatus]);

  useEffect(() => {
    if (!settings.orgId) {
      return;
    }

    let cancelled = false;
    let refreshInFlight = false;

    const refreshLiveData = async () => {
      if (refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      setLiveRefreshing(true);

      try {
        const [preferencesPayload, historyPayload] = await Promise.all([
          fetchNotificationPreferences(),
          fetchNotificationDeliveryHistory({
            status: historyStatus,
            reasonGroup: historyReasonGroup,
            limit: DEFAULT_HISTORY.filters.limit,
          }),
        ]);
        if (cancelled) {
          return;
        }

        setSettings(preferencesPayload.settings);
        setDeliverySummary(preferencesPayload.deliverySummary);
        setDeliveryHistory(historyPayload);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to refresh live notification delivery activity.',
          );
        }
      } finally {
        refreshInFlight = false;
        if (!cancelled) {
          setLiveRefreshing(false);
        }
      }
    };

    const unsubscribe = subscribeToOrgEvents(settings.orgId, (event) => {
      if (event.type !== 'notifications_updated') {
        return;
      }

      void refreshLiveData();
    }, {
      onPollingFallback: async () => {
        await refreshLiveData();
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [historyReasonGroup, historyStatus, settings.orgId]);

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = await updateNotificationPreferences({
        pushEnabled: settings.pushEnabled,
        emailEnabled: settings.emailEnabled,
        urgentOnly: settings.urgentOnly,
        quietHoursEnabled: settings.quietHoursEnabled,
        quietHoursStart: settings.quietHoursStart,
        quietHoursEnd: settings.quietHoursEnd,
      });

      setSettings(payload.settings);
      setDeliverySummary(payload.deliverySummary);
      setSuccessMessage('Notification delivery settings saved.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save notification settings.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading notification settings...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto w-full flex flex-col gap-8 animate-fade-in">
      <div className="space-y-2">
        <Link href="/settings" className="text-sm font-medium text-green-700 hover:text-green-800">
          Back to settings
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Notification Delivery</h1>
        <p className="text-sm text-gray-600">
          Queue urgent intelligence alerts for push delivery, with quiet hours held in your org timezone.
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
              <BellRing className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-gray-900">Push controls</h2>
              <p className="text-sm text-gray-600">
                Push delivery uses the persisted notification outbox and respects your org quiet hours.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold text-gray-900">Push delivery</span>
                <input
                  type="checkbox"
                  checked={settings.pushEnabled}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, pushEnabled: event.target.checked }))
                  }
                  className="h-4 w-4"
                />
              </span>
              <span className="mt-2 block text-gray-600">
                Queue push-ready records for devices with saved Expo tokens.
              </span>
            </label>

            <label className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold text-gray-900">Urgent only</span>
                <input
                  type="checkbox"
                  checked={settings.urgentOnly}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, urgentOnly: event.target.checked }))
                  }
                  className="h-4 w-4"
                />
              </span>
              <span className="mt-2 block text-gray-600">
                Keep push delivery focused on the highest-signal alerts for now.
              </span>
            </label>

            <label className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold text-gray-900">Quiet hours</span>
                <input
                  type="checkbox"
                  checked={settings.quietHoursEnabled}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      quietHoursEnabled: event.target.checked,
                    }))
                  }
                  className="h-4 w-4"
                />
              </span>
              <span className="mt-2 block text-gray-600">
                Defer delivery records until the quiet window ends in {settings.timezone}.
              </span>
            </label>

            <label className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700 opacity-70">
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold text-gray-900">Email delivery</span>
                <input
                  type="checkbox"
                  checked={settings.emailEnabled}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, emailEnabled: event.target.checked }))
                  }
                  className="h-4 w-4"
                  disabled
                />
              </span>
              <span className="mt-2 block text-gray-600">
                Reserved for the next pass. Push outbox support lands first.
              </span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-gray-700">
              <span>Quiet hours start</span>
              <input
                type="time"
                value={settings.quietHoursStart}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, quietHoursStart: event.target.value }))
                }
                className="w-full rounded-lg border px-3 py-2"
                disabled={!settings.quietHoursEnabled}
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              <span>Quiet hours end</span>
              <input
                type="time"
                value={settings.quietHoursEnd}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, quietHoursEnd: event.target.value }))
                }
                className="w-full rounded-lg border px-3 py-2"
                disabled={!settings.quietHoursEnabled}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save delivery settings'}
          </button>
        </div>

        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Outbox</p>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-gray-900">Current queue health</h2>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
                {liveRefreshing ? 'Refreshing live...' : 'Live org stream'}
              </p>
            </div>
            <p className="text-sm text-gray-600">
              These counts track the full push path from queued work through Expo acceptance and receipt confirmation.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Recipients</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{deliverySummary.recipients}</p>
              <p className="mt-1 text-xs text-gray-500">
                {deliverySummary.pushConfiguredProfiles} profiles currently have push tokens saved.
              </p>
            </div>
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Pending now</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{deliverySummary.pending}</p>
              <p className="mt-1 text-xs text-gray-500">Ready for the next Expo sender sweep.</p>
            </div>
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Deferred</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{deliverySummary.deferred}</p>
              <p className="mt-1 text-xs text-gray-500">Held until the current quiet window ends.</p>
            </div>
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Accepted by Expo</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{deliverySummary.sent}</p>
              <p className="mt-1 text-xs text-gray-500">
                {deliverySummary.sentAwaitingReceipt} still waiting on receipt checks.
              </p>
            </div>
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Receipt Confirmed</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{deliverySummary.receiptConfirmed}</p>
              <p className="mt-1 text-xs text-gray-500">Expo receipts came back clean for these deliveries.</p>
            </div>
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Failed</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{deliverySummary.failed}</p>
              <p className="mt-1 text-xs text-gray-500">Permanent send or receipt failures that need attention.</p>
            </div>
          </div>

          <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Delivery Notes</p>
            <p className="mt-2">
              <span className="font-semibold text-gray-900">{deliverySummary.canceled}</span> canceled delivery
              {deliverySummary.canceled === 1 ? '' : ' records'} dropped out because alerts were read, archived, or no longer eligible.
            </p>
          </div>

          <div className="rounded-xl border border-ranch-border bg-amber-50 p-4 text-sm text-amber-900">
            Delivery scheduling uses the org timezone <span className="font-semibold">{settings.timezone}</span>.
            Expo handoff is now wired for push deliveries. Email stays deferred until later in Phase 4.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Ops</p>
            <h2 className="text-xl font-semibold text-gray-900">Recent delivery history</h2>
            <p className="text-sm text-gray-600">
              Filter recent delivery events by status or issue type to inspect failed receipts, timeouts, and dead-token churn without leaving RanchOS.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-gray-700">
              <span>Status</span>
              <select
                value={historyStatus}
                onChange={(event) =>
                  setHistoryStatus(event.target.value as NotificationDeliveryHistoryStatusFilter)
                }
                className="w-full rounded-lg border px-3 py-2"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              <span>Issue focus</span>
              <select
                value={historyReasonGroup}
                onChange={(event) =>
                  setHistoryReasonGroup(event.target.value as NotificationDeliveryHistoryReasonGroup)
                }
                className="w-full rounded-lg border px-3 py-2"
              >
                {REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Receipt failures
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {deliveryHistory.opsSummary.receiptFailures}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Last {deliveryHistory.opsSummary.windowDays} days of failed Expo receipt responses.
            </p>
          </div>
          <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Timeouts</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {deliveryHistory.opsSummary.timeouts}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Receipt checks that aged out without a usable Expo response.
            </p>
          </div>
          <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Device issues
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {deliveryHistory.opsSummary.deviceIssues}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Dead tokens or missing token failures in the last {deliveryHistory.opsSummary.windowDays} days.
            </p>
          </div>
          <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Receipt confirmed
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {deliveryHistory.opsSummary.receiptConfirmed}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Deliveries that came back clean from Expo receipt reconciliation.
            </p>
          </div>
        </div>

        {historyLoading ? (
          <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-6 text-sm text-gray-600">
            Loading recent delivery activity...
          </div>
        ) : deliveryHistory.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ranch-border bg-gray-50 px-4 py-6 text-sm text-gray-600">
            No delivery records match the current filters yet.
          </div>
        ) : (
          <div className="space-y-3">
            {deliveryHistory.items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(item.status)}`}>
                        {item.status}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${urgencyBadgeClass(item.notificationUrgency)}`}>
                        {item.notificationUrgency ?? 'info'}
                      </span>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                        {item.sourceCategory}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{item.notificationTitleEn}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {item.profileName} · {item.channel} delivery · attempts {item.attemptCount}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500">
                    {formatNotificationDate(mostRelevantDeliveryTime(item))}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Delivery reason
                    </p>
                    <p className="mt-1 text-sm text-gray-900">
                      {formatNotificationDeliveryReason(item.reason)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Device state
                    </p>
                    <p className="mt-1 text-sm text-gray-900">
                      {item.hasPushToken ? 'Push token still saved on profile.' : 'Push token no longer saved on profile.'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500">
                  <span>Scheduled: {formatOptionalDate(item.scheduledFor)}</span>
                  <span>Sent: {formatOptionalDate(item.sentAt)}</span>
                  <span>Receipt checked: {formatOptionalDate(item.receiptCheckedAt)}</span>
                  <span>Failed: {formatOptionalDate(item.failedAt)}</span>
                  {item.providerMessageId ? <span>Expo ticket: {item.providerMessageId}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
