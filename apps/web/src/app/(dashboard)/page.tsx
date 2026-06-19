'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { Building2, ClipboardList, Droplets, Leaf, MapPinned, Sprout, TriangleAlert } from 'lucide-react';
import BlockMap from '@/components/map/BlockMap';
import { BlockRecord, calculateUncoveredRanchGeometry, fetchBlocks } from '@/lib/blocks';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { calculateRanchCoverage, fetchRanches, RanchRecord } from '@/lib/ranches';
import { TaskSummary, fetchTaskSummary } from '@/lib/tasks';

const ALL_RANCHES_VALUE = 'all';

const emptyTaskSummary: TaskSummary = {
  open: 0,
  inProgress: 0,
  overdue: 0,
  dueToday: 0,
  completed: 0,
  total: 0,
};

type RanchPortfolioSummary = {
  ranch: RanchRecord;
  blocks: BlockRecord[];
  coverage: ReturnType<typeof calculateRanchCoverage>;
};

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-ranch-border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">{label}</p>
          <h2 className="text-3xl font-bold mt-2 text-gray-900">{value}</h2>
          <p className="text-sm text-gray-500 mt-1">{detail}</p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center">
          <Icon className="h-6 w-6 text-gray-700" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [allBlocks, setAllBlocks] = useState<BlockRecord[]>([]);
  const [selectedRanchId, setSelectedRanchId] = useState<string>(ALL_RANCHES_VALUE);
  const [taskSummary, setTaskSummary] = useState<TaskSummary>(emptyTaskSummary);
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadTaskSummaryForScope = async (ranchScopeId: string) => {
    const ranchId = ranchScopeId === ALL_RANCHES_VALUE ? undefined : ranchScopeId;
    const summary = await fetchTaskSummary(ranchId);
    setTaskSummary(summary);
  };

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      try {
        const [onboardingStatus, ranchRows, blockRows] = await Promise.all([
          fetchOnboardingStatus(),
          fetchRanches(),
          fetchBlocks(),
        ]);

        if (cancelled) {
          return;
        }

        const nextSelectedRanchId =
          ranchRows.length > 1
            ? ALL_RANCHES_VALUE
            : onboardingStatus.ranch?.id ?? ranchRows[0]?.id ?? ALL_RANCHES_VALUE;

        setStatus(onboardingStatus);
        setRanches(ranchRows);
        setAllBlocks(blockRows);
        setSelectedRanchId(nextSelectedRanchId);

        const summary = await fetchTaskSummary(
          nextSelectedRanchId === ALL_RANCHES_VALUE ? undefined : nextSelectedRanchId,
        );

        if (cancelled) {
          return;
        }

        setTaskSummary(summary);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load dashboard data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleScopeChange = async (nextRanchId: string) => {
    setSelectedRanchId(nextRanchId);
    setScopeLoading(true);
    setErrorMessage('');

    try {
      await loadTaskSummaryForScope(nextRanchId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh dashboard scope.');
    } finally {
      setScopeLoading(false);
    }
  };

  const ranchSummaries = useMemo<RanchPortfolioSummary[]>(
    () =>
      ranches.map((ranch) => {
        const ranchBlocks = allBlocks.filter((block) => block.ranchId === ranch.id);
        return {
          ranch,
          blocks: ranchBlocks,
          coverage: calculateRanchCoverage(ranchBlocks, ranch.boundary),
        };
      }),
    [allBlocks, ranches],
  );

  const selectedRanchSummary = useMemo(
    () => ranchSummaries.find((summary) => summary.ranch.id === selectedRanchId) ?? null,
    [ranchSummaries, selectedRanchId],
  );

  const blocks = useMemo(
    () => (selectedRanchSummary ? selectedRanchSummary.blocks : allBlocks),
    [allBlocks, selectedRanchSummary],
  );

  const totalAcres = useMemo(
    () => blocks.reduce((sum, block) => sum + Number(block.acreage ?? 0), 0),
    [blocks],
  );

  const plantedTrees = useMemo(
    () => blocks.reduce((sum, block) => sum + Number(block.treeCount ?? 0), 0),
    [blocks],
  );

  const cropSummary = useMemo(
    () =>
      blocks.reduce<Record<string, number>>((accumulator, block) => {
        accumulator[block.cropType] = (accumulator[block.cropType] ?? 0) + 1;
        return accumulator;
      }, {}),
    [blocks],
  );

  const ranchCoverage = useMemo(() => {
    if (selectedRanchSummary) {
      return selectedRanchSummary.coverage;
    }

    const summariesWithBoundaries = ranchSummaries.filter(
      (summary) => summary.coverage.boundaryAcres !== null,
    );
    const mappedAcres = summariesWithBoundaries.reduce(
      (sum, summary) => sum + summary.coverage.mappedAcres,
      0,
    );
    const boundaryAcres = summariesWithBoundaries.reduce(
      (sum, summary) => sum + (summary.coverage.boundaryAcres ?? 0),
      0,
    );

    return {
      mappedAcres,
      boundaryAcres: boundaryAcres > 0 ? boundaryAcres : null,
      coveragePct: boundaryAcres > 0 ? (mappedAcres / boundaryAcres) * 100 : null,
      remainingAcres: boundaryAcres > 0 ? Math.max(boundaryAcres - mappedAcres, 0) : null,
    };
  }, [ranchSummaries, selectedRanchSummary]);

  const ranchBoundary = selectedRanchSummary?.ranch.boundary ?? null;
  const uncoveredGeometry = useMemo(
    () => calculateUncoveredRanchGeometry(ranchBoundary, blocks),
    [blocks, ranchBoundary],
  );

  const selectedScopeLabel = selectedRanchSummary
    ? selectedRanchSummary.ranch.name
    : ranches.length > 1
      ? 'All ranches'
      : status?.ranch?.name ?? 'Workspace';

  const recentBlocks = blocks.slice(0, 4);

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex flex-col gap-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          {status?.organization?.name ?? 'RanchOS dashboard'}
        </h1>
        <p className="text-gray-500 mt-1">
          {selectedRanchSummary
            ? `${selectedRanchSummary.ranch.name}${selectedRanchSummary.ranch.county ? `, ${selectedRanchSummary.ranch.county} County` : ''} | ${status?.subscription?.status ?? 'trialing'} starter workspace`
            : ranches.length > 1
              ? `${ranches.length} ranch portfolio | ${status?.subscription?.status ?? 'trialing'} starter workspace`
              : 'Live workspace summary'}
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {ranches.length > 1 ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Ranch scope</h2>
              <p className="mt-1 text-sm text-gray-500">
                Switch the dashboard between the full portfolio and a single ranch.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleScopeChange(ALL_RANCHES_VALUE)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  selectedRanchId === ALL_RANCHES_VALUE
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ranches
              </button>
              {ranches.map((ranch) => (
                <button
                  type="button"
                  key={ranch.id}
                  onClick={() => void handleScopeChange(ranch.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
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
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
        <MetricCard
          label="Organization"
          value={status?.organization?.name ?? 'Setup pending'}
          detail={`${status?.subscription?.plan ?? 'starter'} | ${status?.subscription?.status ?? 'trialing'}`}
          icon={Building2}
        />
        <MetricCard
          label="Blocks"
          value={loading ? '...' : blocks.length}
          detail={loading ? 'Loading inventory' : `Active mapped blocks in ${selectedScopeLabel}`}
          icon={Leaf}
        />
        <MetricCard
          label="Mapped Acres"
          value={loading ? '...' : totalAcres.toFixed(2)}
          detail={`Across ${selectedScopeLabel.toLowerCase()} inventory`}
          icon={MapPinned}
        />
        <MetricCard
          label="Tree Count"
          value={loading ? '...' : plantedTrees.toLocaleString()}
          detail="Total tracked trees"
          icon={Sprout}
        />
        <MetricCard
          label="Coverage"
          value={
            loading
              ? '...'
              : ranchCoverage.boundaryAcres
                ? `${(ranchCoverage.coveragePct ?? 0).toFixed(1)}%`
                : 'Set boundary'
          }
          detail={
            ranchCoverage.boundaryAcres
              ? `${ranchCoverage.mappedAcres.toFixed(2)} of ${ranchCoverage.boundaryAcres.toFixed(2)} mapped acres`
              : 'Add a ranch boundary to measure block coverage'
          }
          icon={MapPinned}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <MetricCard
          label="Open Tasks"
          value={loading || scopeLoading ? '...' : taskSummary.open}
          detail={`Ready to start in ${selectedScopeLabel}`}
          icon={ClipboardList}
        />
        <MetricCard
          label="In Progress"
          value={loading || scopeLoading ? '...' : taskSummary.inProgress}
          detail="Work happening now"
          icon={ClipboardList}
        />
        <MetricCard
          label="Overdue"
          value={loading || scopeLoading ? '...' : taskSummary.overdue}
          detail="Needs attention"
          icon={TriangleAlert}
        />
        <MetricCard
          label="Due Today"
          value={loading || scopeLoading ? '...' : taskSummary.dueToday}
          detail="Non-complete tasks due today"
          icon={Droplets}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-ranch-border overflow-hidden min-h-[450px] flex flex-col">
          <div className="px-6 py-4 border-b border-ranch-border bg-gray-50 flex flex-col sm:flex-row items-start sm:items-center justify-between">
            <h3 className="font-semibold text-gray-900">Live Block Overview</h3>
            <div className="mt-2 sm:mt-0 flex flex-wrap gap-2">
              {Object.entries(cropSummary).length > 0 ? (
                Object.entries(cropSummary).map(([cropType, count]) => (
                  <span key={cropType} className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full font-medium">
                    {count} {cropType.replace(/_/g, ' ')}
                  </span>
                ))
              ) : (
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                  No blocks yet
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 w-full bg-gray-100 relative">
            <BlockMap
              blocks={blocks}
              viewport={selectedRanchSummary?.ranch.mapViewport ?? null}
              ranchBoundary={ranchBoundary}
              uncoveredGeometry={uncoveredGeometry}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-ranch-border min-h-[450px] flex flex-col">
          <div className="px-6 py-4 border-b border-ranch-border bg-gray-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Droplets className="h-4 w-4 text-sky-700" />
              Live Workspace Snapshot
            </h3>
          </div>
          <div className="p-6 flex flex-col gap-6 overflow-y-auto">
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold">Current scope</p>
              <p className="mt-2 text-lg font-bold text-gray-900">{selectedScopeLabel}</p>
              <p className="mt-1 text-sm text-gray-600">
                {selectedRanchSummary
                  ? selectedRanchSummary.ranch.county
                    ? `${selectedRanchSummary.ranch.county} County`
                    : 'County not set yet'
                  : `${ranches.length || 1} ranches in the workspace`}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900">Recent blocks</h4>
                <Link href="/blocks" className="text-sm font-medium text-green-700 hover:text-green-800">
                  View all
                </Link>
              </div>
              {loading ? (
                <p className="text-sm text-gray-600">Loading current inventory...</p>
              ) : recentBlocks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-ranch-border p-4 text-sm text-gray-600">
                  <p>No blocks have been created yet.</p>
                  <Link href="/blocks/new" className="mt-3 inline-flex rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700">
                    Create first block
                  </Link>
                </div>
              ) : (
                recentBlocks.map((block) => {
                  const ranchName =
                    ranches.find((ranch) => ranch.id === block.ranchId)?.name ?? 'Unknown ranch';

                  return (
                    <Link key={block.id} href={`/blocks/${block.id}`} className="block rounded-xl border border-ranch-border p-4 transition-colors hover:border-green-300 hover:bg-green-50/40">
                      <p className="font-semibold text-gray-900">{block.name}</p>
                      <p className="mt-1 text-sm text-gray-600">
                        {block.cropType.replace(/_/g, ' ')} | {block.variety}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {block.acreage ? `${block.acreage} acres` : 'Acreage pending'}
                        {block.irrigationType ? ` | ${block.irrigationType.replace(/_/g, ' ')}` : ''}
                        {selectedRanchSummary ? '' : ` | ${ranchName}`}
                      </p>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
