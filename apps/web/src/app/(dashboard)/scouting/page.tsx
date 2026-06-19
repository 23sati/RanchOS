'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bug, Leaf, Pencil, Save, ShieldAlert, Trash2, X } from 'lucide-react';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { formatBlockCropLabel } from '@/lib/blocks';
import { fetchRanches, type RanchRecord } from '@/lib/ranches';
import {
  PestSpeciesRecord,
  ScoutingDashboardPayload,
  ScoutingLogFormValues,
  ScoutingLogRecord,
  createScoutingLog,
  defaultScoutingLogFormValues,
  deleteScoutingLog,
  fetchScoutingDashboard,
  formatPestCategoryLabel,
  formatScoutedAt,
  formatScoutingRatingLabel,
  scoutingLogToFormValues,
  scoutingRatingOptions,
  updateScoutingLog,
} from '@/lib/scouting';

const emptyDashboard: ScoutingDashboardPayload = {
  blocks: [],
  species: [],
  logs: [],
  blockInsights: [],
  pestSummaries: [],
  followUpQueue: [],
  summary: {
    totalLogs: 0,
    actionRequired: 0,
    highPressure: 0,
    thisWeek: 0,
    blocksNeedingFollowUp: 0,
    staleBlocks: 0,
  },
};

const ALL_RANCHES_VALUE = 'all';

function sortLogs(logs: ScoutingLogRecord[]) {
  return [...logs].sort((left, right) => {
    const timeDiff = new Date(right.scoutedAt).getTime() - new Date(left.scoutedAt).getTime();
    return Number.isFinite(timeDiff) && timeDiff !== 0
      ? timeDiff
      : (right.createdAt ?? '').localeCompare(left.createdAt ?? '');
  });
}

