'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Copy, Download, KeyRound, Save, ShieldCheck, ShieldOff, Waypoints } from 'lucide-react';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import {
  AdvisorKeyRecord,
  AdvisorKeysPayload,
  AdvisorSnapshotPayload,
  createAdvisorKey,
  fetchAdvisorKeys,
  fetchAdvisorPreview,
  formatAdvisorDate,
  formatAdvisorDateOnly,
  formatAdvisorScopeLabel,
  revokeAdvisorKey,
} from '@/lib/advisor';

const EMPTY_KEYS: AdvisorKeysPayload = {
  availableScopes: ['advisor:read'],
  keys: [],
};

const EMPTY_PREVIEW: AdvisorSnapshotPayload = {
  generatedAt: new Date().toISOString(),
  organization: {
    id: '',
    name: '',
    slug: '',
    timezone: 'America/Los_Angeles',
    locale: 'en',
    primaryCrop: null,
  },
  ranches: [],
  summary: {
    ranches: 0,
    totalBlocks: 0,
    activeBlocks: 0,
    openTasks: 0,
    inProgressTasks: 0,
    overdueTasks: 0,
    dueTodayTasks: 0,
    completedTasks: 0,
    scoutingThisWeek: 0,
    irrigationNext7Days: 0,
    activeRecommendations: 0,
    urgentRecommendations: 0,
    unreadNotifications: 0,
  },
  recentTasks: [],
  recentScouting: [],
  urgentRecommendations: [],
};

const DAY_IN_MS = 1000 * 60 * 60 * 24;

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <h2 className="mt-2 text-3xl font-bold text-gray-900">{value}</h2>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function buildExpiryPreset(days: number) {
  const target = new Date();
  target.setHours(12, 0, 0, 0);
  target.setDate(target.getDate() + days);
  return target.toISOString().slice(0, 10);
}

function daysUntilDate(value: string | null) {
  if (!value) {
    return null;
  }

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / DAY_IN_MS);
}

function formatRelativeDays(days: number) {
  if (days === 0) {
    return 'today';
  }

  if (days > 0) {
    return `in ${days} day${days === 1 ? '' : 's'}`;
  }

  const absoluteDays = Math.abs(days);
  return `${absoluteDays} day${absoluteDays === 1 ? '' : 's'} ago`;
}

