'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { List, Map as MapIcon, MapPinned, Pencil, Plus, Trash2 } from 'lucide-react';
import BlockMap from '@/components/map/BlockMap';
import { BlockRecord, calculateUncoveredRanchGeometry, deleteBlock, fetchBlocks } from '@/lib/blocks';
import { fetchOnboardingStatus, getRanchCenter, getRanchViewport, OnboardingStatus } from '@/lib/onboarding';
import { calculateRanchCoverage, fetchRanches, RanchRecord } from '@/lib/ranches';

const ALL_RANCHES_VALUE = 'all';

export default function BlocksPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [allBlocks, setAllBlocks] = useState<BlockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedRanchId, setSelectedRanchId] = useState<string>(ALL_RANCHES_VALUE);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
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
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load blocks.');
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

  const blocks = useMemo(
    () => (selectedRanch ? allBlocks.filter((block) => block.ranchId === selectedRanch.id) : allBlocks),
    [allBlocks, selectedRanch],
  );

  const totalAcres = useMemo(
    () => blocks.reduce((sum, block) => sum + Number(block.acreage ?? 0), 0),
    [blocks],
  );

  const organicCount = useMemo(
    () => blocks.filter((block) => block.isOrganic).length,
    [blocks],
  );

  const cropBreakdown = useMemo(() => {
    return blocks.reduce<Record<string, number>>((accumulator, block) => {
      accumulator[block.cropType] = (accumulator[block.cropType] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [blocks]);

  const ranchCoverage = useMemo(() => {
    if (selectedRanch) {
      return calculateRanchCoverage(blocks, selectedRanch.boundary);
    }

    const summariesWithBoundaries = ranches
      .map((ranch) =>
        calculateRanchCoverage(
          allBlocks.filter((block) => block.ranchId === ranch.id),
          ranch.boundary,
        ))
      .filter((summary) => summary.boundaryAcres !== null);
    const mappedAcres = summariesWithBoundaries.reduce((sum, summary) => sum + summary.mappedAcres, 0);
    const boundaryAcres = summariesWithBoundaries.reduce(
      (sum, summary) => sum + (summary.boundaryAcres ?? 0),
      0,
    );

    return {
      mappedAcres,
      boundaryAcres: boundaryAcres > 0 ? boundaryAcres : null,
      coveragePct: boundaryAcres > 0 ? (mappedAcres / boundaryAcres) * 100 : null,
      remainingAcres: boundaryAcres > 0 ? Math.max(boundaryAcres - mappedAcres, 0) : null,
    };
  }, [allBlocks, blocks, ranches, selectedRanch]);

  const ranchBoundary = selectedRanch?.boundary ?? null;
  const uncoveredGeometry = useMemo(
    () => (selectedRanch ? calculateUncoveredRanchGeometry(ranchBoundary, blocks) : null),
    [blocks, ranchBoundary, selectedRanch],
  );

  const selectedScopeLabel = selectedRanch
    ? selectedRanch.name
    : ranches.length > 1
      ? 'All ranches'
      : status?.ranch?.name ?? 'Workspace';

  const ranchesById = useMemo(
    () => new Map(ranches.map((ranch) => [ranch.id, ranch])),
    [ranches],
  );

  const handleDelete = async (blockId: string) => {
    setDeletingId(blockId);
    setErrorMessage('');

    try {
      await deleteBlock(blockId);
      setAllBlocks((current) => current.filter((block) => block.id !== blockId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete block.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Blocks</p>
          <h1 className="text-3xl font-bold text-gray-900">
            {status?.organization?.name ? `${status.organization.name} blocks` : 'Orchard blocks'}
          </h1>
          <p className="text-sm text-gray-600">
            {selectedRanch
              ? `Managing ${blocks.length} active blocks in ${selectedRanch.name}${selectedRanch.county ? `, ${selectedRanch.county} County` : ''}.`
              : ranches.length > 1
                ? `Managing ${blocks.length} active blocks across the full ranch portfolio.`
                : status?.ranch
                  ? `Managing ${blocks.length} active blocks in ${status.ranch.name}${status.ranch.county ? `, ${status.ranch.county} County` : ''}.`
                  : 'Finish onboarding ranch setup before creating blocks.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {ranches.length > 1 ? (
            <label className="min-w-[220px] rounded-xl border bg-white px-4 py-3 text-sm text-gray-700">
              <span className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                <MapPinned className="h-3.5 w-3.5" />
                Ranch scope
              </span>
              <select
                value={selectedRanchId}
                onChange={(event) => setSelectedRanchId(event.target.value)}
                className="w-full bg-transparent font-semibold text-gray-900 outline-none"
              >
                <option value={ALL_RANCHES_VALUE}>All ranches</option>
                {ranches.map((ranch) => (
                  <option key={ranch.id} value={ranch.id}>
                    {ranch.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{blocks.length}</div>
            <div>Active blocks</div>
          </div>
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{selectedScopeLabel}</div>
            <div>Current scope</div>
          </div>
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{totalAcres.toFixed(2)}</div>
            <div>Mapped acres</div>
          </div>
          <Link href="/blocks/new" className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700">
            <Plus className="h-4 w-4" />
            New Block
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-ranch-border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
            <div className="flex items-center gap-2">
              <MapIcon className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Block map</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(cropBreakdown).map(([cropType, count]) => (
                <span key={cropType} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                  {cropType.replace(/_/g, ' ')}: {count}
                </span>
              ))}
            </div>
          </div>
          <div className="h-[520px] bg-gray-100">
            <BlockMap
              blocks={blocks}
              center={selectedRanch ? getRanchCenter(selectedRanch) : null}
              viewport={selectedRanch ? getRanchViewport(selectedRanch) : null}
              ranchBoundary={ranchBoundary}
              uncoveredGeometry={uncoveredGeometry}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Organic</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{organicCount}</p>
              <p className="mt-1 text-sm text-gray-600">Blocks flagged organic</p>
            </div>
            <div className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Scope</p>
              <p className="mt-2 text-lg font-bold text-gray-900">{selectedScopeLabel}</p>
              <p className="mt-1 text-sm text-gray-600">
                {selectedRanch
                  ? selectedRanch.county ? `${selectedRanch.county} County` : 'County not set'
                  : ranches.length > 1 ? `${ranches.length} ranch portfolio` : 'Single-ranch workspace'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Coverage</p>
            {ranchCoverage.boundaryAcres ? (
              <>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {ranchCoverage.coveragePct ? `${ranchCoverage.coveragePct.toFixed(1)}%` : '0.0%'}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {ranchCoverage.mappedAcres.toFixed(2)} mapped acres of {ranchCoverage.boundaryAcres.toFixed(2)} ranch acres
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {ranchCoverage.remainingAcres?.toFixed(2)} acres still outside mapped block coverage
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-lg font-bold text-gray-900">Boundary needed</p>
                <p className="mt-1 text-sm text-gray-600">
                  Save ranch boundaries in Settings to track mapped block coverage against the full property.
                </p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b bg-gray-50 px-6 py-4">
              <List className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Live block inventory</h2>
            </div>
            <div className="divide-y">
              {loading ? (
                <div className="px-6 py-8 text-sm text-gray-600">Loading blocks...</div>
              ) : blocks.length === 0 ? (
                <div className="space-y-3 px-6 py-8 text-sm text-gray-600">
                  <p>
                    {selectedRanch
                      ? `No blocks yet for ${selectedRanch.name}.`
                      : 'No blocks yet across this workspace.'}
                  </p>
                  <Link href="/blocks/new" className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700">
                    <Plus className="h-4 w-4" />
                    Create first block
                  </Link>
                </div>
              ) : (
                blocks.map((block) => (
                  <div key={block.id} className="flex items-start justify-between gap-4 px-6 py-4">
                    <div className="space-y-1">
                      <Link href={`/blocks/${block.id}`} className="text-base font-semibold text-gray-900 hover:text-green-700">
                        {block.name}
                      </Link>
                      <p className="text-sm text-gray-600">
                        {block.cropType.replace(/_/g, ' ')} | {block.variety}
                        {block.acreage ? ` | ${block.acreage} acres` : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        {ranches.length > 1 ? `${ranchesById.get(block.ranchId)?.name ?? 'Unknown ranch'} | ` : ''}
                        {block.treeCount ? `${block.treeCount} trees` : 'Tree count pending'}
                        {block.irrigationType ? ` | ${block.irrigationType.replace(/_/g, ' ')}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/blocks/${block.id}`} className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <span className="inline-flex items-center gap-2">
                          <Pencil className="h-4 w-4" />
                          Edit
                        </span>
                      </Link>
                      <button
                        onClick={() => void handleDelete(block.id)}
                        disabled={deletingId === block.id}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          {deletingId === block.id ? 'Deleting...' : 'Delete'}
                        </span>
                      </button>
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