function ratingTone(rating: ScoutingLogRecord['rating']) {
  if (rating === 'action') return 'bg-red-100 text-red-800';
  if (rating === 'high') return 'bg-orange-100 text-orange-800';
  if (rating === 'moderate') return 'bg-amber-100 text-amber-800';
  if (rating === 'low') return 'bg-sky-100 text-sky-800';
  return 'bg-emerald-100 text-emerald-800';
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <h2 className="mt-2 text-3xl font-bold text-gray-900">{value}</h2>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function getDefaultBlockId(dashboard: ScoutingDashboardPayload) {
  return dashboard.blocks[0]?.id ?? '';
}

function scoutingPriority(entry: ScoutingDashboardPayload['blockInsights'][number]) {
  const ratingScore =
    entry.highestRecentRating === 'action'
      ? 4
      : entry.highestRecentRating === 'high'
        ? 3
        : entry.highestRecentRating === 'moderate'
          ? 2
          : entry.highestRecentRating === 'low'
            ? 1
            : 0;

  return (entry.needsFollowUp ? 100 : 0) + (entry.needsFreshScout ? 35 : 0) + entry.recentHighOrActionLogs * 10 + ratingScore;
}

function scoutingNextActionCopy(entry: ScoutingDashboardPayload['blockInsights'][number]) {
  if (entry.needsFollowUp) {
    return `${entry.recentHighOrActionLogs} recent high/action log${entry.recentHighOrActionLogs === 1 ? '' : 's'} should feed the next treatment or re-scout plan.`;
  }

  if (entry.needsFreshScout) {
    return 'This block needs a fresh scouting pass before pressure goes stale.';
  }

  if (entry.latestPestName) {
    return `Keep monitoring ${entry.latestPestName}; current scouting pressure looks stable.`;
  }

  return 'No scouting pressure is active here yet. Log the next field pass when the crew scouts this block.';
}

export default function ScoutingPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [dashboard, setDashboard] = useState<ScoutingDashboardPayload>(emptyDashboard);
  const [formValues, setFormValues] = useState<ScoutingLogFormValues>(defaultScoutingLogFormValues());
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [selectedRanchId, setSelectedRanchId] = useState<string>(ALL_RANCHES_VALUE);
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const applyDashboard = (payload: ScoutingDashboardPayload) => {
    const sortedDashboard = {
      ...payload,
      logs: sortLogs(payload.logs),
    };

    setDashboard(sortedDashboard);
    setFormValues((current) => {
      if (current.blockId && sortedDashboard.blocks.some((block) => block.id === current.blockId)) {
        return current;
      }

      return {
        ...current,
        blockId: getDefaultBlockId(sortedDashboard),
        pestSpeciesId: '',
      };
    });
  };

  const loadScopedDashboard = async (ranchScopeId: string) => {
    const ranchId = ranchScopeId === ALL_RANCHES_VALUE ? undefined : ranchScopeId;
    const scoutingData = await fetchScoutingDashboard(ranchId);
    applyDashboard(scoutingData);
    return scoutingData;
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const onboardingStatus = await fetchOnboardingStatus();
        if (cancelled) return;
        setStatus(onboardingStatus);

        if (!onboardingStatus.profile?.orgId) {
          return;
        }

        const ranchRows = await fetchRanches();
        if (cancelled) return;

        setRanches(ranchRows);

        if (ranchRows.length === 0) {
          return;
        }

        const initialScopeId =
          ranchRows.length > 1
            ? ALL_RANCHES_VALUE
            : onboardingStatus.ranch?.id ?? ranchRows[0]?.id ?? ALL_RANCHES_VALUE;

        setSelectedRanchId(initialScopeId);
        await loadScopedDashboard(initialScopeId);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load scouting data.');
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
    if (!dashboard.blocks.length) {
      return;
    }

    if (!formValues.blockId) {
      setFormValues((current) => ({
        ...current,
        blockId: getDefaultBlockId(dashboard),
      }));
    }
  }, [dashboard.blocks, formValues.blockId]);

  const selectedRanch = useMemo(
    () => ranches.find((ranch) => ranch.id === selectedRanchId) ?? null,
    [ranches, selectedRanchId],
  );
  const ranchNameById = useMemo(() => new Map(ranches.map((ranch) => [ranch.id, ranch.name])), [ranches]);
  const selectedBlock = useMemo(
    () => dashboard.blocks.find((block) => block.id === formValues.blockId) ?? dashboard.blocks[0] ?? null,
    [dashboard.blocks, formValues.blockId],
  );
  const selectedScopeLabel = selectedRanch
    ? selectedRanch.name
    : ranches.length > 1
      ? 'All ranches'
      : ranches[0]?.name ?? status?.ranch?.name ?? 'Current ranch';
  const ranchesInScope = selectedRanch ? 1 : ranches.length;
  const showPortfolioLabels = !selectedRanch && ranches.length > 1;

  const availableSpecies = useMemo(() => {
    if (!selectedBlock) {
      return dashboard.species;
    }

    return dashboard.species.filter((species) => species.applicableCrops.includes(selectedBlock.cropType));
  }, [dashboard.species, selectedBlock]);

  const selectedSpecies = useMemo(
    () => dashboard.species.find((species) => species.id === formValues.pestSpeciesId) ?? null,
    [dashboard.species, formValues.pestSpeciesId],
  );
  const blocksById = useMemo(() => new Map(dashboard.blocks.map((block) => [block.id, block])), [dashboard.blocks]);
  const selectedBlockInsight = useMemo(
    () => dashboard.blockInsights.find((insight) => insight.blockId === selectedBlock?.id) ?? null,
    [dashboard.blockInsights, selectedBlock?.id],
  );
  const selectedBlockLogs = useMemo(
    () =>
      dashboard.logs
        .filter((log) => log.blockId === selectedBlock?.id)
        .slice(0, 3),
    [dashboard.logs, selectedBlock?.id],
  );
  const scoutingOperationalQueue = useMemo(
    () =>
      dashboard.blockInsights
        .slice()
        .sort((left, right) => scoutingPriority(right) - scoutingPriority(left))
        .slice(0, 8)
        .map((entry) => ({
          ...entry,
          ranchName: blocksById.get(entry.blockId) ? ranchNameById.get(blocksById.get(entry.blockId)?.ranchId ?? '') ?? 'Unknown ranch' : 'Unknown ranch',
        })),
    [blocksById, dashboard.blockInsights, ranchNameById],
  );
  const scoutingRanchRollups = useMemo(() => {
    const rollups = new Map<
      string,
      {
        ranchId: string;
        ranchName: string;
        hotBlocks: number;
        followUpBlocks: number;
        freshScoutBlocks: number;
        actionLogs: number;
      }
    >();

    dashboard.blockInsights.forEach((entry) => {
      const block = blocksById.get(entry.blockId);
      if (!block) return;

      const current =
        rollups.get(block.ranchId) ?? {
          ranchId: block.ranchId,
          ranchName: ranchNameById.get(block.ranchId) ?? 'Unknown ranch',
          hotBlocks: 0,
          followUpBlocks: 0,
          freshScoutBlocks: 0,
          actionLogs: 0,
        };

      current.hotBlocks += entry.highestRecentRating === 'high' || entry.highestRecentRating === 'action' ? 1 : 0;
      current.followUpBlocks += entry.needsFollowUp ? 1 : 0;
      current.freshScoutBlocks += entry.needsFreshScout ? 1 : 0;
      current.actionLogs += entry.recentHighOrActionLogs;

      rollups.set(block.ranchId, current);
    });

    return Array.from(rollups.values()).sort(
      (left, right) =>
        right.followUpBlocks - left.followUpBlocks ||
        right.freshScoutBlocks - left.freshScoutBlocks ||
        right.actionLogs - left.actionLogs ||
        left.ranchName.localeCompare(right.ranchName),
    );
  }, [blocksById, dashboard.blockInsights, ranchNameById]);

  const totalLogs = dashboard.summary.totalLogs;
  const actionCount = dashboard.summary.actionRequired;

  const handleCopyScoutingHandoff = async () => {
    const queueLines = scoutingOperationalQueue.slice(0, 5).map((entry) => {
      const blockLabel = showPortfolioLabels ? `${entry.blockName} / ${entry.ranchName}` : entry.blockName;
      return `- ${blockLabel}: ${formatScoutingRatingLabel(entry.highestRecentRating)}; ${scoutingNextActionCopy(entry)}`;
    });

    const rollupLines = scoutingRanchRollups.slice(0, 5).map((row) => {
      return `- ${row.ranchName}: ${row.followUpBlocks} follow-up blocks, ${row.freshScoutBlocks} fresh-scout gaps, ${row.actionLogs} recent high/action logs`;
    });

    const selectedLine = selectedBlockInsight
      ? `Selected block: ${selectedBlock?.name ?? 'Unknown block'} / ${formatScoutingRatingLabel(selectedBlockInsight.highestRecentRating)} / ${scoutingNextActionCopy(selectedBlockInsight)}`
      : 'Selected block: none';

    try {
      await navigator.clipboard.writeText(
        [
          `${selectedScopeLabel} scouting handoff`,
          selectedLine,
          `Summary: ${actionCount} action-required logs, ${dashboard.summary.blocksNeedingFollowUp} hot blocks, ${dashboard.summary.staleBlocks} coverage gaps.`,
          'Priority queue:',
          ...queueLines,
          !selectedRanch && rollupLines.length > 0 ? 'Ranch pressure:' : '',
          ...(!selectedRanch ? rollupLines : []),
        ]
          .filter(Boolean)
          .join('\n'),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to copy scouting handoff summary.');
    }
  };

  const resetForm = (blockId = getDefaultBlockId(dashboard)) => {
    setEditingLogId(null);
    setFormValues(defaultScoutingLogFormValues(blockId));
  };

  const handleScopeChange = async (nextRanchId: string) => {
    setSelectedRanchId(nextRanchId);
    setScopeLoading(true);
    setErrorMessage('');

    try {
      const payload = await loadScopedDashboard(nextRanchId);
      resetForm(getDefaultBlockId(payload));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh scouting scope.');
    } finally {
      setScopeLoading(false);
    }
  };

  const upsertLogInState = (nextLog: ScoutingLogRecord) => {
    setDashboard((current) => {
      const existingIndex = current.logs.findIndex((log) => log.id === nextLog.id);
      if (existingIndex === -1) {
        return {
          ...current,
          logs: sortLogs([nextLog, ...current.logs]),
        };
      }

      const nextLogs = [...current.logs];
      nextLogs[existingIndex] = nextLog;
      return {
        ...current,
        logs: sortLogs(nextLogs),
      };
    });
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    setErrorMessage('');

    try {
      const savedLog = editingLogId
        ? await updateScoutingLog(editingLogId, formValues)
        : await createScoutingLog(formValues);

      upsertLogInState(savedLog);
      resetForm(savedLog.blockId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save scouting log.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (log: ScoutingLogRecord) => {
    setEditingLogId(log.id);
    setFormValues(scoutingLogToFormValues(log));
    setErrorMessage('');
  };

  const handleDelete = async (id: string) => {
    setDeletingLogId(id);
    setErrorMessage('');

    try {
      await deleteScoutingLog(id);
      setDashboard((current) => ({
        ...current,
        logs: current.logs.filter((log) => log.id !== id),
      }));

      if (editingLogId === id) {
        resetForm();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete scouting log.');
    } finally {
      setDeletingLogId(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading scouting workspace...</div>;
  }

  if (!status?.profile?.orgId || ranches.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">No ranch available yet</h1>
          <p className="mt-2 text-sm text-gray-600">Finish onboarding before managing scouting logs.</p>
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
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Scouting &amp; IPM</p>
          <h1 className="text-3xl font-bold text-gray-900">{selectedScopeLabel} scouting</h1>
          <p className="text-sm text-gray-600">
            Portfolio-level and single-ranch pest pressure logs on the same persisted scouting dashboard.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{ranchesInScope}</div>
            <div>Ranches in scope</div>
          </div>
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{dashboard.blocks.length}</div>
            <div>Active blocks</div>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Logs" value={totalLogs} detail={`All scouting observations in ${selectedScopeLabel.toLowerCase()}`} />
        <MetricCard label="Action Required" value={actionCount} detail="Logs flagged for immediate follow-up" />
        <MetricCard label="Hot Blocks" value={dashboard.summary.blocksNeedingFollowUp} detail="Blocks with recent high or action pressure" />
        <MetricCard label="Coverage Gaps" value={dashboard.summary.staleBlocks} detail="Blocks needing a fresh scouting pass" />
      </div>

      <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Ranch scope</h2>
            <p className="mt-1 text-sm text-gray-500">
              Switch between the full ranch portfolio and one ranch at a time without leaving the persisted scouting workflow.
            </p>
          </div>
          {scopeLoading ? <span className="text-sm text-gray-500">Refreshing scope...</span> : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {ranches.length > 1 ? (
            <button
              type="button"
              onClick={() => void handleScopeChange(ALL_RANCHES_VALUE)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                selectedRanchId === ALL_RANCHES_VALUE
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ranches
            </button>
          ) : null}

          {ranches.map((ranch) => (
            <button
              key={ranch.id}
              type="button"
              onClick={() => void handleScopeChange(ranch.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                selectedRanchId === ranch.id
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {ranch.name}
            </button>
          ))}
        </div>
      </div>

      {dashboard.blocks.length === 0 ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Create your first block to unlock scouting logs</h2>
          <p className="mt-2 text-sm text-gray-600">Scouting observations are scoped to active ranch blocks in the current ranch view.</p>
          <Link
            href="/blocks/new"
            className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Create first block
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-ranch-border bg-gray-50 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Operational workbench</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Triage scouting pressure and follow-up using the same persisted logs, block insights, and follow-up queue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyScoutingHandoff()}
                className="inline-flex items-center rounded-lg border border-ranch-border bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Copy handoff summary
              </button>
            </div>

            <div className="grid gap-4 p-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-3">
                {scoutingOperationalQueue.length === 0 ? (
                  <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-4 text-sm text-gray-600">
                    No scouting pressure is active in this scope yet.
                  </div>
                ) : (
                  scoutingOperationalQueue.map((entry) => (
                    <button
                      key={entry.blockId}
                      type="button"
                      onClick={() =>
                        setFormValues((current) => ({
                          ...current,
                          blockId: entry.blockId,
                          pestSpeciesId: '',
                        }))
                      }
                      className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                        selectedBlock?.id === entry.blockId
                          ? 'border-green-300 bg-green-50/40'
                          : 'border-ranch-border bg-gray-50 hover:bg-gray-100/70'
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{entry.blockName}</p>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ratingTone(entry.highestRecentRating)}`}>
                              {formatScoutingRatingLabel(entry.highestRecentRating)}
                            </span>
                          </div>
                          {showPortfolioLabels ? (
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{entry.ranchName}</p>
                          ) : null}
                          <p className="mt-2 text-sm text-gray-600">{scoutingNextActionCopy(entry)}</p>
                        </div>
                        <div className="text-sm text-gray-600 lg:text-right">
                          <div>{entry.recentHighOrActionLogs} high/action log{entry.recentHighOrActionLogs === 1 ? '' : 's'}</div>
                          <div>{entry.latestScoutedAt ? `Last scout ${formatScoutedAt(entry.latestScoutedAt)}` : 'No logs yet'}</div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Selected block action</p>
                  {selectedBlock && selectedBlockInsight ? (
                    <div className="mt-3 space-y-3 text-sm text-gray-600">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">{selectedBlock.name}</p>
                        <p className="mt-1">
                          {formatScoutingRatingLabel(selectedBlockInsight.highestRecentRating)}
                          {showPortfolioLabels ? ` / ${ranchNameById.get(selectedBlock.ranchId) ?? 'Unknown ranch'}` : ''}
                        </p>
                      </div>
                      <p>{scoutingNextActionCopy(selectedBlockInsight)}</p>
                      <p>
                        Latest pest: <span className="font-semibold text-gray-900">{selectedBlockInsight.latestPestName ?? 'No logs yet'}</span>
                      </p>
                      <p>
                        Recent follow-up: <span className="font-semibold text-gray-900">{selectedBlockInsight.recentHighOrActionLogs}</span>
                      </p>
                      <p>
                        Fresh scout needed:{' '}
                        <span className="font-semibold text-gray-900">{selectedBlockInsight.needsFreshScout ? 'Yes' : 'No'}</span>
                      </p>
                      {selectedBlockLogs.length > 0 ? (
                        <div className="rounded-lg border border-white/80 bg-white px-3 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Latest logs</p>
                          <div className="mt-2 space-y-2">
                            {selectedBlockLogs.map((log) => (
                              <div key={log.id} className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-gray-900">{log.pestDisplayName}</p>
                                  <p className="text-xs text-gray-500">{formatScoutedAt(log.scoutedAt)}</p>
                                </div>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ratingTone(log.rating)}`}>
                                  {formatScoutingRatingLabel(log.rating)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-gray-600">Select a block from the queue to review its scouting action context.</p>
                  )}
                </div>

                {!selectedRanch && ranches.length > 1 ? (
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Ranch pressure</p>
                    <div className="mt-3 space-y-3 text-sm text-gray-600">
                      {scoutingRanchRollups.length === 0 ? (
                        <p>No ranch scouting pressure yet.</p>
                      ) : (
                        scoutingRanchRollups.slice(0, 6).map((row) => (
                          <button
                            key={row.ranchId}
                            type="button"
                            onClick={() => void handleScopeChange(row.ranchId)}
                            className="w-full rounded-lg border border-white/80 bg-white px-3 py-3 text-left shadow-sm hover:bg-gray-50"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-gray-900">{row.ranchName}</p>
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                                {row.hotBlocks} hot blocks
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3">
                              <span>Follow-up {row.followUpBlocks}</span>
                              <span>Fresh scout {row.freshScoutBlocks}</span>
                              <span>Recent high/action logs {row.actionLogs}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {editingLogId ? 'Edit scouting log' : 'Create scouting log'}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Capture pest pressure, sample counts, and notes for a live block.
                    </p>
                  </div>
                  {editingLogId ? (
                    <button
                      type="button"
                      onClick={() => resetForm(formValues.blockId || getDefaultBlockId(dashboard))}
                      className="inline-flex items-center gap-2 rounded-lg border border-ranch-border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <X className="h-4 w-4" />
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-4 p-6 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Block</span>
                  <select
                    value={formValues.blockId}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        blockId: event.target.value,
                        pestSpeciesId: '',
                      }))
                    }
                    className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                  >
                    {dashboard.blocks.map((block) => (
                      <option key={block.id} value={block.id}>
                        {showPortfolioLabels ? `${ranchNameById.get(block.ranchId) ?? 'Unknown ranch'} - ${block.name}` : block.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Scouted at</span>
                  <input
                    type="datetime-local"
                    value={formValues.scoutedAt}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        scoutedAt: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Pest species</span>
                  <select
                    value={formValues.pestSpeciesId}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        pestSpeciesId: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">Custom or not listed</option>
                    {availableSpecies.map((species) => (
                      <option key={species.id} value={species.id}>
                        {species.nameEn}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Custom pest name</span>
                  <input
                    type="text"
                    value={formValues.pestNameCustom}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        pestNameCustom: event.target.value,
                      }))
                    }
                    placeholder="Use when the species is not listed"
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Pressure rating</span>
                  <select
                    value={formValues.rating}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        rating: event.target.value as ScoutingLogFormValues['rating'],
                      }))
                    }
                    className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                  >
                    {scoutingRatingOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Count per sample</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formValues.countPerSample}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        countPerSample: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Sample count</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formValues.sampleCount}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        sampleCount: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-gray-900">Observation notes</span>
                  <textarea
                    value={formValues.observationNotes}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        observationNotes: event.target.value,
                      }))
                    }
                    rows={4}
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                    placeholder="Counts, beneficial activity, hot spots, or follow-up recommendations."
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ranch-border px-6 py-4">
                <div className="text-sm text-gray-500">
                  Choose a system species or enter a custom pest name to save the log.
                </div>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {editingLogId ? <Save className="h-4 w-4" /> : <Bug className="h-4 w-4" />}
                  {isSaving ? 'Saving...' : editingLogId ? 'Save changes' : 'Create scouting log'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Recent scouting logs</h2>
                <p className="mt-1 text-sm text-gray-500">Latest field observations across active blocks.</p>
              </div>
              <div className="divide-y">
                {dashboard.logs.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-gray-600">
                    No scouting logs yet. Create the first one from the form above.
                  </div>
                ) : (
                  dashboard.logs.map((log) => (
                    <div key={log.id} className="space-y-4 px-6 py-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{log.pestDisplayName}</p>
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ratingTone(
                                log.rating,
                              )}`}
                            >
                              {formatScoutingRatingLabel(log.rating)}
                            </span>
                            {log.block?.isOrganic ? (
                              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                                Organic block
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm text-gray-600">
                            {log.block?.name ?? 'Block'} / {formatBlockCropLabel(log.block?.cropType ?? '')}
                            {log.block?.variety ? ` / ${log.block.variety}` : ''}
                            {showPortfolioLabels && log.block?.ranchId ? ` / ${ranchNameById.get(log.block.ranchId) ?? 'Unknown ranch'}` : ''}
                          </p>
                          <p className="text-sm text-gray-600">
                            Logged {formatScoutedAt(log.scoutedAt)}
                            {log.scoutedByProfile?.fullName ? ` / ${log.scoutedByProfile.fullName}` : ''}
                          </p>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <span>Category: {formatPestCategoryLabel(log.pestSpecies?.category)}</span>
                            {log.countPerSample ? <span>Count/sample: {log.countPerSample}</span> : null}
                            {log.sampleCount ? <span>Samples: {log.sampleCount}</span> : null}
                          </div>
                          {log.observationNotes ? (
                            <p className="text-sm text-gray-700">{log.observationNotes}</p>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(log)}
                            className="inline-flex items-center gap-2 rounded-lg border border-ranch-border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(log.id)}
                            disabled={deletingLogId === log.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                            {deletingLogId === log.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900">Selected block pressure</h2>
              {selectedBlock ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-gray-900">{selectedBlock.name}</p>
                      {selectedBlock.isOrganic ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                          Organic block
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatBlockCropLabel(selectedBlock.cropType)} / {selectedBlock.variety}
                      {showPortfolioLabels ? ` / ${ranchNameById.get(selectedBlock.ranchId) ?? 'Unknown ranch'}` : ''}
                    </p>
                  </div>
                  {selectedBlockInsight ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Latest scout</div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {selectedBlockInsight.latestScoutedAt ? formatScoutedAt(selectedBlockInsight.latestScoutedAt) : 'No logs yet'}
                          </div>
                        </div>
                        <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Recent follow-up</div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {selectedBlockInsight.recentHighOrActionLogs} log{selectedBlockInsight.recentHighOrActionLogs === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ratingTone(selectedBlockInsight.highestRecentRating)}`}>
                            {formatScoutingRatingLabel(selectedBlockInsight.highestRecentRating)}
                          </span>
                          <span className="text-sm text-gray-600">
                            {selectedBlockInsight.needsFollowUp
                              ? 'Recent scouting pressure needs follow-up.'
                              : selectedBlockInsight.needsFreshScout
                                ? 'This block needs a fresh scouting pass.'
                                : 'Recent scouting pressure looks stable.'}
                          </span>
                        </div>
                        <div className="mt-3 text-sm text-gray-600">
                          Latest pest: <span className="font-semibold text-gray-900">{selectedBlockInsight.latestPestName ?? 'No logs yet'}</span>
                        </div>
                        {selectedBlockInsight.topPests.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedBlockInsight.topPests.map((entry) => (
                              <span key={entry.label} className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700">
                                {entry.label} · {entry.count}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-600">Scouting pressure will appear here once this block has persisted logs.</p>
                  )}
                </div>
              ) : (
                <p className="mt-5 text-sm text-gray-600">Pick a block to review its scouting pressure.</p>
              )}
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900">Top pest signals</h2>
              <div className="mt-5 space-y-3">
                {dashboard.pestSummaries.length === 0 ? (
                  <p className="text-sm text-gray-600">No pest signals yet. Logged observations will show up here.</p>
                ) : (
                  dashboard.pestSummaries.slice(0, 5).map((entry) => (
                    <div
                      key={entry.key}
                      className="flex items-center justify-between rounded-xl border border-ranch-border bg-gray-50 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{entry.label}</p>
                        <p className="text-sm text-gray-500">
                          {entry.recentLogs} recent log{entry.recentLogs === 1 ? '' : 's'} across {entry.affectedBlocks} block{entry.affectedBlocks === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ratingTone(entry.latestRating)}`}>
                          {formatScoutingRatingLabel(entry.latestRating)}
                        </span>
                        <p className="mt-1 text-xs text-gray-500">
                          {entry.actionCount + entry.highCount} follow-up signal{entry.actionCount + entry.highCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900">Block pressure board</h2>
              <div className="mt-5 space-y-3">
                {dashboard.blockInsights.length === 0 ? (
                  <p className="text-sm text-gray-600">Block-level scouting pressure will appear once logs are saved.</p>
                ) : (
                  dashboard.blockInsights
                    .slice()
                    .sort((left, right) => {
                      const leftScore = (left.needsFollowUp ? 10 : 0) + (left.needsFreshScout ? 1 : 0) + left.recentHighOrActionLogs;
                      const rightScore = (right.needsFollowUp ? 10 : 0) + (right.needsFreshScout ? 1 : 0) + right.recentHighOrActionLogs;
                      return rightScore - leftScore;
                    })
                    .slice(0, 6)
                    .map((entry) => (
                      <button
                        key={entry.blockId}
                        type="button"
                        onClick={() => setFormValues((current) => ({ ...current, blockId: entry.blockId }))}
                        className="w-full rounded-xl border border-ranch-border bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-gray-900">{entry.blockName}</p>
                              {entry.isOrganic ? (
                                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                                  Organic
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-gray-500">
                              {entry.latestScoutedAt ? formatScoutedAt(entry.latestScoutedAt) : 'No scouting logs yet'}
                            </p>
                            {showPortfolioLabels ? (
                              <p className="mt-1 text-sm text-gray-500">
                                {ranchNameById.get(
                                  dashboard.blocks.find((block) => block.id === entry.blockId)?.ranchId ?? '',
                                ) ?? 'Unknown ranch'}
                              </p>
                            ) : null}
                          </div>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ratingTone(entry.highestRecentRating)}`}>
                            {formatScoutingRatingLabel(entry.highestRecentRating)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">
                          {entry.needsFollowUp
                            ? `${entry.recentHighOrActionLogs} recent high/action log${entry.recentHighOrActionLogs === 1 ? '' : 's'} need follow-up.`
                            : entry.needsFreshScout
                              ? 'This block needs a fresh scouting pass.'
                              : 'Recent scouting pressure is currently stable.'}
                        </p>
                      </button>
                    ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900">Species notes</h2>
              {selectedSpecies ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Selected species</p>
                    <p className="mt-2 text-lg font-semibold text-gray-900">{selectedSpecies.nameEn}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatPestCategoryLabel(selectedSpecies.category)}
                      {selectedSpecies.nameScientific ? ` / ${selectedSpecies.nameScientific}` : ''}
                    </p>
                  </div>
                  <div className="space-y-3 text-sm text-gray-600">
                    <p>
                      <span className="font-semibold text-gray-900">Threshold:</span>{' '}
                      {selectedSpecies.actionThresholdDescription ?? 'No threshold note yet.'}
                    </p>
                    <p>
                      <span className="font-semibold text-gray-900">Organic fit:</span>{' '}
                      {selectedSpecies.isAllowedInOrganic ? 'Commonly workable in organic programs.' : 'Review organic handling before action.'}
                    </p>
                    {selectedSpecies.ucIpmUrl ? (
                      <a
                        href={selectedSpecies.ucIpmUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-sm font-medium text-green-700 hover:text-green-800"
                      >
                        Open UC IPM reference
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-gray-600">
                  Pick a system species to see quick threshold and organic context here.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900">Follow-up queue</h2>
              <div className="mt-5 space-y-3">
                {dashboard.followUpQueue.length === 0 ? (
                  <p className="text-sm text-gray-600">No recent high-pressure scouting logs are waiting for follow-up.</p>
                ) : (
                  dashboard.followUpQueue.map((entry) => (
                    <div key={entry.logId} className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-gray-900">{entry.pestDisplayName}</p>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ratingTone(entry.rating)}`}>
                              {formatScoutingRatingLabel(entry.rating)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-600">
                            {entry.blockName} / {formatScoutedAt(entry.scoutedAt)}
                            {showPortfolioLabels
                              ? ` / ${ranchNameById.get(
                                  dashboard.blocks.find((block) => block.id === entry.blockId)?.ranchId ?? '',
                                ) ?? 'Unknown ranch'}`
                              : ''}
                            {entry.scoutedByName ? ` / ${entry.scoutedByName}` : ''}
                          </p>
                          {entry.observationNotes ? (
                            <p className="mt-2 text-sm text-gray-700">{entry.observationNotes}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFormValues((current) => ({ ...current, blockId: entry.blockId }));
                            const targetLog = dashboard.logs.find((log) => log.id === entry.logId);
                            if (targetLog) {
                              handleEdit(targetLog);
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-ranch-border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white"
                        >
                          <Pencil className="h-4 w-4" />
                          Open log
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {actionCount > 0 ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                  <p>
                    {actionCount} scouting log{actionCount === 1 ? '' : 's'} are marked action required and should feed the
                    next treatment or follow-up plan.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-start gap-3">
                  <Leaf className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                  <p>No scouting logs are currently marked action required.</p>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <p>
                  This MVP slice is log-focused. Heatmaps, trap integrations, and recommendation automation stay deferred.
                </p>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
