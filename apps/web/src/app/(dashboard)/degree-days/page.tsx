'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Bug, CalendarDays, Droplets, Leaf, TriangleAlert } from 'lucide-react';
import { formatBlockCropLabel } from '@/lib/blocks';
import {
  DegreeDayDashboardPayload,
  DegreeDayStationModelRecord,
  fetchDegreeDayDashboard,
  formatDegreeDayDate,
  formatDegreeDayValue,
  formatProgressPercent,
  formatShortDegreeDayDate,
  subscribeToOrgEvents,
} from '@/lib/degree-days';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';

const emptyDashboard: DegreeDayDashboardPayload = {
  generatedAt: '',
  ranch: {
    id: '',
    name: '',
  },
  summary: {
    activeBlocks: 0,
    configuredBlocks: 0,
    trackedModels: 0,
    nearingThreshold: 0,
    reachedThreshold: 0,
    latestObservationDate: null,
  },
  blocks: [],
  stationModels: [],
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

function ProgressBar({ value }: { value: number | null }) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value * 100));
  const tone =
    value === null ? 'bg-gray-300' : value >= 1 ? 'bg-red-500' : value >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function selectedTone(value: number | null, isSelected: boolean) {
  if (!isSelected) {
    return 'border-ranch-border bg-white hover:border-sky-300 hover:bg-sky-50/40';
  }

  if (value !== null && value >= 1) {
    return 'border-red-200 bg-red-50';
  }

  if (value !== null && value >= 0.8) {
    return 'border-amber-200 bg-amber-50';
  }

  return 'border-sky-300 bg-sky-50';
}

function chartLineTone(value: number | null) {
  if (value !== null && value >= 1) {
    return '#dc2626';
  }

  if (value !== null && value >= 0.8) {
    return '#d97706';
  }

  return '#0284c7';
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  const cumulative = typeof payload[0]?.value === 'number' ? payload[0].value : null;
  const daily = typeof payload[1]?.value === 'number' ? payload[1].value : null;

  return (
    <div className="rounded-xl border border-ranch-border bg-white px-3 py-2 text-sm shadow-lg">
      <div className="font-semibold text-gray-900">{formatDegreeDayDate(label)}</div>
      <div className="mt-1 text-gray-600">Cumulative: {formatDegreeDayValue(cumulative, 0)} DD</div>
      <div className="text-gray-600">Daily: {formatDegreeDayValue(daily, 1)} DD</div>
    </div>
  );
}

function chartSummaryLabel(model: DegreeDayStationModelRecord | null) {
  if (!model) {
    return 'Choose a tracked model to review recent accumulation.';
  }

  if (!model.latestDate) {
    return 'This station is assigned to active blocks, but persisted degree-day rows have not landed yet.';
  }

  if ((model.progressRatio ?? 0) >= 1) {
    return 'This model has crossed its current action threshold.';
  }

  if ((model.progressRatio ?? 0) >= 0.8) {
    return 'This model is nearing threshold and should be watched closely.';
  }

  return 'This model is accumulating normally against the current threshold.';
}

