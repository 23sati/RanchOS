'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Droplets, Leaf, TriangleAlert, Waves } from 'lucide-react';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { formatBlockCropLabel } from '@/lib/blocks';
import { fetchRanches, type RanchRecord } from '@/lib/ranches';
import {
  IrrigationBlockRecord,
  IrrigationBlockInsightRecord,
  IrrigationConfigFormValues,
  IrrigationDashboardPayload,
  IrrigationEventRecord,
  createIrrigationEvent,
  defaultEventFormValues,
  fetchIrrigationDashboard,
  formatInches,
  formatIrrigationDate,
  formatPercent,
  formatPressureStatusLabel,
  formatIrrigationStatusLabel,
  formatRuntimeHours,
  formatSoilTypeLabel,
  formatTemperatureF,
  irrigationEventStatusOptions,
  saveIrrigationConfig,
  soilTypeOptions,
  updateIrrigationEvent,
  configToFormValues,
} from '@/lib/irrigation';

const emptyDashboard: IrrigationDashboardPayload = {
  blocks: [],
  stations: [],
  events: [],
  blockInsights: [],
  stationSnapshots: [],
  summary: {
    configuredBlocks: 0,
    blocksOverTrigger: 0,
    forecastCrossings: 0,
    staleStations: 0,
    missingDataBlocks: 0,
  },
};

const ALL_RANCHES_VALUE = 'all';

