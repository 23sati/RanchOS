'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ClipboardPenLine, Save, Tractor, Users } from 'lucide-react';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { fetchRanches, type RanchRecord } from '@/lib/ranches';
import {
  HarvestDashboardPayload,
  HarvestFormValues,
  createHarvestEvent,
  defaultHarvestFormValues,
  fetchHarvestDashboard,
  formatHarvestDate,
  formatHarvestMethod,
  formatHarvestNumber,
  getHarvestExportHref,
  harvestEventToFormValues,
  harvestMethodOptions,
  updateHarvestEvent,
} from '@/lib/harvest';
import { formatBlockCropLabel } from '@/lib/blocks';
import { HandlerTicketPanel } from './HandlerTicketPanel';

const emptyDashboard: HarvestDashboardPayload = {
  blocks: [],
  crewMembers: [],
  harvestEvents: [],
  handlerTicketImports: [],
  summary: {
    totalEvents: 0,
    totalPounds: 0,
    totalBins: 0,
    importedTickets: 0,
    matchedTickets: 0,
    discrepancyTickets: 0,
    unmatchedTickets: 0,
    unreconciledTickets: 0,
  },
};

const ALL_RANCHES_VALUE = 'all';

function sortHarvestEvents(records: HarvestDashboardPayload['harvestEvents']) {
  return [...records].sort((left, right) => {
    const dateDiff = right.harvestDate.localeCompare(left.harvestDate);
    return dateDiff !== 0 ? dateDiff : (right.createdAt ?? '').localeCompare(left.createdAt ?? '');
  });
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

function normalizeTicketKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

type HarvestPortfolioExportRollup = {
  ranchId: string;
  ranchName: string;
  eventCount: number;
  importedTickets: number;
  matchedTickets: number;
  discrepancyTickets: number;
  unmatchedTickets: number;
  unreconciledTickets: number;
  missingLoadTickets: number;
  totalPounds: number;
  totalBins: number;
  latestHarvestDate: string | null;
  blockerReasons: string[];
};

function buildHarvestPortfolioHandoffSummary(rollups: HarvestPortfolioExportRollup[]) {
  return [
    'Harvest portfolio export handoff',
    ...(rollups.length === 0
      ? ['- No ranch harvest data available.']
      : rollups.map((rollup) => {
          const latestHarvest = rollup.latestHarvestDate ? formatHarvestDate(rollup.latestHarvestDate) : 'No harvest events yet';
          const blockerDetail = rollup.blockerReasons.length > 0 ? ` | blockers: ${rollup.blockerReasons.join(', ')}` : '';

          return `- ${rollup.ranchName}: ${rollup.eventCount} events | ${formatHarvestNumber(rollup.totalPounds, 0)} lbs | ${rollup.importedTickets} imports | ${rollup.matchedTickets} matched | ${rollup.unreconciledTickets} open items | latest ${latestHarvest}${blockerDetail}`;
        })),
  ].join('\n');
}

export default function HarvestPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [dashboard, setDashboard] = useState<HarvestDashboardPayload>(emptyDashboard);
  const [selectedRanchId, setSelectedRanchId] = useState<string>(ALL_RANCHES_VALUE);
  const [formValues, setFormValues] = useState<HarvestFormValues>(defaultHarvestFormValues());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const applyDashboard = (payload: HarvestDashboardPayload) => {
    setDashboard({
      ...payload,
      harvestEvents: sortHarvestEvents(payload.harvestEvents),
    });
  };

  const refreshDashboard = async () => {
    const payload = await fetchHarvestDashboard();
    applyDashboard(payload);
    return payload;
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [onboardingStatus, harvestDashboard, ranchRows] = await Promise.all([
          fetchOnboardingStatus(),
          fetchHarvestDashboard(),
          fetchRanches(),
        ]);

        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);
        setRanches(ranchRows);
        setSelectedRanchId(
          ranchRows.length > 1
            ? ALL_RANCHES_VALUE
            : onboardingStatus.ranch?.id ?? ranchRows[0]?.id ?? ALL_RANCHES_VALUE,
        );
        applyDashboard(harvestDashboard);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load harvest workspace.');
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

  const selectedRanch = useMemo(
    () => ranches.find((ranch) => ranch.id === selectedRanchId) ?? null,
    [ranches, selectedRanchId],
  );
  const ranchNameById = useMemo(() => new Map(ranches.map((ranch) => [ranch.id, ranch.name])), [ranches]);
  const selectedScopeLabel = selectedRanch
    ? selectedRanch.name
    : ranches.length > 1
      ? 'All ranches'
      : ranches[0]?.name ?? status?.ranch?.name ?? status?.organization?.name ?? 'Current ranch';
  const showPortfolioLabels = !selectedRanch && ranches.length > 1;
  const blocksInScope = useMemo(
    () => selectedRanch ? dashboard.blocks.filter((block) => block.ranchId === selectedRanch.id) : dashboard.blocks,
    [dashboard.blocks, selectedRanch],
  );
  const blockIdsInScope = useMemo(() => new Set(blocksInScope.map((block) => block.id)), [blocksInScope]);
  const harvestEventsInScope = useMemo(
    () => dashboard.harvestEvents.filter((event) => blockIdsInScope.has(event.blockId)),
    [dashboard.harvestEvents, blockIdsInScope],
  );
  const handlerTicketImportsInScope = useMemo(
    () =>
      selectedRanch
        ? dashboard.handlerTicketImports.filter((record) => record.harvestEvent?.block?.ranchId === selectedRanch.id)
        : dashboard.handlerTicketImports,
    [dashboard.handlerTicketImports, selectedRanch],
  );
  const scopedSummary = useMemo(() => {
    const matchedImportTicketKeys = new Set(
      handlerTicketImportsInScope
        .filter((row) => row.status === 'matched')
        .map((row) => normalizeTicketKey(row.loadTicket))
        .filter(Boolean),
    );
    const unmatchedImports = handlerTicketImportsInScope.filter((row) => row.status === 'unmatched').length;
    const discrepancyImports = handlerTicketImportsInScope.filter((row) => row.status === 'discrepancy').length;
    const openHarvestTickets = harvestEventsInScope.filter(
      (event) =>
        event.loadTicket &&
        event.handlerTicketReconciled !== true &&
        !matchedImportTicketKeys.has(normalizeTicketKey(event.loadTicket)),
    ).length;

    return {
      totalEvents: harvestEventsInScope.length,
      totalPounds: Number(
        harvestEventsInScope.reduce((sum, event) => sum + Number(event.totalPounds ?? 0), 0).toFixed(2),
      ),
      totalBins: harvestEventsInScope.reduce((sum, event) => sum + Number(event.totalBins ?? 0), 0),
      importedTickets: handlerTicketImportsInScope.length,
      matchedTickets: handlerTicketImportsInScope.filter((row) => row.status === 'matched').length,
      discrepancyTickets: discrepancyImports,
      unmatchedTickets: unmatchedImports,
      unreconciledTickets: openHarvestTickets + unmatchedImports + discrepancyImports,
    };
  }, [handlerTicketImportsInScope, harvestEventsInScope]);
  const hiddenPortfolioTicketCount = selectedRanch
    ? dashboard.handlerTicketImports.length - handlerTicketImportsInScope.length
    : 0;
  const handlerScopeNote = selectedRanch && hiddenPortfolioTicketCount > 0
    ? `${hiddenPortfolioTicketCount} additional portfolio ticket${hiddenPortfolioTicketCount === 1 ? '' : 's'} stay visible only in the all-ranches view.`
    : null;
  const portfolioExportRollups = useMemo<HarvestPortfolioExportRollup[]>(() => {
    return ranches
      .map((ranch) => {
        const ranchBlocks = dashboard.blocks.filter((block) => block.ranchId === ranch.id);
        const ranchBlockIds = new Set(ranchBlocks.map((block) => block.id));
        const ranchEvents = dashboard.harvestEvents.filter((event) => ranchBlockIds.has(event.blockId));
        const ranchImports = dashboard.handlerTicketImports.filter((record) => record.harvestEvent?.block?.ranchId === ranch.id);
        const matchedImportTicketKeys = new Set(
          ranchImports
            .filter((row) => row.status === 'matched')
            .map((row) => normalizeTicketKey(row.loadTicket))
            .filter(Boolean),
        );
        const discrepancyTickets = ranchImports.filter((row) => row.status === 'discrepancy').length;
        const unmatchedTickets = ranchImports.filter((row) => row.status === 'unmatched').length;
        const missingLoadTickets = ranchEvents.filter((event) => !event.loadTicket).length;
        const openHarvestTickets = ranchEvents.filter(
          (event) =>
            event.loadTicket &&
            event.handlerTicketReconciled !== true &&
            !matchedImportTicketKeys.has(normalizeTicketKey(event.loadTicket)),
        ).length;
        const unreconciledTickets = openHarvestTickets + unmatchedTickets + discrepancyTickets;
        const blockerReasons = [
          discrepancyTickets > 0 ? 'ticket discrepancies' : null,
          unmatchedTickets > 0 ? 'unmatched imports' : null,
          openHarvestTickets > 0 ? 'open event tickets' : null,
          missingLoadTickets > 0 ? 'missing load tickets' : null,
        ].filter((value): value is string => Boolean(value));

        return {
          ranchId: ranch.id,
          ranchName: ranch.name,
          eventCount: ranchEvents.length,
          importedTickets: ranchImports.length,
          matchedTickets: ranchImports.filter((row) => row.status === 'matched').length,
          discrepancyTickets,
          unmatchedTickets,
          unreconciledTickets,
          missingLoadTickets,
          totalPounds: Number(ranchEvents.reduce((sum, event) => sum + Number(event.totalPounds ?? 0), 0).toFixed(2)),
          totalBins: ranchEvents.reduce((sum, event) => sum + Number(event.totalBins ?? 0), 0),
          latestHarvestDate: [...ranchEvents].sort((left, right) => right.harvestDate.localeCompare(left.harvestDate))[0]?.harvestDate ?? null,
          blockerReasons,
        };
      })
      .sort((left, right) => {
        if (right.unreconciledTickets !== left.unreconciledTickets) {
          return right.unreconciledTickets - left.unreconciledTickets;
        }

        if (right.eventCount !== left.eventCount) {
          return right.eventCount - left.eventCount;
        }

        return left.ranchName.localeCompare(right.ranchName);
      });
  }, [dashboard.blocks, dashboard.handlerTicketImports, dashboard.harvestEvents, ranches]);
  const portfolioReadyRanches = useMemo(
    () => portfolioExportRollups.filter((rollup) => rollup.eventCount > 0 && rollup.unreconciledTickets === 0 && rollup.missingLoadTickets === 0).length,
    [portfolioExportRollups],
  );

  const handleCopyPortfolioHandoff = async () => {
    try {
      await navigator.clipboard.writeText(buildHarvestPortfolioHandoffSummary(portfolioExportRollups));
      setSuccessMessage('Harvest portfolio handoff summary copied.');
      setErrorMessage('');
    } catch {
      setErrorMessage('Unable to copy harvest portfolio handoff summary.');
    }
  };

  useEffect(() => {
    if (!blocksInScope.length) {
      if (formValues.blockId) {
        setFormValues((current) => ({ ...current, blockId: '' }));
      }
      return;
    }

    if (!blocksInScope.some((block) => block.id === formValues.blockId)) {
      setFormValues((current) => ({
        ...current,
        blockId: blocksInScope[0]?.id ?? '',
      }));
    }
  }, [blocksInScope, formValues.blockId]);

  const selectedBlock = useMemo(
    () => blocksInScope.find((block) => block.id === formValues.blockId) ?? null,
    [blocksInScope, formValues.blockId],
  );

  const selectedCrewIds = new Set(formValues.crewIds);

  const resetForm = () => {
    setEditingEventId(null);
    setFormValues(defaultHarvestFormValues(blocksInScope[0]?.id ?? ''));
  };

  const handleScopeChange = (nextRanchId: string) => {
    setSelectedRanchId(nextRanchId);
    setEditingEventId(null);
    setSuccessMessage('');
    setErrorMessage('');
    const nextBlocks =
      nextRanchId === ALL_RANCHES_VALUE
        ? dashboard.blocks
        : dashboard.blocks.filter((block) => block.ranchId === nextRanchId);
    setFormValues(defaultHarvestFormValues(nextBlocks[0]?.id ?? ''));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (editingEventId) {
        await updateHarvestEvent(editingEventId, formValues);
        await refreshDashboard();
        setSuccessMessage('Harvest event updated.');
      } else {
        await createHarvestEvent(formValues);
        await refreshDashboard();
        setSuccessMessage('Harvest event created.');
      }

      resetForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save harvest event.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading harvest workflow...</div>;
  }

  if (!status?.organization) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Finish onboarding first</h1>
          <p className="mt-2 text-sm text-gray-600">Harvest tracking unlocks after the workspace is connected to an organization.</p>
          <Link href="/onboarding" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
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
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Harvest</p>
          <h1 className="text-3xl font-bold text-gray-900">{selectedScopeLabel} harvest log</h1>
          <p className="text-sm text-gray-600">Capture harvest events against real blocks and crews, import handler tickets, and reconcile both sides from the same live data.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={getHarvestExportHref(selectedRanch?.id)} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700">
            <ArrowDownToLine className="h-4 w-4" />
            Export CSV
          </a>
          {!selectedRanch && ranches.length > 1 ? (
            <button
              type="button"
              onClick={() => void handleCopyPortfolioHandoff()}
              className="inline-flex items-center gap-2 rounded-xl border border-ranch-border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ClipboardPenLine className="h-4 w-4" />
              Copy portfolio handoff
            </button>
          ) : null}
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

      <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Ranch scope</p>
            <h2 className="mt-2 text-xl font-semibold text-gray-900">{selectedScopeLabel}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {selectedRanch ? 'Focused on a single ranch.' : 'Portfolio-wide harvest view.'}
              {showPortfolioLabels ? ' Event and block lists include ranch labels in all-ranches mode.' : ''}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {ranches.length > 1 ? (
            <button
              type="button"
              onClick={() => handleScopeChange(ALL_RANCHES_VALUE)}
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
              onClick={() => handleScopeChange(ranch.id)}
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

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Events" value={scopedSummary.totalEvents} detail="Harvest events logged" />
        <MetricCard label="Pounds" value={formatHarvestNumber(scopedSummary.totalPounds, 0)} detail="Gross pounds captured" />
        <MetricCard label="Imports" value={scopedSummary.importedTickets} detail={`${scopedSummary.matchedTickets} matched handler tickets`} />
        <MetricCard label="Open Items" value={scopedSummary.unreconciledTickets} detail={`${scopedSummary.unmatchedTickets} unmatched and ${scopedSummary.discrepancyTickets} flagged`} />
      </div>

      {!selectedRanch && ranches.length > 1 ? (
        <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
          <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Portfolio harvest workbench</h2>
                <p className="mt-1 text-sm text-gray-500">Ranch-by-ranch export readiness and reconciliation pressure on top of the current persisted harvest workspace.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                <span className="rounded-full border border-ranch-border bg-white px-3 py-1.5 font-semibold text-gray-700">
                  {portfolioReadyRanches}/{ranches.length} ranches export-ready
                </span>
                <span className="rounded-full border border-ranch-border bg-white px-3 py-1.5 font-semibold text-gray-700">
                  {portfolioExportRollups.reduce((sum, rollup) => sum + rollup.unreconciledTickets + rollup.missingLoadTickets, 0)} open admin items
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-3">
              {portfolioExportRollups.map((rollup) => (
                <div key={rollup.ranchId} className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{rollup.ranchName}</p>
                        {rollup.eventCount === 0 ? (
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">No harvest events</span>
                        ) : rollup.unreconciledTickets === 0 && rollup.missingLoadTickets === 0 ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Export ready</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                            {rollup.unreconciledTickets + rollup.missingLoadTickets} open items
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                        <span>{rollup.eventCount} events</span>
                        <span>{formatHarvestNumber(rollup.totalPounds, 0)} lbs</span>
                        <span>{formatHarvestNumber(rollup.totalBins, 0)} bins</span>
                        {rollup.latestHarvestDate ? <span>Latest {formatHarvestDate(rollup.latestHarvestDate)}</span> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">Imports {rollup.importedTickets}</span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">Matched {rollup.matchedTickets}</span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">Open {rollup.unreconciledTickets}</span>
                      </div>
                      {rollup.blockerReasons.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {rollup.blockerReasons.map((reason) => (
                            <span key={reason} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                              {reason}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => handleScopeChange(rollup.ranchId)}
                        className="rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Open ranch
                      </button>
                      <a
                        href={getHarvestExportHref(rollup.ranchId)}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
                          rollup.eventCount === 0
                            ? 'pointer-events-none border border-ranch-border bg-gray-100 text-gray-400'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                        Export CSV
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Portfolio guidance</p>
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  <p>Use this workbench to keep harvest exports ranch-specific while still triaging reconciliation across the full portfolio.</p>
                  <p>Readiness stays explicit: no open event tickets, no unmatched or discrepancy imports, and no harvest events missing a load ticket.</p>
                  <p>When a ranch shows blockers, open that ranch and work directly in the existing event list and handler-ticket panel below.</p>
                </div>
              </div>

              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Top blockers</p>
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  {portfolioExportRollups.some((rollup) => rollup.blockerReasons.length > 0) ? (
                    portfolioExportRollups
                      .filter((rollup) => rollup.blockerReasons.length > 0)
                      .slice(0, 5)
                      .map((rollup) => (
                        <div key={rollup.ranchId} className="rounded-lg border border-white/80 bg-white px-3 py-3 shadow-sm">
                          <p className="font-semibold text-gray-900">{rollup.ranchName}</p>
                          <p className="mt-1">{rollup.blockerReasons.join(', ')}</p>
                        </div>
                      ))
                  ) : (
                    <p>All ranches with harvest activity are currently ready for clean downstream export.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {blocksInScope.length === 0 ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">
            {selectedRanch ? 'No blocks in this ranch yet' : 'Create your first block before tracking harvest'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Harvest records stay block-based, just like irrigation, scouting, and compliance.
          </p>
          <Link href="/blocks/new" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            {selectedRanch ? 'Create block in this ranch' : 'Create first block'}
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">{editingEventId ? 'Edit harvest event' : 'Create harvest event'}</h2>
                <p className="mt-1 text-sm text-gray-500">This is the first live harvest workflow for blocks, crews, handler tickets, and basic crop quality notes.</p>
              </div>

              <div className="grid gap-4 p-6 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Block</span>
                  <select value={formValues.blockId} onChange={(event) => setFormValues((current) => ({ ...current, blockId: event.target.value }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                    {blocksInScope.map((block) => (
                      <option key={block.id} value={block.id}>
                        {showPortfolioLabels ? `${block.name} (${ranchNameById.get(block.ranchId) ?? 'Unknown ranch'})` : block.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Harvest date</span>
                  <input type="date" value={formValues.harvestDate} onChange={(event) => setFormValues((current) => ({ ...current, harvestDate: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Method</span>
                  <select value={formValues.harvestMethod} onChange={(event) => setFormValues((current) => ({ ...current, harvestMethod: event.target.value as HarvestFormValues['harvestMethod'] }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                    {harvestMethodOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Total pounds</span>
                  <input type="number" min="0" step="0.01" value={formValues.totalPounds} onChange={(event) => setFormValues((current) => ({ ...current, totalPounds: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Total bins</span>
                  <input type="number" min="0" step="1" value={formValues.totalBins} onChange={(event) => setFormValues((current) => ({ ...current, totalBins: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Bin weight (lbs)</span>
                  <input type="number" min="0" step="0.01" value={formValues.binWeightLbs} onChange={(event) => setFormValues((current) => ({ ...current, binWeightLbs: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Picker count</span>
                  <input type="number" min="0" step="1" value={formValues.pickerCount} onChange={(event) => setFormValues((current) => ({ ...current, pickerCount: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Handler name</span>
                  <input type="text" value={formValues.handlerName} onChange={(event) => setFormValues((current) => ({ ...current, handlerName: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Load ticket</span>
                  <input type="text" value={formValues.loadTicket} onChange={(event) => setFormValues((current) => ({ ...current, loadTicket: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Hulled weight (lbs)</span>
                  <input type="number" min="0" step="0.01" value={formValues.hulledWeightLbs} onChange={(event) => setFormValues((current) => ({ ...current, hulledWeightLbs: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Hull split %</span>
                  <input type="number" min="0" max="100" step="0.01" value={formValues.hullSplitPct} onChange={(event) => setFormValues((current) => ({ ...current, hullSplitPct: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Brix</span>
                  <input type="number" min="0" max="100" step="0.01" value={formValues.brix} onChange={(event) => setFormValues((current) => ({ ...current, brix: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Acid ratio</span>
                  <input type="number" min="0" max="100" step="0.001" value={formValues.acidRatio} onChange={(event) => setFormValues((current) => ({ ...current, acidRatio: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700 md:col-span-2">
                  <input type="checkbox" checked={formValues.handlerTicketReconciled} onChange={(event) => setFormValues((current) => ({ ...current, handlerTicketReconciled: event.target.checked }))} />
                  Handler ticket reconciled
                </label>

                <div className="space-y-3 md:col-span-2">
                  <div>
                    <span className="text-sm font-semibold text-gray-900">Crew on this event</span>
                    <p className="mt-1 text-sm text-gray-500">Choose the crew members who worked this harvest event.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {dashboard.crewMembers.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-ranch-border px-4 py-3 text-sm text-gray-600">
                        No crew members yet. Add them in <Link href="/settings/team" className="font-semibold text-green-700 hover:text-green-800">team settings</Link>.
                      </div>
                    ) : (
                      dashboard.crewMembers.map((crewMember) => (
                        <label key={crewMember.id} className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedCrewIds.has(crewMember.id)}
                            onChange={(event) =>
                              setFormValues((current) => ({
                                ...current,
                                crewIds: event.target.checked
                                  ? [...current.crewIds, crewMember.id]
                                  : current.crewIds.filter((id) => id !== crewMember.id),
                              }))
                            }
                          />
                          <span>{crewMember.fullName}{crewMember.position ? ` / ${crewMember.position}` : ''}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-gray-900">Notes</span>
                  <textarea rows={4} value={formValues.notes} onChange={(event) => setFormValues((current) => ({ ...current, notes: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="Field notes, quality notes, or handler follow-up." />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ranch-border px-6 py-4">
                <div className="text-sm text-gray-500">
                  {editingEventId ? 'Editing the selected harvest event.' : 'Create the first real harvest record for this organization.'}
                </div>
                <div className="flex gap-3">
                  {editingEventId ? (
                    <button type="button" onClick={resetForm} className="rounded-lg border border-ranch-border px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                      Cancel
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void handleSubmit()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : editingEventId ? 'Update harvest event' : 'Create harvest event'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Selected block</h2>
                  <p className="mt-1 text-sm text-gray-500">Quick harvest context from the current form.</p>
                </div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Tractor className="h-6 w-6" />
                </div>
              </div>

              {selectedBlock ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xl font-bold text-gray-900">{selectedBlock.name}</p>
                    {showPortfolioLabels ? (
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                        {ranchNameById.get(selectedBlock.ranchId) ?? 'Unknown ranch'}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                      <span>{formatBlockCropLabel(selectedBlock.cropType)}</span>
                      {selectedBlock.variety ? <span>{selectedBlock.variety}</span> : null}
                      {selectedBlock.acreage ? <span>{selectedBlock.acreage} acres</span> : null}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Selected crew</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">{formValues.crewIds.length}</p>
                    </div>
                    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Planned pounds</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">{formatHarvestNumber(formValues.totalPounds || null, 0)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-gray-600">Choose a block to start the harvest event.</p>
              )}
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Recent harvest events</h2>
              </div>
              <div className="divide-y">
                {harvestEventsInScope.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-gray-600">No harvest events yet. Use the form to create the first one.</div>
                ) : (
                  harvestEventsInScope.slice(0, 14).map((event) => (
                    <div key={event.id} className="space-y-3 px-6 py-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-gray-900">{event.block?.name ?? 'Block'}</p>
                            <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                              {formatHarvestMethod(event.harvestMethod)}
                            </span>
                            {event.loadTicket ? (
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${event.handlerTicketReconciled ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                {event.handlerTicketReconciled ? 'Ticket reconciled' : 'Ticket open'}
                              </span>
                            ) : null}
                          </div>
                          {showPortfolioLabels && event.block ? (
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                              {ranchNameById.get(event.block.ranchId) ?? 'Unknown ranch'}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <span>{formatHarvestDate(event.harvestDate)}</span>
                            {event.totalPounds ? <span>{formatHarvestNumber(event.totalPounds, 0)} lbs</span> : null}
                            {event.totalBins !== null ? <span>{event.totalBins} bins</span> : null}
                            {event.poundsPerAcre !== null ? <span>{formatHarvestNumber(event.poundsPerAcre, 0)} lbs/ac</span> : null}
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <span>{event.crewCount} crew</span>
                            {event.handlerName ? <span>{event.handlerName}</span> : null}
                            {event.loadTicket ? <span>Ticket {event.loadTicket}</span> : null}
                          </div>
                          {event.crewMembers.length > 0 ? (
                            <p className="text-sm text-gray-500">{event.crewMembers.map((crewMember) => crewMember.fullName).join(', ')}</p>
                          ) : null}
                          {event.notes ? <p className="text-sm text-gray-700">{event.notes}</p> : null}
                        </div>

                        <button type="button" onClick={() => {
                          setEditingEventId(event.id);
                          setFormValues(harvestEventToFormValues(event));
                          setSuccessMessage('');
                          setErrorMessage('');
                        }} className="rounded-lg border border-ranch-border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                          Edit
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                <p>
                  This layer now covers live harvest event tracking, first handler ticket imports, and reconciliation against real harvest records. The next clean step is building deeper multi-ranch harvest operations and export polish on top of this.
                </p>
              </div>
            </div>
          </div>
          </div>
          <HandlerTicketPanel
            handlerTicketImports={handlerTicketImportsInScope}
            harvestEvents={harvestEventsInScope}
            onChanged={async () => {
              await refreshDashboard();
            }}
            onError={setErrorMessage}
            onSuccess={setSuccessMessage}
            scopeNote={handlerScopeNote}
          />
        </>
      )}
    </div>
  );
}