export default function DegreeDaysPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dashboard, setDashboard] = useState<DegreeDayDashboardPayload>(emptyDashboard);
  const [selectedStationModelKey, setSelectedStationModelKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const onboardingStatus = await fetchOnboardingStatus();
        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);
        if (!onboardingStatus.ranch?.id) {
          return;
        }

        const payload = await fetchDegreeDayDashboard(onboardingStatus.ranch.id);
        if (cancelled) {
          return;
        }

        setDashboard(payload);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load degree-day dashboard.');
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
    if (!dashboard.stationModels.length) {
      setSelectedStationModelKey('');
      return;
    }

    if (!selectedStationModelKey || !dashboard.stationModels.some((model) => model.key === selectedStationModelKey)) {
      setSelectedStationModelKey(dashboard.stationModels[0].key);
    }
  }, [dashboard.stationModels, selectedStationModelKey]);

  useEffect(() => {
    if (!status?.profile?.orgId || !status.ranch?.id) {
      return;
    }

    let cancelled = false;
    let refreshInFlight = false;

    const refreshDashboard = async () => {
      if (refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      setRefreshing(true);

      try {
        const payload = await fetchDegreeDayDashboard(status.ranch!.id);
        if (!cancelled) {
          setDashboard(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh degree-day dashboard.');
        }
      } finally {
        refreshInFlight = false;
        if (!cancelled) {
          setRefreshing(false);
        }
      }
    };

    const unsubscribe = subscribeToOrgEvents(status.profile.orgId, (event) => {
      if (event.type !== 'intelligence_updated' || !event.includeEnvironmental) {
        return;
      }

      void refreshDashboard();
    }, {
      onPollingFallback: async () => {
        await refreshDashboard();
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [status?.profile?.orgId, status?.ranch?.id]);

  const selectedModel =
    dashboard.stationModels.find((model) => model.key === selectedStationModelKey) ?? dashboard.stationModels[0] ?? null;

  const chartData = selectedModel
    ? selectedModel.trend.map((point) => ({
        ...point,
        shortDate: formatShortDegreeDayDate(point.date),
      }))
    : [];

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading degree-day dashboard...</div>;
  }

  if (!status?.ranch) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">No ranch available yet</h1>
          <p className="mt-2 text-sm text-gray-600">Finish onboarding before reviewing seasonal degree-day timing.</p>
          <Link
            href="/onboarding"
            className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Return to onboarding
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8 animate-fade-in">
      <div className="flex flex-col gap-4 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Degree Days</p>
          <h1 className="text-3xl font-bold text-gray-900">{status.ranch.name} seasonal timing</h1>
          <p className="max-w-3xl text-sm text-gray-600">
            Persisted degree-day accumulation from the current CIMIS-linked blocks, with no speculative forecasting layered on top.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{dashboard.summary.trackedModels}</div>
            <div>Tracked models</div>
          </div>
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{formatDegreeDayDate(dashboard.summary.latestObservationDate)}</div>
            <div>Latest observation</div>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active Blocks"
          value={dashboard.summary.activeBlocks}
          detail="Active ranch blocks in the current workspace"
        />
        <MetricCard
          label="Station Linked"
          value={dashboard.summary.configuredBlocks}
          detail="Blocks with CIMIS station config saved"
        />
        <MetricCard
          label="Near Threshold"
          value={dashboard.summary.nearingThreshold}
          detail="Models above 80% of action threshold"
        />
        <MetricCard
          label="Threshold Hit"
          value={dashboard.summary.reachedThreshold}
          detail="Models already past the action threshold"
        />
      </div>

      {dashboard.blocks.length === 0 ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Create your first block to unlock seasonal timing</h2>
          <p className="mt-2 text-sm text-gray-600">
            Degree-day accumulation is organized by live ranch blocks and their assigned CIMIS stations.
          </p>
          <Link
            href="/blocks/new"
            className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Create first block
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-ranch-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Seasonal accumulation trend</h2>
                  <p className="mt-1 text-sm text-gray-500">{chartSummaryLabel(selectedModel)}</p>
                </div>
                <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">
                  {refreshing ? 'Refreshing' : 'Persisted data'}
                </div>
              </div>

              {selectedModel ? (
                <>
                  <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{selectedModel.pestLabel}</h3>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                          {selectedModel.station?.name ?? 'Station unavailable'}
                        </span>
                        {selectedModel.station?.county ? (
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                            {selectedModel.station.county} County
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        Tracking {selectedModel.trackedBlockNames.length} block
                        {selectedModel.trackedBlockNames.length === 1 ? '' : 's'} across the current ranch.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Current</div>
                        <div className="mt-1 font-semibold text-gray-900">
                          {formatDegreeDayValue(selectedModel.latestCumulativeDd, 0)} DD
                        </div>
                      </div>
                      <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">7-Day Gain</div>
                        <div className="mt-1 font-semibold text-gray-900">
                          {formatDegreeDayValue(selectedModel.sevenDayGain, 0)} DD
                        </div>
                      </div>
                      <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Threshold</div>
                        <div className="mt-1 font-semibold text-gray-900">{selectedModel.actionThresholdDd} DD</div>
                      </div>
                      <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Updated</div>
                        <div className="mt-1 font-semibold text-gray-900">
                          {formatDegreeDayDate(selectedModel.latestDate)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 h-80">
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                          <XAxis dataKey="shortDate" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} />
                          <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} width={56} />
                          <Tooltip content={<TrendTooltip />} />
                          <Line
                            type="monotone"
                            dataKey="cumulativeDd"
                            stroke={chartLineTone(selectedModel.progressRatio)}
                            strokeWidth={3}
                            dot={false}
                            name="Cumulative DD"
                          />
                          <Line
                            type="monotone"
                            dataKey="dailyDd"
                            stroke="#94a3b8"
                            strokeWidth={2}
                            dot={false}
                            strokeDasharray="5 5"
                            name="Daily DD"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-ranch-border bg-gray-50 text-sm text-gray-500">
                        No persisted degree-day observations are available for this station-model yet.
                      </div>
                    )}
                  </div>

                  <div className="mt-5 rounded-2xl border border-ranch-border bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                      <TriangleAlert className="h-4 w-4 text-amber-600" />
                      <span>Progress: {formatProgressPercent(selectedModel.progressRatio)}</span>
                      <span className="text-gray-400">|</span>
                      <span>
                        Biofix month: {selectedModel.biofixMonth}
                      </span>
                      <span className="text-gray-400">|</span>
                      <span>
                        Temperature band: {selectedModel.lowerThresholdF}F to {selectedModel.upperThresholdF}F
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-ranch-border bg-gray-50 p-6 text-sm text-gray-600">
                  Link at least one block to a CIMIS station on the irrigation page to begin tracking degree-day accumulation.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <div className="border-b border-ranch-border pb-4">
                <h2 className="text-xl font-semibold text-gray-900">Tracked models</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Choose a station-model pair to inspect current accumulation and recent trend.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {dashboard.stationModels.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-ranch-border bg-gray-50 p-5 text-sm text-gray-600">
                    No active degree-day models are linked yet. Add CIMIS stations in irrigation to start coverage.
                  </div>
                ) : (
                  dashboard.stationModels.map((model) => {
                    const isSelected = model.key === selectedModel?.key;
                    return (
                      <button
                        key={model.key}
                        type="button"
                        onClick={() => setSelectedStationModelKey(model.key)}
                        className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedTone(model.progressRatio, isSelected)}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-gray-900">{model.pestLabel}</span>
                              <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-gray-600">
                                {model.station?.name ?? 'Station unavailable'}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-gray-600">
                              {model.trackedBlockNames.length} block{model.trackedBlockNames.length === 1 ? '' : 's'} linked
                            </p>
                          </div>
                          <div className="text-right text-sm">
                            <div className="font-semibold text-gray-900">
                              {formatDegreeDayValue(model.latestCumulativeDd, 0)} DD
                            </div>
                            <div className="text-gray-500">{formatProgressPercent(model.progressRatio)}</div>
                          </div>
                        </div>
                        <ProgressBar value={model.progressRatio} />
                        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                          <span>Updated {formatDegreeDayDate(model.latestDate)}</span>
                          <span>Threshold {model.actionThresholdDd} DD</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-ranch-border pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Block coverage</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Degree-day visibility stays grounded in the current ranch blocks and their persisted irrigation station config.
                </p>
              </div>
              <Link href="/irrigation" className="text-sm font-semibold text-sky-700 hover:text-sky-800">
                Manage irrigation station links
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {dashboard.blocks.map((block) => (
                <div key={block.id} className="rounded-2xl border border-ranch-border bg-gray-50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{block.name}</h3>
                        {block.isOrganic ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                            Organic
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {formatBlockCropLabel(block.cropType)} / {block.variety}
                        {block.acreage ? ` / ${block.acreage} acres` : ''}
                      </p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600">
                      {block.cimisStation ? block.cimisStation.name : 'No station linked'}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                      <Droplets className="h-4 w-4 text-sky-600" />
                      {block.cimisStation?.county ? `${block.cimisStation.county} County` : 'CIMIS station not assigned'}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
                      <CalendarDays className="h-4 w-4 text-slate-600" />
                      {block.modelStatuses.some((statusItem) => statusItem.latestDate)
                        ? `Latest ${formatDegreeDayDate(block.modelStatuses.map((statusItem) => statusItem.latestDate).filter(Boolean).sort((left, right) => (right ?? '').localeCompare(left ?? ''))[0] ?? null)}`
                        : 'No degree-day rows yet'}
                    </span>
                  </div>

                  {block.modelStatuses.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {block.modelStatuses.map((statusItem) => (
                        <div key={`${block.id}-${statusItem.pestModel}`} className="rounded-xl border border-white bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                                <Bug className="h-4 w-4 text-amber-600" />
                                {statusItem.pestLabel}
                              </div>
                              <p className="mt-1 text-xs text-gray-500">
                                Threshold {statusItem.actionThresholdDd} DD
                              </p>
                            </div>
                            <div className="text-right text-sm">
                              <div className="font-semibold text-gray-900">
                                {formatDegreeDayValue(statusItem.latestCumulativeDd, 0)} DD
                              </div>
                              <div className="text-gray-500">{formatProgressPercent(statusItem.progressRatio)}</div>
                            </div>
                          </div>
                          <ProgressBar value={statusItem.progressRatio} />
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1">
                              <Leaf className="h-3.5 w-3.5 text-emerald-600" />
                              7-day gain {formatDegreeDayValue(statusItem.sevenDayGain, 0)} DD
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1">
                              Updated {formatDegreeDayDate(statusItem.latestDate)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-ranch-border bg-white p-4 text-sm text-gray-600">
                      {block.hasStationConfig
                        ? 'This crop does not have a current degree-day model wired into RanchOS yet, or persisted rows have not landed for its station.'
                        : 'Link this block to a CIMIS station on the irrigation page to start tracking seasonal accumulation.'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
