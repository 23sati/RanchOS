'use client';

import { useEffect, useState } from 'react';
import { BellRing, Save, Snowflake } from 'lucide-react';
import { subscribeToOrgEvents } from '@/lib/org-events';
import {
  fetchFrostWorkspace,
  formatFrostDate,
  formatFrostDateTime,
  formatFrostTemperature,
  formatMonitorHour,
  FrostWorkspacePayload,
  sendFrostTestAlert,
  updateFrostSettings,
} from '@/lib/frost';

const EMPTY_WORKSPACE: FrostWorkspacePayload = {
  organization: {
    id: '',
    name: 'Organization',
    timezone: 'America/Los_Angeles',
  },
  settings: {
    id: null,
    orgId: '',
    enabled: false,
    warningTempF: 34,
    dangerTempF: 29,
    monitorStartHour: 22,
    monitorEndHour: 8,
    notifyProfiles: [],
    createdAt: null,
    updatedAt: null,
  },
  summary: {
    totalCitrusBlocks: 0,
    linkedBlocks: 0,
    forecastCoverageBlocks: 0,
    warningBlocks: 0,
    dangerBlocks: 0,
    activeAlertBlocks: 0,
    selectedProfiles: 0,
    pushReadyProfiles: 0,
    withinMonitorWindow: false,
    monitoringTimeZone: 'America/Los_Angeles',
  },
  profiles: [],
  blocks: [],
  recentAlerts: [],
};

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <h2 className="mt-2 text-3xl font-bold text-gray-900">{value}</h2>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function riskTone(level: FrostWorkspacePayload['blocks'][number]['riskLevel']) {
  if (level === 'danger') {
    return 'bg-red-100 text-red-800';
  }

  if (level === 'warning') {
    return 'bg-amber-100 text-amber-800';
  }

  if (level === 'needs_station' || level === 'no_forecast') {
    return 'bg-stone-100 text-stone-700';
  }

  return 'bg-emerald-100 text-emerald-800';
}

function riskLabel(level: FrostWorkspacePayload['blocks'][number]['riskLevel']) {
  if (level === 'danger') {
    return 'Danger';
  }

  if (level === 'warning') {
    return 'Warning';
  }

  if (level === 'needs_station') {
    return 'Needs station';
  }

  if (level === 'no_forecast') {
    return 'No forecast';
  }

  return 'Clear';
}

