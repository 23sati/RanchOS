'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarRange, Droplets, FileDown, Landmark, Waves } from 'lucide-react';
import { formatBlockCropLabel } from '@/lib/blocks';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { fetchRanches, RanchRecord } from '@/lib/ranches';
import {
  fetchSgmaReport,
  formatAcreFeet,
  formatAcreage,
  formatDepthInches,
  formatGeneratedAt,
  formatSgmaDate,
  getCurrentWaterYearRange,
  getRecentDateRange,
  getSgmaReportExportHref,
  SgmaReportPayload,
} from '@/lib/sgma';

const ALL_RANCHES_VALUE = 'all';

const emptyReport: SgmaReportPayload = {
  generatedAt: '',
  scope: 'workspace',
  scopeLabel: '',
  dateRange: {
    startDate: '',
    endDate: '',
  },
  summary: {
    ranchesInScope: 0,
    activeBlocks: 0,
    activeAcres: 0,
    configuredBlocks: 0,
    linkedStations: 0,
    completedEvents: 0,
    missingAppliedDataEvents: 0,
    blocksMissingStation: 0,
    blocksMissingAcreage: 0,
    totalAppliedAcreFeet: null,
    totalEstimatedCropEtAcreFeet: null,
    netAppliedMinusEstimatedEtAcreFeet: null,
  },
  assumptions: [],
  ranches: [],
  blocks: [],
};

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <h2 className="mt-2 text-3xl font-bold text-gray-900">{value}</h2>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