function todayDateValue() {
  const today = new Date();
  return `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
}

function sortEvents(events: IrrigationEventRecord[]) {
  return [...events].sort((left, right) => {
    const dateDiff = right.scheduledDate.localeCompare(left.scheduledDate);
    return dateDiff !== 0 ? dateDiff : (right.createdAt ?? '').localeCompare(left.createdAt ?? '');
  });
}

function statusTone(status: IrrigationEventRecord['status']) {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'running') return 'bg-sky-100 text-sky-800';
  if (status === 'problem') return 'bg-red-100 text-red-800';
  if (status === 'skipped') return 'bg-gray-100 text-gray-700';
  return 'bg-amber-100 text-amber-800';
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

function pressureTone(status: IrrigationBlockInsightRecord['pressureStatus']) {
  if (status === 'over_trigger') return 'bg-red-100 text-red-800';
  if (status === 'forecast_crossing' || status === 'near_trigger') return 'bg-amber-100 text-amber-800';
  if (status === 'stale_et' || status === 'missing_et' || status === 'missing_station' || status === 'unconfigured') {
    return 'bg-slate-100 text-slate-700';
  }

  return 'bg-emerald-100 text-emerald-800';
}

function pressureSummaryCopy(status: IrrigationBlockInsightRecord['pressureStatus']) {
  switch (status) {
    case 'over_trigger':
      return 'Current ET deficit is already above the saved trigger.';
    case 'forecast_crossing':
      return 'Forecast ET is expected to push this block across trigger soon.';
    case 'near_trigger':
      return 'Current ET deficit is nearing the saved trigger.';
    case 'stale_et':
      return 'Latest ET history is stale, so timing needs a weather refresh.';
    case 'missing_et':
      return 'Station is linked, but ET history has not landed yet.';
    case 'missing_station':
      return 'This block still needs a CIMIS station assignment.';
    case 'unconfigured':
      return 'Emitter and trigger assumptions have not been saved yet.';
    default:
      return 'This block is currently below its saved trigger.';
  }
}

function pressurePriority(status: IrrigationBlockInsightRecord['pressureStatus']) {
  switch (status) {
    case 'over_trigger':
      return 7;
    case 'forecast_crossing':
      return 6;
    case 'near_trigger':
      return 5;
    case 'stale_et':
      return 4;
    case 'missing_et':
      return 3;
    case 'missing_station':
      return 2;
    case 'unconfigured':
      return 1;
    default:
      return 0;
  }
}

function irrigationNextActionCopy({
  insight,
  openProblemEvents,
  upcomingEvent,
}: {
  insight: IrrigationBlockInsightRecord;
  openProblemEvents: number;
  upcomingEvent: IrrigationEventRecord | null;
}) {
  if (openProblemEvents > 0) {
    return 'Resolve the open problem event before scheduling additional water.';
  }

  switch (insight.pressureStatus) {
    case 'over_trigger':
      return upcomingEvent
        ? 'A run is already scheduled. Confirm crew timing and move it forward if the block keeps slipping.'
        : 'Schedule this block now. ET deficit is already past the saved trigger.';
    case 'forecast_crossing':
      return insight.triggerCrossingDate
        ? `Create the next run before ${formatIrrigationDate(insight.triggerCrossingDate)}.`
        : 'Create the next run before forecast ET pushes the block across trigger.';
    case 'near_trigger':
      return upcomingEvent
        ? 'Keep the scheduled run aligned and verify runtime still matches the latest ET.'
        : 'Plan the next irrigation window now so this block does not slip over trigger.';
    case 'stale_et':
      return 'Refresh weather inputs first. Latest ET history is stale for this block.';
    case 'missing_et':
      return 'Wait for ET history to land or confirm the linked station is reporting correctly.';
    case 'missing_station':
      return 'Assign a CIMIS station so this block can move into ET-based timing.';
    case 'unconfigured':
      return 'Save emitter, spacing, and trigger assumptions before using ET pressure for scheduling.';
    default:
      return upcomingEvent
        ? 'Monitor the scheduled run and update the event status after the crew completes it.'
        : 'No immediate irrigation action is required from the current ET pressure.';
  }
}

function BlockSummary({
  block,
  ranchName,
}: {
  block: IrrigationBlockRecord;
  ranchName?: string | null;
}) {
  return (
    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-900">{block.name}</h3>
        {block.isOrganic ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">Organic</span>
        ) : null}
      </div>
      {ranchName ? (
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{ranchName}</p>
      ) : null}
      <p className="mt-1 text-sm text-gray-600">
        {formatBlockCropLabel(block.cropType)} / {block.variety}
        {block.acreage ? ` / ${block.acreage} acres` : ''}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {block.treeCount ? `${block.treeCount.toLocaleString()} trees` : 'Tree count not set'}
        {block.irrigationType ? ` / ${block.irrigationType.replace(/_/g, ' ')}` : ''}
      </p>
    </div>
  );
}

export default function IrrigationPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [dashboard, setDashboard] = useState<IrrigationDashboardPayload>(emptyDashboard);
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [selectedRanchId, setSelectedRanchId] = useState<string>(ALL_RANCHES_VALUE);
  const [configValues, setConfigValues] = useState<IrrigationConfigFormValues>(configToFormValues(null));
  const [eventValues, setEventValues] = useState(() => ({ ...defaultEventFormValues(), scheduledDate: todayDateValue() }));
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [updatingEvent, setUpdatingEvent] = useState<{
    id: string;
    status: IrrigationEventRecord['status'];
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const applyDashboard = (payload: IrrigationDashboardPayload) => {
    setDashboard({
      ...payload,
      events: sortEvents(payload.events),
    });
  };

  const loadScopedDashboard = async (ranchScopeId: string) => {
    const ranchId = ranchScopeId === ALL_RANCHES_VALUE ? undefined : ranchScopeId;
    const irrigationData = await fetchIrrigationDashboard(ranchId);
    applyDashboard(irrigationData);
    return irrigationData;
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
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : 'Unable to load irrigation data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dashboard.blocks.length) {
      setSelectedBlockId('');
      return;
    }
    if (!selectedBlockId || !dashboard.blocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(dashboard.blocks[0].id);
    }
  }, [dashboard.blocks, selectedBlockId]);

  const selectedRanch = useMemo(
    () => ranches.find((ranch) => ranch.id === selectedRanchId) ?? null,
    [ranches, selectedRanchId],
  );
  const ranchNameById = useMemo(() => new Map(ranches.map((ranch) => [ranch.id, ranch.name])), [ranches]);
  const selectedBlock = useMemo(
    () => dashboard.blocks.find((block) => block.id === selectedBlockId) ?? null,
    [dashboard.blocks, selectedBlockId],
  );
  const selectedInsight = useMemo(
    () => dashboard.blockInsights.find((insight) => insight.blockId === selectedBlockId) ?? null,
    [dashboard.blockInsights, selectedBlockId],
  );
  const selectedScopeLabel = selectedRanch
    ? selectedRanch.name
    : ranches.length > 1
      ? 'All ranches'
      : ranches[0]?.name ?? status?.ranch?.name ?? 'Current ranch';
  const ranchesInScope = selectedRanch ? 1 : ranches.length;
  const showPortfolioLabels = !selectedRanch && ranches.length > 1;

  useEffect(() => {
    setConfigValues(configToFormValues(selectedBlock?.config ?? null));
    setEventValues((current) => ({
      ...current,
      blockId: selectedBlock?.id ?? '',
      scheduledDate: current.scheduledDate || todayDateValue(),
    }));
  }, [selectedBlock]);

  const today = todayDateValue();
  const configuredBlockCount = useMemo(() => dashboard.summary.configuredBlocks, [dashboard.summary.configuredBlocks]);
  const scheduledCount = useMemo(() => dashboard.events.filter((event) => event.status === 'scheduled' && event.scheduledDate >= today).length, [dashboard.events, today]);
  const completedCount = useMemo(() => dashboard.events.filter((event) => event.status === 'completed').length, [dashboard.events]);
  const problemCount = useMemo(() => dashboard.events.filter((event) => event.status === 'problem').length, [dashboard.events]);
  const blocksById = useMemo(() => new Map(dashboard.blocks.map((block) => [block.id, block])), [dashboard.blocks]);
  const selectedBlockEvents = useMemo(() => dashboard.events.filter((event) => event.blockId === selectedBlockId), [dashboard.events, selectedBlockId]);
  const nextScheduledEvent = useMemo(
    () => selectedBlockEvents.filter((event) => event.status === 'scheduled').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] ?? null,
    [selectedBlockEvents],
  );
  const irrigationOperationalQueue = useMemo(
    () =>
      dashboard.blockInsights
        .map((insight) => {
          const block = blocksById.get(insight.blockId) ?? null;
          const blockEvents = dashboard.events.filter((event) => event.blockId === insight.blockId);
          const openProblemEvents = blockEvents.filter((event) => event.status === 'problem').length;
          const upcomingEvent =
            blockEvents
              .filter((event) => event.status === 'scheduled' && event.scheduledDate >= today)
              .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate))[0] ?? null;

          return {
            insight,
            block,
            openProblemEvents,
            upcomingEvent,
            ranchName: block ? ranchNameById.get(block.ranchId) ?? 'Unknown ranch' : 'Unknown ranch',
            urgencyScore:
              pressurePriority(insight.pressureStatus) * 100 +
              openProblemEvents * 25 +
              Math.round((insight.projectedEtDeficitInches ?? insight.currentEtDeficitInches ?? 0) * 10),
          };
        })
        .sort((left, right) => right.urgencyScore - left.urgencyScore)
        .slice(0, 8),
    [blocksById, dashboard.blockInsights, dashboard.events, ranchNameById, today],
  );
  const selectedOperationalEntry = useMemo(
    () => irrigationOperationalQueue.find((entry) => entry.insight.blockId === selectedBlockId) ?? null,
    [irrigationOperationalQueue, selectedBlockId],
  );
  const irrigationRanchRollups = useMemo(() => {
    const rollups = new Map<
      string,
      {
        ranchId: string;
        ranchName: string;
        activeBlocks: number;
        urgent: number;
        dataGaps: number;
        scheduled: number;
        problems: number;
      }
    >();

    dashboard.blockInsights.forEach((insight) => {
      const block = blocksById.get(insight.blockId);
      if (!block) return;

      const current =
        rollups.get(block.ranchId) ?? {
          ranchId: block.ranchId,
          ranchName: ranchNameById.get(block.ranchId) ?? 'Unknown ranch',
          activeBlocks: 0,
          urgent: 0,
          dataGaps: 0,
          scheduled: 0,
          problems: 0,
        };

      const blockEvents = dashboard.events.filter((event) => event.blockId === insight.blockId);
      current.activeBlocks += 1;
      if (['over_trigger', 'forecast_crossing', 'near_trigger'].includes(insight.pressureStatus)) {
        current.urgent += 1;
      }
      if (['stale_et', 'missing_et', 'missing_station', 'unconfigured'].includes(insight.pressureStatus)) {
        current.dataGaps += 1;
      }
      if (blockEvents.some((event) => event.status === 'scheduled' && event.scheduledDate >= today)) {
        current.scheduled += 1;
      }
      current.problems += blockEvents.filter((event) => event.status === 'problem').length;

      rollups.set(block.ranchId, current);
    });

    return Array.from(rollups.values()).sort(
      (left, right) =>
        right.urgent - left.urgent ||
        right.problems - left.problems ||
        right.dataGaps - left.dataGaps ||
        left.ranchName.localeCompare(right.ranchName),
    );
  }, [blocksById, dashboard.blockInsights, dashboard.events, ranchNameById, today]);

  const handleCopyIrrigationHandoff = async () => {
    const topLines = irrigationOperationalQueue.slice(0, 5).map((entry) => {
      const blockLabel = entry.block?.name ?? 'Unknown block';
      const ranchLabel = showPortfolioLabels ? ` / ${entry.ranchName}` : '';
      return `- ${blockLabel}${ranchLabel}: ${formatPressureStatusLabel(entry.insight.pressureStatus)}; ${irrigationNextActionCopy({
        insight: entry.insight,
        openProblemEvents: entry.openProblemEvents,
        upcomingEvent: entry.upcomingEvent,
      })}`;
    });

    const rollupLines = irrigationRanchRollups.slice(0, 5).map((row) => {
      return `- ${row.ranchName}: ${row.urgent} urgent, ${row.dataGaps} data gaps, ${row.problems} problem events, ${row.scheduled} scheduled blocks`;
    });

    const selectedLine = selectedOperationalEntry
      ? `Selected block: ${selectedOperationalEntry.block?.name ?? 'Unknown block'} / ${formatPressureStatusLabel(selectedOperationalEntry.insight.pressureStatus)} / ${irrigationNextActionCopy({
          insight: selectedOperationalEntry.insight,
          openProblemEvents: selectedOperationalEntry.openProblemEvents,
          upcomingEvent: selectedOperationalEntry.upcomingEvent,
        })}`
      : 'Selected block: none';

    try {
      await navigator.clipboard.writeText(
        [
          `${selectedScopeLabel} irrigation handoff`,
          selectedLine,
          `Summary: ${dashboard.summary.blocksOverTrigger} over trigger, ${dashboard.summary.forecastCrossings} forecast crossings, ${problemCount} problem events, ${scheduledCount} scheduled runs.`,
          'Priority queue:',
          ...topLines,
          !selectedRanch && rollupLines.length > 0 ? 'Ranch pressure:' : '',
          ...(!selectedRanch ? rollupLines : []),
        ]
          .filter(Boolean)
          .join('\n'),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to copy irrigation handoff summary.');
    }
  };

  const handleScopeChange = async (nextRanchId: string) => {
    setSelectedRanchId(nextRanchId);
    setScopeLoading(true);
    setErrorMessage('');

    try {
      const payload = await loadScopedDashboard(nextRanchId);
      setSelectedBlockId(payload.blocks[0]?.id ?? '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh irrigation scope.');
    } finally {
      setScopeLoading(false);
    }
  };

  const patchEventInState = (updatedEvent: IrrigationEventRecord) => {
    setDashboard((current) => ({
      ...current,
      events: sortEvents(current.events.map((event) => (event.id === updatedEvent.id ? updatedEvent : event))),
    }));
  };

  const handleConfigSubmit = async () => {
    if (!selectedBlock) return;
    setIsSavingConfig(true);
    setErrorMessage('');
    try {
      const savedConfig = await saveIrrigationConfig(selectedBlock.id, configValues);
      setDashboard((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === selectedBlock.id ? { ...block, config: savedConfig } : block)),
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save irrigation config.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleCreateEvent = async () => {
    setIsCreatingEvent(true);
    setErrorMessage('');
    try {
      const createdEvent = await createIrrigationEvent(eventValues);
      setDashboard((current) => ({ ...current, events: sortEvents([createdEvent, ...current.events]) }));
      setEventValues({ ...defaultEventFormValues(selectedBlockId || ''), blockId: selectedBlockId || '', scheduledDate: todayDateValue() });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create irrigation event.');
    } finally {
      setIsCreatingEvent(false);
    }
  };

  const handleStatusChange = async (eventId: string, nextStatus: IrrigationEventRecord['status']) => {
    setUpdatingEvent({ id: eventId, status: nextStatus });
    setErrorMessage('');
    try {
      patchEventInState(await updateIrrigationEvent(eventId, { status: nextStatus }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update irrigation event.');
    } finally {
      setUpdatingEvent(null);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-600">Loading irrigation workspace...</div>;

  if (ranches.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">No ranch available yet</h1>
          <p className="mt-2 text-sm text-gray-600">Finish onboarding before managing irrigation.</p>
          <Link href="/onboarding" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">Return to onboarding</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8 animate-fade-in">
      <div className="flex flex-col gap-4 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Irrigation</p>
          <h1 className="text-3xl font-bold text-gray-900">{selectedScopeLabel} irrigation</h1>
          <p className="text-sm text-gray-600">
            Live irrigation config and event scheduling for {selectedRanch ? 'the selected ranch' : 'the current portfolio scope'}.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700"><div className="font-semibold text-gray-900">{dashboard.blocks.length}</div><div>Active blocks</div></div>
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700"><div className="font-semibold text-gray-900">{dashboard.stations.length}</div><div>CIMIS stations</div></div>
        </div>
      </div>

      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Ranch scope</p>
            <h2 className="mt-2 text-xl font-semibold text-gray-900">{selectedScopeLabel}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {ranchesInScope} ranch{ranchesInScope === 1 ? '' : 'es'} in view.
              {showPortfolioLabels ? ' Block and event lists include ranch labels in portfolio mode.' : ''}
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Configured Blocks" value={configuredBlockCount} detail="Blocks with irrigation settings" />
        <MetricCard label="Over Trigger" value={dashboard.summary.blocksOverTrigger} detail="Blocks already above ET trigger" />
        <MetricCard label="Forecast Crossings" value={dashboard.summary.forecastCrossings} detail="Blocks projected across trigger soon" />
        <MetricCard label="Data Gaps" value={dashboard.summary.staleStations + dashboard.summary.missingDataBlocks} detail="Blocks needing ET or station follow-through" />
      </div>

      {dashboard.blocks.length === 0 ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Create your first block to unlock irrigation planning</h2>
          <p className="mt-2 text-sm text-gray-600">Irrigation config and events are scoped to live ranch blocks.</p>
          <Link href="/blocks/new" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">Create first block</Link>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-ranch-border bg-gray-50 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Operational workbench</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Triage irrigation pressure and crew follow-through from the existing ET insight and event history.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyIrrigationHandoff()}
                className="inline-flex items-center justify-center rounded-lg border border-ranch-border bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Copy handoff summary
              </button>
            </div>

            <div className="grid gap-4 p-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-3">
                {irrigationOperationalQueue.length === 0 ? (
                  <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-4 text-sm text-gray-600">
                    No irrigation pressure is active in this scope yet.
                  </div>
                ) : (
                  irrigationOperationalQueue.map((entry) => (
                    <button
                      key={entry.insight.blockId}
                      type="button"
                      onClick={() => setSelectedBlockId(entry.insight.blockId)}
                      className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                        selectedBlockId === entry.insight.blockId
                          ? 'border-green-300 bg-green-50/40'
                          : 'border-ranch-border bg-gray-50 hover:bg-gray-100/70'
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{entry.block?.name ?? 'Unknown block'}</p>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${pressureTone(entry.insight.pressureStatus)}`}>
                              {formatPressureStatusLabel(entry.insight.pressureStatus)}
                            </span>
                          </div>
                          {showPortfolioLabels ? (
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{entry.ranchName}</p>
                          ) : null}
                          <p className="mt-2 text-sm text-gray-600">
                            {irrigationNextActionCopy({
                              insight: entry.insight,
                              openProblemEvents: entry.openProblemEvents,
                              upcomingEvent: entry.upcomingEvent,
                            })}
                          </p>
                        </div>
                        <div className="text-sm text-gray-600 lg:text-right">
                          <div>
                            <span className="font-semibold text-gray-900">{formatInches(entry.insight.currentEtDeficitInches)}</span> current
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">{formatInches(entry.insight.projectedEtDeficitInches)}</span> projected
                          </div>
                          <div>{entry.openProblemEvents} problem event{entry.openProblemEvents === 1 ? '' : 's'}</div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Selected block action</p>
                  {selectedBlock && selectedInsight ? (
                    <div className="mt-3 space-y-3 text-sm text-gray-600">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">{selectedBlock.name}</p>
                        <p className="mt-1">
                          {formatPressureStatusLabel(selectedInsight.pressureStatus)}
                          {showPortfolioLabels ? ` / ${ranchNameById.get(selectedBlock.ranchId) ?? 'Unknown ranch'}` : ''}
                        </p>
                      </div>
                      <p>{irrigationNextActionCopy({
                        insight: selectedInsight,
                        openProblemEvents: selectedOperationalEntry?.openProblemEvents ?? 0,
                        upcomingEvent: selectedOperationalEntry?.upcomingEvent ?? null,
                      })}</p>
                      <p>
                        Current deficit: <span className="font-semibold text-gray-900">{formatInches(selectedInsight.currentEtDeficitInches)}</span>
                      </p>
                      <p>
                        Projected deficit: <span className="font-semibold text-gray-900">{formatInches(selectedInsight.projectedEtDeficitInches)}</span>
                      </p>
                      <p>
                        Trigger: <span className="font-semibold text-gray-900">{formatInches(selectedInsight.deficitTriggerInches)}</span>
                      </p>
                      <p>
                        Upcoming run:{' '}
                        <span className="font-semibold text-gray-900">
                          {selectedOperationalEntry?.upcomingEvent
                            ? `${formatIrrigationDate(selectedOperationalEntry.upcomingEvent.scheduledDate)} / ${formatRuntimeHours(selectedOperationalEntry.upcomingEvent.plannedRuntimeHours)}`
                            : 'None scheduled'}
                        </span>
                      </p>
                      <p>
                        Problem events:{' '}
                        <span className="font-semibold text-gray-900">
                          {selectedOperationalEntry?.openProblemEvents ?? 0}
                        </span>
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-gray-600">Select a pressure row to review the current irrigation action context.</p>
                  )}
                </div>

                {!selectedRanch && ranches.length > 1 ? (
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Ranch pressure</p>
                    <div className="mt-3 space-y-3 text-sm text-gray-600">
                      {irrigationRanchRollups.length === 0 ? (
                        <p>No ranch irrigation pressure yet.</p>
                      ) : (
                        irrigationRanchRollups.slice(0, 6).map((row) => (
                          <button
                            key={row.ranchId}
                            type="button"
                            onClick={() => void handleScopeChange(row.ranchId)}
                            className="w-full rounded-lg border border-white/80 bg-white px-3 py-3 text-left shadow-sm hover:bg-gray-50"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-gray-900">{row.ranchName}</p>
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                                {row.activeBlocks} blocks
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3">
                              <span>Urgent {row.urgent}</span>
                              <span>Data gaps {row.dataGaps}</span>
                              <span>Problem events {row.problems}</span>
                              <span>Scheduled {row.scheduled}</span>
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

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-ranch-border bg-gray-50 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">Block irrigation config</h2>
                  <p className="mt-1 text-sm text-gray-500">Select a block and save its irrigation assumptions.</p>
                </div>
                <select value={selectedBlockId} onChange={(event) => setSelectedBlockId(event.target.value)} className="rounded-lg border border-ranch-border bg-white px-3 py-2 text-sm text-gray-900">
                  {dashboard.blocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {showPortfolioLabels
                        ? `${block.name} (${ranchNameById.get(block.ranchId) ?? 'Unknown ranch'})`
                        : block.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedBlock ? (
                <div className="grid gap-6 p-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <div className="space-y-5">
                    <BlockSummary
                      block={selectedBlock}
                      ranchName={showPortfolioLabels ? ranchNameById.get(selectedBlock.ranchId) ?? 'Unknown ranch' : null}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">CIMIS station</span><select value={configValues.cimisStationId} onChange={(event) => setConfigValues((current) => ({ ...current, cimisStationId: event.target.value }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"><option value="">No station selected</option>{dashboard.stations.map((station) => <option key={station.id} value={station.id}>{station.name}{station.county ? ` (${station.county})` : ''}</option>)}</select></label>
                      <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Soil type</span><select value={configValues.soilType} onChange={(event) => setConfigValues((current) => ({ ...current, soilType: event.target.value as IrrigationConfigFormValues['soilType'] }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"><option value="">Select soil type</option>{soilTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                      <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Emitter flow (GPH)</span><input type="number" min="0" step="0.001" value={configValues.emitterFlowGph} onChange={(event) => setConfigValues((current) => ({ ...current, emitterFlowGph: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                      <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Emitters per tree</span><input type="number" min="0" step="1" value={configValues.emittersPerTree} onChange={(event) => setConfigValues((current) => ({ ...current, emittersPerTree: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                      <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Tree spacing (ft)</span><input type="number" min="0" step="0.01" value={configValues.treeSpacingFt} onChange={(event) => setConfigValues((current) => ({ ...current, treeSpacingFt: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                      <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Row spacing (ft)</span><input type="number" min="0" step="0.01" value={configValues.rowSpacingFt} onChange={(event) => setConfigValues((current) => ({ ...current, rowSpacingFt: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                      <label className="space-y-2 md:col-span-2"><span className="text-sm font-semibold text-gray-900">Deficit trigger (inches)</span><input type="number" min="0" step="0.01" value={configValues.deficitTriggerInches} onChange={(event) => setConfigValues((current) => ({ ...current, deficitTriggerInches: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                    </div>
                    <button type="button" onClick={() => void handleConfigSubmit()} disabled={isSavingConfig} className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">{isSavingConfig ? 'Saving config...' : 'Save irrigation config'}</button>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Water timing</p>
                          <p className="mt-2 text-lg font-semibold text-gray-900">
                            {selectedInsight ? formatPressureStatusLabel(selectedInsight.pressureStatus) : 'No insight yet'}
                          </p>
                        </div>
                        {selectedInsight ? (
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${pressureTone(selectedInsight.pressureStatus)}`}>
                            {formatPressureStatusLabel(selectedInsight.pressureStatus)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm text-gray-600">
                        {selectedInsight ? pressureSummaryCopy(selectedInsight.pressureStatus) : 'Save station and emitter assumptions to unlock ET-based timing.'}
                      </p>
                      {selectedInsight ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border border-ranch-border bg-white px-3 py-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Current deficit</div>
                            <div className="mt-1 font-semibold text-gray-900">{formatInches(selectedInsight.currentEtDeficitInches)}</div>
                          </div>
                          <div className="rounded-lg border border-ranch-border bg-white px-3 py-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Trigger</div>
                            <div className="mt-1 font-semibold text-gray-900">{formatInches(selectedInsight.deficitTriggerInches)}</div>
                          </div>
                          <div className="rounded-lg border border-ranch-border bg-white px-3 py-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">3-day forecast ETc</div>
                            <div className="mt-1 font-semibold text-gray-900">{formatInches(selectedInsight.forecastEtInches)}</div>
                          </div>
                          <div className="rounded-lg border border-ranch-border bg-white px-3 py-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Projected deficit</div>
                            <div className="mt-1 font-semibold text-gray-900">{formatInches(selectedInsight.projectedEtDeficitInches)}</div>
                          </div>
                        </div>
                      ) : null}
                      {selectedInsight?.runtimeRecommendation ? (
                        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                          Estimated runtime is about {selectedInsight.runtimeRecommendation.recommendedRuntimeHours.toFixed(2)} hours at the saved emitter setup, applying about {selectedInsight.runtimeRecommendation.grossWaterNeededInches.toFixed(2)} inches gross water.
                        </div>
                      ) : null}
                      {selectedInsight?.triggerCrossingDate ? (
                        <div className="mt-3 text-sm text-gray-600">
                          Forecast crossing date: <span className="font-semibold text-gray-900">{formatIrrigationDate(selectedInsight.triggerCrossingDate)}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Saved config</p>
                      <div className="mt-3 space-y-2 text-sm text-gray-600">
                        <p><span className="font-semibold text-gray-900">Soil:</span> {formatSoilTypeLabel(selectedBlock.config?.soilType)}</p>
                        <p><span className="font-semibold text-gray-900">Station:</span> {selectedBlock.config?.cimisStation?.name ?? 'Not set'}</p>
                        <p><span className="font-semibold text-gray-900">Deficit trigger:</span> {selectedBlock.config?.deficitTriggerInches ?? '1.50'} in</p>
                        <p><span className="font-semibold text-gray-900">Emitter flow:</span> {selectedBlock.config?.emitterFlowGph ?? 'Not set'} GPH</p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Next scheduled run</p>
                      {nextScheduledEvent ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-lg font-semibold text-gray-900">{formatIrrigationDate(nextScheduledEvent.scheduledDate)}</p>
                          <p className="text-sm text-gray-600">
                            {nextScheduledEvent.scheduledStartTime
                              ? `${nextScheduledEvent.scheduledStartTime} / `
                              : ''}
                            {formatRuntimeHours(nextScheduledEvent.plannedRuntimeHours)}
                          </p>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(nextScheduledEvent.status)}`}>{formatIrrigationStatusLabel(nextScheduledEvent.status)}</span>
                        </div>
                      ) : <p className="mt-3 text-sm text-gray-600">No scheduled irrigation event yet for this block.</p>}
                    </div>
                    {selectedBlock.isOrganic ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">This block is marked organic. Keep inline amendments and related notes aligned with your organic handling requirements.</div> : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Schedule irrigation event</h2>
                <p className="mt-1 text-sm text-gray-500">Create the next planned run for a current block in scope.</p>
              </div>
              <div className="grid gap-4 p-6 md:grid-cols-2">
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Block</span><select value={eventValues.blockId} onChange={(event) => setEventValues((current) => ({ ...current, blockId: event.target.value }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">{dashboard.blocks.map((block) => <option key={block.id} value={block.id}>{showPortfolioLabels ? `${block.name} (${ranchNameById.get(block.ranchId) ?? 'Unknown ranch'})` : block.name}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Scheduled date</span><input type="date" value={eventValues.scheduledDate} onChange={(event) => setEventValues((current) => ({ ...current, scheduledDate: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Start time</span><input type="time" value={eventValues.scheduledStartTime} onChange={(event) => setEventValues((current) => ({ ...current, scheduledStartTime: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Planned runtime (hours)</span><input type="number" min="0" step="0.01" value={eventValues.plannedRuntimeHours} onChange={(event) => setEventValues((current) => ({ ...current, plannedRuntimeHours: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Planned flow rate (GPM)</span><input type="number" min="0" step="0.001" value={eventValues.plannedFlowRateGpm} onChange={(event) => setEventValues((current) => ({ ...current, plannedFlowRateGpm: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">ET deficit (inches)</span><input type="number" min="0" step="0.0001" value={eventValues.etDeficitInches} onChange={(event) => setEventValues((current) => ({ ...current, etDeficitInches: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2 md:col-span-2"><span className="text-sm font-semibold text-gray-900">Notes</span><textarea value={eventValues.notes} onChange={(event) => setEventValues((current) => ({ ...current, notes: event.target.value }))} rows={4} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="Crew notes, overnight window, or flow expectations." /></label>
              </div>
              <div className="px-6 pb-6"><button type="button" onClick={() => void handleCreateEvent()} disabled={isCreatingEvent} className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">{isCreatingEvent ? 'Scheduling...' : 'Create irrigation event'}</button></div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900">{selectedScopeLabel} irrigation snapshot</h2>
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-ranch-border bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Configured coverage</p><p className="mt-2 text-2xl font-bold text-gray-900">{configuredBlockCount}/{dashboard.blocks.length}</p><p className="mt-1 text-sm text-gray-600">Blocks with saved irrigation settings</p></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-ranch-border bg-red-50 p-4"><div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700"><Droplets className="h-5 w-5" /></div><p className="mt-3 text-xl font-bold text-gray-900">{dashboard.summary.blocksOverTrigger}</p><p className="text-sm text-gray-600">Blocks over trigger</p></div>
                  <div className="rounded-xl border border-ranch-border bg-amber-50 p-4"><div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><Waves className="h-5 w-5" /></div><p className="mt-3 text-xl font-bold text-gray-900">{dashboard.summary.forecastCrossings}</p><p className="text-sm text-gray-600">Forecast crossings</p></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4"><div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700"><CalendarDays className="h-5 w-5" /></div><p className="mt-3 text-xl font-bold text-gray-900">{scheduledCount}</p><p className="text-sm text-gray-600">Upcoming runs</p></div>
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4"><div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><Leaf className="h-5 w-5" /></div><p className="mt-3 text-xl font-bold text-gray-900">{completedCount}</p><p className="text-sm text-gray-600">Completed runs</p></div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Water pressure board</h2>
                <p className="mt-1 text-sm text-gray-500">Ranked view of current ET pressure and near-term forecast pressure by block.</p>
              </div>
              <div className="divide-y">
                {dashboard.blockInsights.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-gray-600">No ET insights yet. Link stations and let persisted weather data land first.</div>
                ) : (
                  dashboard.blockInsights
                    .slice()
                    .sort((left, right) => {
                      const order = ['over_trigger', 'forecast_crossing', 'near_trigger', 'stale_et', 'missing_et', 'missing_station', 'unconfigured', 'under_trigger'];
                      const statusDiff = order.indexOf(left.pressureStatus) - order.indexOf(right.pressureStatus);
                      if (statusDiff !== 0) return statusDiff;
                      return (right.projectedEtDeficitInches ?? -1) - (left.projectedEtDeficitInches ?? -1);
                    })
                    .slice(0, 8)
                    .map((insight) => {
                      const block = dashboard.blocks.find((entry) => entry.id === insight.blockId);
                      return (
                        <button
                          key={insight.blockId}
                          type="button"
                          onClick={() => setSelectedBlockId(insight.blockId)}
                          className="w-full px-6 py-4 text-left transition-colors hover:bg-gray-50"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-gray-900">{block?.name ?? 'Unknown block'}</p>
                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${pressureTone(insight.pressureStatus)}`}>
                                  {formatPressureStatusLabel(insight.pressureStatus)}
                                </span>
                              </div>
                              {showPortfolioLabels && block ? (
                                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                                  {ranchNameById.get(block.ranchId) ?? 'Unknown ranch'}
                                </p>
                              ) : null}
                              <p className="mt-1 text-sm text-gray-600">{pressureSummaryCopy(insight.pressureStatus)}</p>
                            </div>
                            <div className="text-sm text-gray-600 sm:text-right">
                              <div><span className="font-semibold text-gray-900">{formatInches(insight.currentEtDeficitInches)}</span> current</div>
                              <div><span className="font-semibold text-gray-900">{formatInches(insight.projectedEtDeficitInches)}</span> projected</div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Linked station ET snapshot</h2>
                <p className="mt-1 text-sm text-gray-500">Latest persisted ET plus the next 3-day forecast window for linked stations.</p>
              </div>
              <div className="divide-y">
                {dashboard.stationSnapshots.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-gray-600">No linked stations yet.</div>
                ) : (
                  dashboard.stationSnapshots.map((station) => (
                    <div key={station.stationId} className="px-6 py-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{station.stationName}</p>
                          <p className="text-sm text-gray-600">
                            {station.county ? `${station.county} County` : 'County not set'} / {station.linkedBlockCount} linked block{station.linkedBlockCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-[18rem]">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Latest ET</div>
                            <div className="mt-1 font-semibold text-gray-900">{formatInches(station.latestEtInches, 3)}</div>
                            <div className="text-gray-500">{station.latestEtDate ? formatIrrigationDate(station.latestEtDate) : 'No ET yet'}</div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">3-Day outlook</div>
                            <div className="mt-1 font-semibold text-gray-900">{formatInches(station.threeDayForecastEtInches, 3)}</div>
                            <div className="text-gray-500">Peak {formatTemperatureF(station.hottestForecastTempF)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4"><h2 className="font-semibold text-gray-900">Recent irrigation events</h2></div>
              <div className="divide-y">
                {dashboard.events.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-gray-600">No irrigation events yet.</div>
                ) : (
                  dashboard.events.slice(0, 10).map((event) => {
                    const eventBlock = dashboard.blocks.find((block) => block.id === event.blockId);

                    return (
                      <div key={event.id} className="space-y-3 px-6 py-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-gray-900">{event.blockName}</p>
                            {showPortfolioLabels ? (
                              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                                {ranchNameById.get(eventBlock?.ranchId ?? '') ?? 'Unknown ranch'}
                              </p>
                            ) : null}
                            <p className="text-sm text-gray-600">
                              <CalendarDays className="mr-1 inline h-4 w-4" />
                              {formatIrrigationDate(event.scheduledDate)}
                              {event.scheduledStartTime ? ` / ${event.scheduledStartTime}` : ''}
                            </p>
                            <p className="mt-1 text-sm text-gray-600">
                              Planned runtime {formatRuntimeHours(event.plannedRuntimeHours)}
                              {event.etDeficitInches ? ` / ET deficit ${event.etDeficitInches} in` : ''}
                            </p>
                          </div>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(event.status)}`}>{formatIrrigationStatusLabel(event.status)}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {irrigationEventStatusOptions.map((option) => (
                            <button key={option.value} type="button" onClick={() => void handleStatusChange(event.id, option.value)} disabled={updatingEvent?.id === event.id || event.status === option.value} className="rounded-full border border-ranch-border px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                              {updatingEvent?.id === event.id && updatingEvent.status === option.value ? 'Updating...' : option.label}
                            </button>
                          ))}
                        </div>
                        {event.notes ? <p className="text-sm text-gray-600">{event.notes}</p> : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {selectedInsight?.forecastWindow?.length ? (
              <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
                <h2 className="font-semibold text-gray-900">Selected block forecast window</h2>
                <div className="mt-4 space-y-3">
                  {selectedInsight.forecastWindow.map((day) => (
                    <div key={day.forecastDate} className="flex flex-col gap-2 rounded-xl border border-ranch-border bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">{formatIrrigationDate(day.forecastDate)}</div>
                        <div className="text-sm text-gray-600">Forecast ET {formatInches(day.etoInches, 3)}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                        <span className="rounded-full bg-white px-3 py-1">High {formatTemperatureF(day.maxTempF)}</span>
                        <span className="rounded-full bg-white px-3 py-1">Low {formatTemperatureF(day.minTempF)}</span>
                        <span className="rounded-full bg-white px-3 py-1">Rain chance {formatPercent(day.precipitationProbabilityPct)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {problemCount > 0 ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><div className="flex items-start gap-3"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" /><p>{problemCount} irrigation event{problemCount === 1 ? '' : 's'} are currently marked with issues and may need follow-up.</p></div></div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><div className="flex items-start gap-3"><Leaf className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p>No irrigation events are currently flagged as problems.</p></div></div>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