function formatSnapshotLabel(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  return value
    .split('_')
    .map((part) => (part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

function buildSnapshotExcerpt(preview: AdvisorSnapshotPayload) {
  return JSON.stringify(
    {
      generatedAt: preview.generatedAt,
      organization: {
        name: preview.organization.name,
        timezone: preview.organization.timezone,
        primaryCrop: preview.organization.primaryCrop,
      },
      summary: preview.summary,
      recentTasks: preview.recentTasks.slice(0, 2),
      recentScouting: preview.recentScouting.slice(0, 2),
      urgentRecommendations: preview.urgentRecommendations.slice(0, 2),
    },
    null,
    2,
  );
}

function keyStatus(record: AdvisorKeyRecord) {
  const daysUntilExpiry = daysUntilDate(record.expiresAt);

  if (record.revokedAt) {
    return { label: 'Revoked', className: 'bg-stone-100 text-stone-700' };
  }

  if (daysUntilExpiry !== null && daysUntilExpiry < 0) {
    return { label: 'Expired', className: 'bg-red-100 text-red-800' };
  }

  if (daysUntilExpiry !== null && daysUntilExpiry <= 14) {
    return { label: 'Expiring soon', className: 'bg-amber-100 text-amber-800' };
  }

  if (!record.lastUsedAt) {
    return { label: 'Unused', className: 'bg-sky-100 text-sky-800' };
  }

  return { label: 'Active', className: 'bg-emerald-100 text-emerald-800' };
}

function describeKeyLifecycle(record: AdvisorKeyRecord) {
  if (record.revokedAt) {
    return `Revoked ${formatAdvisorDate(record.revokedAt)}. Share a newly-created key if this advisor still needs access.`;
  }

  const daysUntilExpiry = daysUntilDate(record.expiresAt);
  const usageLabel = record.lastUsedAt ? `Last used ${formatAdvisorDate(record.lastUsedAt)}.` : 'Has not been used yet.';

  if (daysUntilExpiry !== null && daysUntilExpiry < 0) {
    return `Expired ${formatRelativeDays(daysUntilExpiry)}. ${usageLabel}`;
  }

  if (daysUntilExpiry !== null && daysUntilExpiry <= 14) {
    return `Expires ${formatRelativeDays(daysUntilExpiry)}. ${usageLabel}`;
  }

  if (record.expiresAt) {
    return `Expires ${formatAdvisorDate(record.expiresAt)}. ${usageLabel}`;
  }

  return `${usageLabel} No expiration is set, so rotate this key manually if the advisor relationship changes.`;
}

export default function AdvisorSettingsPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [keysPayload, setKeysPayload] = useState<AdvisorKeysPayload>(EMPTY_KEYS);
  const [preview, setPreview] = useState<AdvisorSnapshotPayload>(EMPTY_PREVIEW);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [origin, setOrigin] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const [handoffMessage, setHandoffMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const onboardingStatus = await fetchOnboardingStatus();
        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);

        if (!onboardingStatus.organization || onboardingStatus.profile?.role === 'crew') {
          return;
        }

        const [keys, snapshotPreview] = await Promise.all([fetchAdvisorKeys(), fetchAdvisorPreview()]);
        if (cancelled) {
          return;
        }

        setKeysPayload(keys);
        setPreview(snapshotPreview);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load advisor access.');
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
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const activeKeys = useMemo(
    () => keysPayload.keys.filter((record) => !record.revokedAt && (!record.expiresAt || new Date(record.expiresAt) > new Date())),
    [keysPayload.keys],
  );
  const expiringSoonKeys = useMemo(
    () => activeKeys.filter((record) => {
      const daysUntilExpiry = daysUntilDate(record.expiresAt);
      return daysUntilExpiry !== null && daysUntilExpiry <= 14;
    }),
    [activeKeys],
  );
  const unusedKeys = useMemo(() => activeKeys.filter((record) => !record.lastUsedAt), [activeKeys]);
  const snapshotPath = '/api/v1/advisor/snapshot';
  const snapshotUrl = origin ? `${origin}${snapshotPath}` : snapshotPath;
  const snapshotExcerpt = useMemo(() => buildSnapshotExcerpt(preview), [preview]);

  const handleCreateKey = async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    setCreatedToken('');
    setHandoffMessage('');

    try {
      const created = await createAdvisorKey({ name, expiresAt });
      const [keys, snapshotPreview] = await Promise.all([fetchAdvisorKeys(), fetchAdvisorPreview()]);
      setKeysPayload(keys);
      setPreview(snapshotPreview);
      setCreatedToken(created.token);
      setName('');
      setExpiresAt('');
      setSuccessMessage('Advisor API key created. Copy it now because it is only shown once.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create advisor key.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    setErrorMessage('');
    setSuccessMessage('');
    setCreatedToken('');
    setHandoffMessage('');

    try {
      await revokeAdvisorKey(id);
      const keys = await fetchAdvisorKeys();
      setKeysPayload(keys);
      setSuccessMessage('Advisor API key revoked.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to revoke advisor key.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async (label: string, value: string) => {
    setErrorMessage('');

    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this browser.');
      }

      await navigator.clipboard.writeText(value);
      setHandoffMessage(`${label} copied to your clipboard.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const handleDownloadSnapshot = () => {
    setErrorMessage('');

    try {
      if (typeof window === 'undefined') {
        throw new Error('Snapshot download is unavailable in this environment.');
      }

      const blob = new Blob([JSON.stringify(preview, null, 2)], {
        type: 'application/json',
      });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      const stamp = preview.generatedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);

      link.href = blobUrl;
      link.download = `${preview.organization.slug || 'advisor-snapshot'}-${stamp}.json`;
      link.click();

      window.URL.revokeObjectURL(blobUrl);
      setHandoffMessage('Current advisor snapshot preview downloaded as JSON.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download the advisor snapshot.');
    }
  };

  const curlExample = `curl -H "X-API-Key: ${createdToken || 'YOUR_API_KEY'}" ${snapshotUrl}`;

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading advisor access...</div>;
  }

  if (!status?.organization) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Finish onboarding first</h1>
          <p className="mt-2 text-sm text-gray-600">Advisor access unlocks after the workspace is connected to an organization.</p>
          <Link href="/onboarding" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            Return to onboarding
          </Link>
        </div>
      </div>
    );
  }

  if (status.profile?.role === 'crew') {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Manager access required</h1>
          <p className="mt-2 text-sm text-gray-700">Crew roles can use RanchOS operations, but only managers or owners can create external advisor API keys.</p>
          <Link href="/settings" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
            Back to settings
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8 animate-fade-in">
      <div className="flex flex-col gap-4 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Advisor</p>
          <h1 className="text-3xl font-bold text-gray-900">Advisor API access</h1>
          <p className="text-sm text-gray-600">Create org-scoped API keys for a read-only operational snapshot built on the current persisted RanchOS data.</p>
        </div>
        <Link href="/settings" className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700">
          Back to settings
          <ArrowRight className="h-4 w-4" />
        </Link>
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

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Active Keys" value={activeKeys.length} detail="Usable advisor credentials right now" />
        <MetricCard label="Expiring Soon" value={expiringSoonKeys.length} detail="Active keys expiring within the next 14 days" />
        <MetricCard label="Never Used" value={unusedKeys.length} detail="Active keys that have not been used yet" />
        <MetricCard label="Urgent Recs" value={preview.summary.urgentRecommendations} detail="Live urgent recommendations advisors can see" />
        <MetricCard label="Open Tasks" value={preview.summary.openTasks + preview.summary.inProgressTasks + preview.summary.overdueTasks} detail="Pending field work across the org snapshot" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-8">
          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Create advisor key</h2>
              <p className="mt-1 text-sm text-gray-500">This first slice issues one read-only `advisor:read` key for a compact operational digest.</p>
            </div>

            <div className="grid gap-4 p-6">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900">Key name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  placeholder="PCA advisor access"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900">Expires on</span>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                />
              </label>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setExpiresAt(buildExpiryPreset(30))}
                    className="rounded-full border border-ranch-border px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    30 days
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpiresAt(buildExpiryPreset(90))}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    90 days recommended
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpiresAt(buildExpiryPreset(180))}
                    className="rounded-full border border-ranch-border px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    180 days
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpiresAt('')}
                    className="rounded-full border border-ranch-border px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    No expiry
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Time-box advisor shares when you can. A 90-day rotation keeps external access clear without changing the read-only snapshot model.
                </p>
              </div>

              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
                <p className="font-semibold text-gray-900">Included scope</p>
                <p className="mt-2">{formatAdvisorScopeLabel('advisor:read')}</p>
                <p className="mt-1 text-gray-600">Read-only org snapshot with ranch, task, scouting, irrigation, recommendation, and notification summary data.</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-ranch-border px-6 py-4">
              <p className="text-sm text-gray-500">The plain-text key is only returned once after creation.</p>
              <button
                type="button"
                onClick={() => void handleCreateKey()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Creating...' : 'Create key'}
              </button>
            </div>
          </div>

          {createdToken ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div className="space-y-3">
                   <div>
                     <h2 className="font-semibold text-gray-900">Copy this key now</h2>
                     <p className="mt-1 text-sm text-gray-700">RanchOS stores only the hash after creation, so this is the only time the raw token is shown.</p>
                   </div>
                   <pre className="overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-emerald-100">{createdToken}</pre>
                   <div className="flex flex-wrap gap-3">
                     <button
                       type="button"
                       onClick={() => void handleCopy('Advisor key', createdToken)}
                       className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                     >
                       <Copy className="h-4 w-4" />
                       Copy key
                     </button>
                     <p className="self-center text-xs text-emerald-800">Send the raw key through a password manager or another secure channel, not a shared document.</p>
                   </div>
                 </div>
               </div>
             </div>
          ) : null}

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Existing keys</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Revoke old keys instead of reusing shared credentials. {expiringSoonKeys.length} expiring soon, {unusedKeys.length} never used.
                </p>
              </div>

              <div className="divide-y">
              {keysPayload.keys.length === 0 ? (
                <div className="px-6 py-8 text-sm text-gray-600">No advisor API keys created yet.</div>
              ) : (
                keysPayload.keys.map((record) => {
                  const statusChip = keyStatus(record);

                  return (
                    <div key={record.id} className="space-y-3 px-6 py-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{record.name}</p>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusChip.className}`}>
                              {statusChip.label}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <span>{record.scopes.map((scope) => formatAdvisorScopeLabel(scope)).join(', ')}</span>
                            <span>Created {formatAdvisorDate(record.createdAt)}</span>
                            <span>Last used {formatAdvisorDate(record.lastUsedAt)}</span>
                            {record.expiresAt ? <span>Expires {formatAdvisorDate(record.expiresAt)}</span> : <span>No expiration</span>}
                          </div>
                          <p className="text-sm text-gray-500">{describeKeyLifecycle(record)}</p>
                        </div>

                        {!record.revokedAt ? (
                          <button
                            type="button"
                            onClick={() => void handleRevoke(record.id)}
                            disabled={revokingId === record.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-ranch-border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <ShieldOff className="h-4 w-4" />
                            {revokingId === record.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">External handoff</h2>
                <p className="mt-1 text-sm text-gray-500">Share the existing read-only snapshot path clearly instead of creating a second advisor access route.</p>
              </div>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <Waypoints className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
                <p><span className="font-semibold">Organization:</span> {preview.organization.name || status.organization.name}</p>
                <p><span className="font-semibold">Timezone:</span> {preview.organization.timezone}</p>
                <p><span className="font-semibold">Generated:</span> {formatAdvisorDate(preview.generatedAt)}</p>
                <p><span className="font-semibold">Snapshot endpoint:</span> {snapshotUrl}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleCopy('Snapshot endpoint', snapshotUrl)}
                  className="inline-flex items-center gap-2 rounded-lg border border-ranch-border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Copy className="h-4 w-4" />
                  Copy endpoint
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopy('cURL example', curlExample)}
                  className="inline-flex items-center gap-2 rounded-lg border border-ranch-border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Copy className="h-4 w-4" />
                  Copy curl
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSnapshot}
                  className="inline-flex items-center gap-2 rounded-lg border border-ranch-border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Download current JSON
                </button>
              </div>

              {handoffMessage ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {handoffMessage}
                </div>
              ) : null}

              <pre className="overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-sky-100">{curlExample}</pre>

              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                <p className="font-semibold">Keep the access path simple</p>
                <p className="mt-2">
                  Use advisor keys for read-only sharing of the persisted RanchOS snapshot. If the workflow needs a logged external push for spray records, keep that on the
                  {' '}
                  <Link href="/settings/agworld" className="font-semibold underline underline-offset-2">
                    AgWorld integration
                  </Link>
                  {' '}
                  instead of widening this advisor surface.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Preview summary</h2>
              <p className="mt-1 text-sm text-gray-500">This preview uses the same persisted org snapshot the external advisor key reads.</p>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Blocks</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{preview.summary.activeBlocks}</p>
                <p className="mt-1 text-sm text-gray-500">{preview.summary.totalBlocks} total blocks in the org</p>
              </div>
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Scouting This Week</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{preview.summary.scoutingThisWeek}</p>
                <p className="mt-1 text-sm text-gray-500">Recent field observations visible to the advisor</p>
              </div>
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Irrigation Next 7 Days</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{preview.summary.irrigationNext7Days}</p>
                <p className="mt-1 text-sm text-gray-500">Scheduled, running, or problem irrigation events</p>
              </div>
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Active Recommendations</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{preview.summary.activeRecommendations}</p>
                <p className="mt-1 text-sm text-gray-500">{preview.summary.urgentRecommendations} urgent right now</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Snapshot excerpt</h2>
              <p className="mt-1 text-sm text-gray-500">A quick read-only sample of the same JSON an external advisor key can fetch.</p>
            </div>

            <div className="p-6">
              <pre className="max-h-[24rem] overflow-auto rounded-xl bg-gray-900 p-4 text-xs text-sky-100">{snapshotExcerpt}</pre>
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Included ranches</h2>
              <p className="mt-1 text-sm text-gray-500">Every advisor snapshot stays org-scoped and lists the ranches currently represented.</p>
            </div>

            <div className="divide-y">
              {preview.ranches.length === 0 ? (
                <div className="px-6 py-8 text-sm text-gray-600">No ranches are included in the advisor snapshot yet.</div>
              ) : (
                preview.ranches.map((ranch) => (
                  <div key={ranch.id} className="px-6 py-4">
                    <p className="font-semibold text-gray-900">{ranch.name}</p>
                    <p className="mt-1 text-sm text-gray-600">{ranch.county ? `${ranch.county} County` : 'County not set'}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Recent scouting</h2>
              <p className="mt-1 text-sm text-gray-500">Recent field observations already present in the persisted advisor snapshot.</p>
            </div>

            <div className="divide-y">
              {preview.recentScouting.length === 0 ? (
                <div className="px-6 py-8 text-sm text-gray-600">No scouting observations are included in the current advisor snapshot yet.</div>
              ) : (
                preview.recentScouting.map((log) => (
                  <div key={log.id} className="px-6 py-4">
                    <p className="font-semibold text-gray-900">{log.pestLabel}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-600">
                      <span>{log.blockName}</span>
                      <span>{formatSnapshotLabel(log.rating)}</span>
                      <span>{formatAdvisorDate(log.scoutedAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-gray-600" />
                <h2 className="font-semibold text-gray-900">Recent tasks</h2>
              </div>
            </div>

            <div className="divide-y">
              {preview.recentTasks.length === 0 ? (
                <div className="px-6 py-8 text-sm text-gray-600">No task data in the current advisor snapshot yet.</div>
              ) : (
                preview.recentTasks.map((task) => (
                  <div key={task.id} className="px-6 py-4">
                    <p className="font-semibold text-gray-900">{task.title}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-600">
                      <span>{task.status}</span>
                      <span>{task.priority}</span>
                      <span>Due {formatAdvisorDateOnly(task.dueDate)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Urgent recommendations</h2>
            </div>

            <div className="divide-y">
              {preview.urgentRecommendations.length === 0 ? (
                <div className="px-6 py-8 text-sm text-gray-600">No urgent or warning recommendations are active in this org right now.</div>
              ) : (
                preview.urgentRecommendations.map((recommendation) => (
                  <div key={recommendation.id} className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{recommendation.titleEn}</p>
                      <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                        {recommendation.urgency ?? 'info'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-600">
                      <span>{recommendation.blockName}</span>
                      <span>{recommendation.recommendationType}</span>
                      <span>{formatAdvisorDate(recommendation.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