export default function SgmaPage() {
  const defaultRange = useMemo(() => getCurrentWaterYearRange(), []);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [selectedScopeValue, setSelectedScopeValue] = useState<string>(ALL_RANCHES_VALUE);
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [report, setReport] = useState<SgmaReportPayload>(emptyReport);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadWorkspace = async () => {
      try {
        const [onboardingStatus, ranchRows] = await Promise.all([
          fetchOnboardingStatus(),
          fetchRanches(),
        ]);
        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);
        setRanches(ranchRows);
        setSelectedScopeValue(
          ranchRows.length > 1
            ? ALL_RANCHES_VALUE
            : onboardingStatus.ranch?.id ?? ranchRows[0]?.id ?? ALL_RANCHES_VALUE,
        );
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load SGMA workspace.');
        }
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    };

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (bootstrapping) {
      return;
    }

    if (!ranches.length) {
      setReport(emptyReport);
      return;
    }

    if (selectedScopeValue !== ALL_RANCHES_VALUE && !ranches.some((ranch) => ranch.id === selectedScopeValue)) {
      return;
    }

    let cancelled = false;

    const loadReport = async () => {
      setLoadingReport(true);

      try {
        const payload = await fetchSgmaReport({
          scope: selectedScopeValue === ALL_RANCHES_VALUE ? 'workspace' : 'ranch',
          ranchId: selectedScopeValue === ALL_RANCHES_VALUE ? null : selectedScopeValue,
          startDate,
          endDate,
        });
        if (!cancelled) {
          setReport(payload);
          setErrorMessage('');
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load SGMA report.');
        }
      } finally {
        if (!cancelled) {
          setLoadingReport(false);
        }
      }
    };

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [bootstrapping, endDate, ranches, selectedScopeValue, startDate]);

  const selectedRanch = ranches.find((ranch) => ranch.id === selectedScopeValue) ?? null;
  const exportHref = useMemo(
    () => getSgmaReportExportHref({
      scope: selectedScopeValue === ALL_RANCHES_VALUE ? 'workspace' : 'ranch',
      ranchId: selectedScopeValue === ALL_RANCHES_VALUE ? null : selectedScopeValue,
      startDate,
      endDate,
    }),
    [endDate, selectedScopeValue, startDate],
  );

  if (bootstrapping) {
    return <div className="p-6 text-sm text-gray-600">Loading SGMA reporting workspace...</div>;
  }

  if (!status?.ranch && ranches.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">No ranch available yet</h1>
          <p className="mt-2 text-sm text-gray-600">
            Finish onboarding and add at least one ranch before generating SGMA reporting summaries.
          </p>
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
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">SGMA</p>
          <h1 className="text-3xl font-bold text-gray-900">
            {selectedScopeValue === ALL_RANCHES_VALUE
              ? `${status?.organization?.name ?? 'RanchOS'} groundwater reporting starter`
              : `${selectedRanch?.name ?? status?.ranch?.name ?? 'Ranch'} groundwater reporting starter`}
          </h1>
          <p className="max-w-3xl text-sm text-gray-600">
            First SGMA-ready summary and CSV export grounded in persisted irrigation events, active blocks, ranch metadata, and CIMIS ET.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{loadingReport ? 'Refreshing' : 'Persisted data'}</div>
            <div>Updated {formatGeneratedAt(report.generatedAt)}</div>
          </div>
          <a
            href={exportHref}
            className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
          >
            <FileDown className="h-4 w-4" />
            Export CSV
          </a>
        </div>
      </div>

      {ranches.length > 1 ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Reporting scope</h2>
              <p className="mt-1 text-sm text-gray-500">
                Switch between the full workspace and one ranch at a time.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedScopeValue(ALL_RANCHES_VALUE)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  selectedScopeValue === ALL_RANCHES_VALUE
                    ? 'bg-green-600 text-white'
                    : 'border border-ranch-border bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Workspace
              </button>
              {ranches.map((ranch) => (
                <button
                  key={ranch.id}
                  type="button"
                  onClick={() => setSelectedScopeValue(ranch.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    selectedScopeValue === ranch.id
                      ? 'bg-green-600 text-white'
                      : 'border border-ranch-border bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {ranch.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-sky-700" />
            <h2 className="font-semibold text-gray-900">Date range</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Defaulted to the current water year so the first SGMA slice is useful immediately.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Start date</span>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">End date</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const range = getCurrentWaterYearRange();
                setStartDate(range.startDate);
                setEndDate(range.endDate);
              }}
              className="rounded-full border border-ranch-border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Water year to date
            </button>
            <button
              type="button"
              onClick={() => {
                const range = getRecentDateRange(30);
                setStartDate(range.startDate);
                setEndDate(range.endDate);
              }}
              className="rounded-full border border-ranch-border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Last 30 days
            </button>
            <button
              type="button"
              onClick={() => {
                const range = getRecentDateRange(90);
                setStartDate(range.startDate);
                setEndDate(range.endDate);
              }}
              className="rounded-full border border-ranch-border bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Last 90 days
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-amber-700" />
            <h2 className="font-semibold text-gray-900">Reporting assumptions</h2>
          </div>
          <div className="mt-4 space-y-3">
            {report.assumptions.length === 0 ? (
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-600">
                SGMA assumptions will appear here after the report loads.
              </div>
            ) : (
              report.assumptions.map((assumption) => (
                <div key={assumption} className="rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
                  {assumption}
                </div>
              ))
            )}
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
          value={report.summary.activeBlocks}
          detail={`${formatAcreage(report.summary.activeAcres)} across the current scope`}
        />
        <MetricCard
          label="Applied Volume"
          value={formatAcreFeet(report.summary.totalAppliedAcreFeet)}
          detail={`${report.summary.completedEvents} completed irrigation event${report.summary.completedEvents === 1 ? '' : 's'}`}
        />
        <MetricCard
          label="Estimated Crop ET"
          value={formatAcreFeet(report.summary.totalEstimatedCropEtAcreFeet)}
          detail={`${report.summary.linkedStations} linked CIMIS station${report.summary.linkedStations === 1 ? '' : 's'}`}
        />
        <MetricCard
          label="Data Gaps"
          value={report.summary.blocksMissingStation + report.summary.missingAppliedDataEvents}
          detail={`${report.summary.blocksMissingStation} blocks missing stations / ${report.summary.missingAppliedDataEvents} completed events missing applied water`}
        />
      </div>

      {report.summary.netAppliedMinusEstimatedEtAcreFeet !== null ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Net Applied Minus ET</p>
              <h2 className="mt-1 text-3xl font-bold text-gray-900">
                {formatAcreFeet(report.summary.netAppliedMinusEstimatedEtAcreFeet)}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Positive values mean applied irrigation volume is ahead of estimated crop ET for this report window. Negative values mean estimated ET is higher than logged applied volume.
              </p>
            </div>
            <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-3 text-sm text-gray-700">
              Report window: {formatSgmaDate(report.dateRange.startDate)} to {formatSgmaDate(report.dateRange.endDate)}
            </div>
          </div>
        </div>
      ) : null}

      {report.blocks.length === 0 ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">No active blocks in scope yet</h2>
          <p className="mt-2 text-sm text-gray-600">
            SGMA reporting starts from live ranch blocks and their persisted irrigation records.
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
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_0.95fr]">
            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">Ranch rollup</h2>
              <p className="mt-1 text-sm text-gray-500">
                Same reporting window, rolled up by ranch for a quick regulatory review pass.
              </p>
              <div className="mt-5 space-y-4">
                {report.ranches.map((ranch) => (
                  <div key={ranch.ranchId} className="rounded-2xl border border-ranch-border bg-gray-50 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{ranch.name}</h3>
                          {ranch.county ? (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600">
                              {ranch.county} County
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {ranch.activeBlocks} active block{ranch.activeBlocks === 1 ? '' : 's'} / {formatAcreage(ranch.activeAcres)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{formatAcreFeet(ranch.netAppliedMinusEstimatedEtAcreFeet)}</div>
                        <div>Net applied minus ET</div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Applied</div>
                        <div className="mt-1 font-semibold text-gray-900">{formatAcreFeet(ranch.totalAppliedAcreFeet)}</div>
                      </div>
                      <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Estimated ET</div>
                        <div className="mt-1 font-semibold text-gray-900">{formatAcreFeet(ranch.totalEstimatedCropEtAcreFeet)}</div>
                      </div>
                      <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Completed events</div>
                        <div className="mt-1 font-semibold text-gray-900">{ranch.completedEvents}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
                      <span className="rounded-full bg-white px-3 py-1">Latest irrigation {formatSgmaDate(ranch.latestIrrigationDate)}</span>
                      <span className="rounded-full bg-white px-3 py-1">Latest ET {formatSgmaDate(ranch.latestEtDate)}</span>
                      <span className="rounded-full bg-white px-3 py-1">{ranch.missingAppliedDataEvents} completed event{ranch.missingAppliedDataEvents === 1 ? '' : 's'} missing applied water</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">Coverage notes</h2>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-ranch-border bg-gray-50 p-5">
                  <div className="flex items-start gap-3">
                    <Droplets className="mt-1 h-5 w-5 shrink-0 text-sky-700" />
                    <div>
                      <p className="font-semibold text-gray-900">Applied-water coverage</p>
                      <p className="mt-1 text-sm text-gray-600">
                        {report.summary.missingAppliedDataEvents === 0
                          ? 'Every completed irrigation event in this report window has a saved water-applied value.'
                          : `${report.summary.missingAppliedDataEvents} completed irrigation event${report.summary.missingAppliedDataEvents === 1 ? '' : 's'} still need water-applied acre-inch values to fully represent applied volume.`}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-ranch-border bg-gray-50 p-5">
                  <div className="flex items-start gap-3">
                    <Waves className="mt-1 h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <p className="font-semibold text-gray-900">ET coverage</p>
                      <p className="mt-1 text-sm text-gray-600">
                        {report.summary.blocksMissingStation === 0
                          ? 'Every active block in scope has a linked CIMIS station for ET estimation.'
                          : `${report.summary.blocksMissingStation} active block${report.summary.blocksMissingStation === 1 ? '' : 's'} are still missing a linked CIMIS station, so their ET contribution is not estimated here.`}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-ranch-border bg-gray-50 p-5">
                  <div className="flex items-start gap-3">
                    <Landmark className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
                    <div>
                      <p className="font-semibold text-gray-900">Regulatory context</p>
                      <p className="mt-1 text-sm text-gray-600">
                        Water district and GSA columns are included where they already exist on blocks so this export can support downstream groundwater review without inventing permit logic in this slice.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Block detail</h2>
            <p className="mt-1 text-sm text-gray-500">
              Export-aligned detail built from persisted irrigation, ET, and ranch/block metadata.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {report.blocks.map((block) => (
                <div key={block.blockId} className="rounded-2xl border border-ranch-border bg-gray-50 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{block.blockName}</h3>
                        {block.isOrganic ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                            Organic
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {block.ranchName}
                        {block.ranchCounty ? ` / ${block.ranchCounty} County` : ''}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        {formatBlockCropLabel(block.cropType)} / {block.variety} / {formatAcreage(block.acreage)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-4 py-3 text-right text-sm text-gray-700">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Net</div>
                      <div className="mt-1 font-semibold text-gray-900">{formatAcreFeet(block.netAppliedMinusEstimatedEtAcreFeet)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
                    <span className="rounded-full bg-white px-3 py-1">
                      {block.cimisStation ? `CIMIS ${block.cimisStation.name}` : 'No CIMIS station linked'}
                    </span>
                    {block.waterDistrict ? (
                      <span className="rounded-full bg-white px-3 py-1">{block.waterDistrict}</span>
                    ) : null}
                    {block.gsaName ? (
                      <span className="rounded-full bg-white px-3 py-1">{block.gsaName}</span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Applied irrigation</div>
                      <div className="mt-1 font-semibold text-gray-900">{formatAcreFeet(block.totalAppliedAcreFeet)}</div>
                      <div className="text-gray-500">{formatDepthInches(block.totalAppliedDepthInches)} depth</div>
                    </div>
                    <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Estimated crop ET</div>
                      <div className="mt-1 font-semibold text-gray-900">{formatAcreFeet(block.estimatedCropEtAcreFeet)}</div>
                      <div className="text-gray-500">{formatDepthInches(block.estimatedCropEtDepthInches)} depth</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
                    <span className="rounded-full bg-white px-3 py-1">
                      {block.completedEvents} completed event{block.completedEvents === 1 ? '' : 's'}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1">
                      {block.missingAppliedDataEvents} missing applied-water value{block.missingAppliedDataEvents === 1 ? '' : 's'}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1">Latest irrigation {formatSgmaDate(block.latestIrrigationDate)}</span>
                    <span className="rounded-full bg-white px-3 py-1">Latest ET {formatSgmaDate(block.latestEtDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