export default function FrostAlertSettings() {
  const [workspace, setWorkspace] = useState<FrostWorkspacePayload>(EMPTY_WORKSPACE);
  const [formValues, setFormValues] = useState(EMPTY_WORKSPACE.settings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const applyWorkspace = (nextWorkspace: FrostWorkspacePayload, options: { resetForm?: boolean } = {}) => {
    setWorkspace(nextWorkspace);
    if (options.resetForm) {
      setFormValues(nextWorkspace.settings);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadWorkspace = async () => {
      try {
        const payload = await fetchFrostWorkspace();
        if (cancelled) {
          return;
        }

        applyWorkspace(payload, { resetForm: true });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load frost settings.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspace.organization.id) {
      return;
    }

    let cancelled = false;
    let refreshInFlight = false;

    const refreshWorkspace = async () => {
      if (refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      setLiveRefreshing(true);

      try {
        const payload = await fetchFrostWorkspace();
        if (!cancelled) {
          applyWorkspace(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh frost activity.');
        }
      } finally {
        refreshInFlight = false;
        if (!cancelled) {
          setLiveRefreshing(false);
        }
      }
    };

    const unsubscribe = subscribeToOrgEvents(workspace.organization.id, (event) => {
      if (event.type === 'notifications_updated') {
        void refreshWorkspace();
      }
    }, {
      onPollingFallback: async () => {
        await refreshWorkspace();
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [workspace.organization.id]);

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = await updateFrostSettings({
        enabled: formValues.enabled,
        warningTempF: formValues.warningTempF,
        dangerTempF: formValues.dangerTempF,
        monitorStartHour: formValues.monitorStartHour,
        monitorEndHour: formValues.monitorEndHour,
        notifyProfiles: formValues.notifyProfiles,
      });

      applyWorkspace(payload, { resetForm: true });
      setSuccessMessage('Frost settings saved and alert state refreshed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save frost settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = await sendFrostTestAlert();
      applyWorkspace(payload);
      setSuccessMessage('Test frost alert created through the persisted notification pipeline.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send frost test alert.');
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading frost settings...</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8 animate-fade-in">
      <div className="flex flex-col gap-4 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Settings / Frost</p>
          <h1 className="text-3xl font-bold text-gray-900">{workspace.organization.name} frost workflow</h1>
          <p className="text-sm text-gray-600">
            Persisted frost settings, block risk visibility, and alert delivery now run on the same saved forecast and notification architecture as the rest of RanchOS.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSendTest()}
            disabled={sendingTest}
            className="inline-flex items-center gap-2 rounded-xl border border-ranch-border px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <BellRing className="h-4 w-4" />
            {sendingTest ? 'Sending test...' : 'Send test alert'}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save configuration'}
          </button>
        </div>
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

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Danger Blocks" value={workspace.summary.dangerBlocks} detail="Blocks below the critical threshold" />
        <MetricCard label="Warning Blocks" value={workspace.summary.warningBlocks} detail="Blocks nearing frost response temperature" />
        <MetricCard label="Linked Stations" value={workspace.summary.linkedBlocks} detail="Citrus blocks with CIMIS coverage" />
        <MetricCard
          label="Push Ready"
          value={workspace.summary.pushReadyProfiles}
          detail={`${workspace.summary.selectedProfiles} selected recipients${liveRefreshing ? ' • live refresh active' : ''}`}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-8">
          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Frost settings</h2>
              <p className="mt-1 text-sm text-gray-500">This persists to the current organization and drives the worker-based frost sync.</p>
            </div>

            <div className="space-y-6 p-6">
              <label className="flex items-center justify-between rounded-xl border border-ranch-border px-4 py-4">
                <div>
                  <p className="font-semibold text-gray-900">Enable frost monitoring</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {workspace.summary.withinMonitorWindow
                      ? `Monitoring window is active now in ${workspace.summary.monitoringTimeZone}.`
                      : `Outside the current monitoring window in ${workspace.summary.monitoringTimeZone}.`}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formValues.enabled}
                  onChange={(event) =>
                    setFormValues((current) => ({ ...current, enabled: event.target.checked }))
                  }
                  className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Warning threshold</span>
                  <input
                    type="number"
                    min="20"
                    max="45"
                    step="0.1"
                    value={formValues.warningTempF}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        warningTempF: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Danger threshold</span>
                  <input
                    type="number"
                    min="20"
                    max="45"
                    step="0.1"
                    value={formValues.dangerTempF}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        dangerTempF: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Monitor start</span>
                  <select
                    value={formValues.monitorStartHour}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        monitorStartHour: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                  >
                    {Array.from({ length: 24 }).map((_, hour) => (
                      <option key={hour} value={hour}>
                        {formatMonitorHour(hour)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Monitor end</span>
                  <select
                    value={formValues.monitorEndHour}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        monitorEndHour: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                  >
                    {Array.from({ length: 24 }).map((_, hour) => (
                      <option key={hour} value={hour}>
                        {formatMonitorHour(hour)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Dispatch roster</h2>
              <p className="mt-1 text-sm text-gray-500">Only selected profiles receive frost delivery rows when alerts are created.</p>
            </div>

            <div className="divide-y">
              {workspace.profiles.length === 0 ? (
                <div className="px-6 py-8 text-sm text-gray-600">No organization profiles are available yet.</div>
              ) : (
                workspace.profiles.map((profile) => {
                  const selected = formValues.notifyProfiles.includes(profile.id);

                  return (
                    <label key={profile.id} className="flex items-center justify-between gap-4 px-6 py-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-gray-900">{profile.fullName}</p>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                          <span>{profile.role}</span>
                          <span>{profile.hasPushToken ? 'Push ready' : 'No push token'}</span>
                          {profile.phone ? <span>{profile.phone}</span> : null}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            notifyProfiles: event.target.checked
                              ? [...current.notifyProfiles, profile.id]
                              : current.notifyProfiles.filter((profileId) => profileId !== profile.id),
                          }))
                        }
                        className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                    </label>
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
                <h2 className="font-semibold text-gray-900">Monitoring snapshot</h2>
                <p className="mt-1 text-sm text-gray-500">The worker reads saved forecasts from CIMIS-linked blocks and only raises alerts during the configured overnight window.</p>
              </div>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <Snowflake className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Forecast coverage</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{workspace.summary.forecastCoverageBlocks}</p>
                <p className="mt-1 text-sm text-gray-500">Blocks with a current saved forecast window</p>
              </div>
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Active alert blocks</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{workspace.summary.activeAlertBlocks}</p>
                <p className="mt-1 text-sm text-gray-500">Blocks with a currently active frost alert notification</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">At-risk citrus blocks</h2>
              <p className="mt-1 text-sm text-gray-500">Risk is based on the coldest saved forecast in the next few days for each linked station.</p>
            </div>

            <div className="divide-y">
              {workspace.blocks.length === 0 ? (
                <div className="px-6 py-8 text-sm text-gray-600">No active citrus blocks are configured yet.</div>
              ) : (
                workspace.blocks.map((block) => (
                  <div key={block.id} className="space-y-3 px-6 py-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-gray-900">{block.name}</p>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${riskTone(block.riskLevel)}`}>
                            {riskLabel(block.riskLevel)}
                          </span>
                          {block.hasActiveAlert ? (
                            <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                              Active alert
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                          <span>{block.cropType}</span>
                          <span>{block.variety}</span>
                          {block.stationName ? <span>{block.stationName}</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                          <span>Coldest forecast: {formatFrostTemperature(block.forecastMinTempF)}</span>
                          <span>{formatFrostDate(block.forecastDate)}</span>
                          <span>Wind: {block.forecastWindSpeedMph === null ? '--' : `${block.forecastWindSpeedMph.toFixed(1)} mph`}</span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        <p className="font-semibold text-gray-900">Next forecast window</p>
                        <div className="mt-2 space-y-1">
                          {block.forecastWindow.length === 0 ? (
                            <p>No forecast rows yet</p>
                          ) : (
                            block.forecastWindow.map((forecastRow) => (
                              <p key={`${block.id}-${forecastRow.forecastDate}`}>
                                {formatFrostDate(forecastRow.forecastDate)}: {formatFrostTemperature(forecastRow.minTempF)} / {formatFrostTemperature(forecastRow.maxTempF)}
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Recent frost alerts</h2>
              <p className="mt-1 text-sm text-gray-500">This is the same persisted notification feed that drives delivery rows and mobile push dispatch.</p>
            </div>

            <div className="divide-y">
              {workspace.recentAlerts.length === 0 ? (
                <div className="px-6 py-8 text-sm text-gray-600">No frost alerts have been created yet.</div>
              ) : (
                workspace.recentAlerts.map((alert) => (
                  <div key={alert.id} className="space-y-2 px-6 py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{alert.titleEn}</p>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${alert.urgency === 'urgent' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                        {alert.urgency ?? 'info'}
                      </span>
                      <span className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                        {alert.frostKind}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                      {alert.blockName ? <span>{alert.blockName}</span> : null}
                      {alert.forecastDate ? <span>{formatFrostDate(alert.forecastDate)}</span> : null}
                      {alert.forecastMinTempF !== null ? <span>{formatFrostTemperature(alert.forecastMinTempF)}</span> : null}
                      <span>{alert.targetProfileCount} recipients</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                      <span>Created {formatFrostDateTime(alert.createdAt)}</span>
                      {alert.readAt ? <span>Read {formatFrostDateTime(alert.readAt)}</span> : null}
                      {alert.archivedAt ? <span>Archived {formatFrostDateTime(alert.archivedAt)}</span> : null}
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
