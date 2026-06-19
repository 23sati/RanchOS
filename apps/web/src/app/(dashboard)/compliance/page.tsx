'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDownToLine, ClipboardPenLine, FilePlus2, Leaf, ShieldCheck, SprayCan, TestTube2 } from 'lucide-react';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { formatBlockCropLabel } from '@/lib/blocks';
import { fetchRanches, type RanchRecord } from '@/lib/ranches';
import {
  ApplicationFormValues,
  ApplicationRecord,
  ComplianceDashboardPayload,
  ProductFormValues,
  applicationRecordToFormValues,
  applicationRecordTypeOptions,
  createApplicationRecord,
  createProduct,
  defaultApplicationFormValues,
  defaultProductFormValues,
  fetchComplianceDashboard,
  formatAppliedDate,
  formatRecordTypeLabel,
  getComplianceDprExportHref,
  updateApplicationRecord,
} from '@/lib/compliance';

const emptyDashboard: ComplianceDashboardPayload = {
  blocks: [],
  products: [],
  scoutingLogs: [],
  applications: [],
  summary: { products: 0, applications: 0, activeRei: 0, activePhi: 0, organicApplications: 0 },
};

const ALL_RANCHES_VALUE = 'all';

function sortApplications(records: ApplicationRecord[]) {
  return [...records].sort((left, right) => {
    const dateDiff = right.appliedDate.localeCompare(left.appliedDate);
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

function getDefaultBlockId(dashboard: ComplianceDashboardPayload) {
  return dashboard.blocks[0]?.id ?? '';
}

function complianceTone(record: ApplicationRecord) {
  if (record.reiExpiry && new Date(record.reiExpiry) > new Date()) return 'bg-red-100 text-red-800';
  if (record.phiExpiry && record.phiExpiry >= new Date().toISOString().slice(0, 10)) return 'bg-amber-100 text-amber-800';
  if (record.isOrganicBlock) return 'bg-emerald-100 text-emerald-800';
  return 'bg-sky-100 text-sky-800';
}

function complianceLabel(record: ApplicationRecord) {
  if (record.reiExpiry && new Date(record.reiExpiry) > new Date()) return 'Active REI';
  if (record.phiExpiry && record.phiExpiry >= new Date().toISOString().slice(0, 10)) return 'Active PHI';
  if (record.isOrganicBlock) return 'Organic block';
  return 'Logged';
}

function isComplianceReiActive(record: ApplicationRecord) {
  return Boolean(record.reiExpiry && new Date(record.reiExpiry) > new Date());
}

function isCompliancePhiActive(record: ApplicationRecord) {
  return Boolean(record.phiExpiry && record.phiExpiry >= new Date().toISOString().slice(0, 10));
}

type ComplianceExportPortfolioRollup = {
  ranchId: string;
  ranchName: string;
  applicationCount: number;
  pesticideCount: number;
  dprReadyCount: number;
  blockerCount: number;
  activeReiCount: number;
  activePhiCount: number;
  organicCount: number;
  uniqueProducts: number;
  latestAppliedDate: string | null;
  blockerReasons: string[];
};

function buildPortfolioComplianceHandoffSummary(rollups: ComplianceExportPortfolioRollup[]) {
  return [
    'Compliance portfolio DPR handoff',
    ...(
      rollups.length === 0
        ? ['- No ranch application data available.']
        : rollups.map((rollup) => {
            const latestApplied = rollup.latestAppliedDate ? formatAppliedDate(rollup.latestAppliedDate) : 'No applications yet';
            const blockerDetail = rollup.blockerReasons.length > 0 ? ` | blockers: ${rollup.blockerReasons.join(', ')}` : '';

            return `- ${rollup.ranchName}: ${rollup.dprReadyCount}/${rollup.pesticideCount} DPR-ready pesticide records | ${rollup.applicationCount} total applications | REI ${rollup.activeReiCount} | PHI ${rollup.activePhiCount} | organic ${rollup.organicCount} | latest ${latestApplied}${blockerDetail}`;
          })
    ),
  ].join('\n');
}

export default function CompliancePage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [dashboard, setDashboard] = useState<ComplianceDashboardPayload>(emptyDashboard);
  const [selectedRanchId, setSelectedRanchId] = useState<string>(ALL_RANCHES_VALUE);
  const [productValues, setProductValues] = useState<ProductFormValues>(defaultProductFormValues());
  const [applicationValues, setApplicationValues] = useState<ApplicationFormValues>(defaultApplicationFormValues());
  const [editingApplicationId, setEditingApplicationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingApplication, setSavingApplication] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const applyDashboard = (payload: ComplianceDashboardPayload) => {
    setDashboard({ ...payload, applications: sortApplications(payload.applications) });
  };

  const refreshDashboard = async (ranchId?: string) => {
    const payload = await fetchComplianceDashboard(ranchId);
    applyDashboard(payload);
    return payload;
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const onboardingStatus = await fetchOnboardingStatus();
        if (cancelled) return;
        setStatus(onboardingStatus);

        if (!onboardingStatus.profile?.orgId) return;

        const ranchRows = await fetchRanches();
        if (cancelled) return;
        setRanches(ranchRows);
        if (ranchRows.length === 0) return;

        const initialScopeId =
          ranchRows.length > 1
            ? ALL_RANCHES_VALUE
            : onboardingStatus.ranch?.id ?? ranchRows[0]?.id ?? ALL_RANCHES_VALUE;

        setSelectedRanchId(initialScopeId);

        const payload = await fetchComplianceDashboard(initialScopeId === ALL_RANCHES_VALUE ? undefined : initialScopeId);
        if (cancelled) return;
        const nextDashboard = { ...payload, applications: sortApplications(payload.applications) };
        applyDashboard(nextDashboard);
        setApplicationValues(defaultApplicationFormValues(getDefaultBlockId(nextDashboard)));
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : 'Unable to load compliance data.');
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
    if (dashboard.blocks.length === 0) {
      if (applicationValues.blockId) {
        setApplicationValues((current) => ({ ...current, blockId: '' }));
      }
      return;
    }

    if (!applicationValues.blockId || !dashboard.blocks.some((block) => block.id === applicationValues.blockId)) {
      setApplicationValues((current) => ({ ...current, blockId: getDefaultBlockId(dashboard) }));
    }
  }, [dashboard.blocks, applicationValues.blockId]);

  const selectedRanch = useMemo(
    () => ranches.find((ranch) => ranch.id === selectedRanchId) ?? null,
    [ranches, selectedRanchId],
  );
  const ranchNameById = useMemo(() => new Map(ranches.map((ranch) => [ranch.id, ranch.name])), [ranches]);
  const selectedScopeLabel = selectedRanch
    ? selectedRanch.name
    : ranches.length > 1
      ? 'All ranches'
      : ranches[0]?.name ?? status?.ranch?.name ?? 'Current ranch';
  const ranchesInScope = selectedRanch ? 1 : ranches.length;
  const showPortfolioLabels = !selectedRanch && ranches.length > 1;
  const selectedBlock = useMemo(
    () => dashboard.blocks.find((block) => block.id === applicationValues.blockId) ?? dashboard.blocks[0] ?? null,
    [dashboard.blocks, applicationValues.blockId],
  );

  const availableProducts = useMemo(() => {
    if (!selectedBlock) return dashboard.products;
    return dashboard.products.filter((product) => !product.applicableCrops?.length || product.applicableCrops.includes(selectedBlock.cropType));
  }, [dashboard.products, selectedBlock]);

  const selectedProduct = useMemo(
    () => dashboard.products.find((product) => product.id === applicationValues.productId) ?? null,
    [dashboard.products, applicationValues.productId],
  );

  const availableScoutingLogs = useMemo(() => {
    if (!selectedBlock) return dashboard.scoutingLogs;
    return dashboard.scoutingLogs.filter((log) => log.blockId === selectedBlock.id).slice(0, 12);
  }, [dashboard.scoutingLogs, selectedBlock]);

  const organicBlockCount = useMemo(() => dashboard.blocks.filter((block) => block.isOrganic).length, [dashboard.blocks]);
  const portfolioExportRollups = useMemo<ComplianceExportPortfolioRollup[]>(() => {
    return ranches
      .map((ranch) => {
        const ranchApplications = dashboard.applications.filter((record) => record.block?.ranchId === ranch.id);
        const pesticideApplications = ranchApplications.filter((record) => record.recordType === 'pesticide');
        const dprReadyRecords = pesticideApplications.filter(
          (record) => Boolean(record.verifiedAt && record.applicatorLicense && record.epaRegNumber),
        );
        const blockerReasons = [
          pesticideApplications.some((record) => !record.verifiedAt) ? 'unverified records' : null,
          pesticideApplications.some((record) => !record.applicatorLicense) ? 'missing applicator license' : null,
          pesticideApplications.some((record) => !record.epaRegNumber) ? 'missing EPA registration' : null,
        ].filter((value): value is string => Boolean(value));

        return {
          ranchId: ranch.id,
          ranchName: ranch.name,
          applicationCount: ranchApplications.length,
          pesticideCount: pesticideApplications.length,
          dprReadyCount: dprReadyRecords.length,
          blockerCount: Math.max(pesticideApplications.length - dprReadyRecords.length, 0),
          activeReiCount: ranchApplications.filter(isComplianceReiActive).length,
          activePhiCount: ranchApplications.filter(isCompliancePhiActive).length,
          organicCount: ranchApplications.filter((record) => record.isOrganicBlock).length,
          uniqueProducts: new Set(ranchApplications.map((record) => record.productDisplayName)).size,
          latestAppliedDate: [...ranchApplications].sort((left, right) => right.appliedDate.localeCompare(left.appliedDate))[0]?.appliedDate ?? null,
          blockerReasons,
        };
      })
      .sort((left, right) => {
        if (right.blockerCount !== left.blockerCount) {
          return right.blockerCount - left.blockerCount;
        }

        if (right.applicationCount !== left.applicationCount) {
          return right.applicationCount - left.applicationCount;
        }

        return left.ranchName.localeCompare(right.ranchName);
      });
  }, [dashboard.applications, ranches]);

  const portfolioReadyRanches = useMemo(
    () => portfolioExportRollups.filter((rollup) => rollup.pesticideCount > 0 && rollup.blockerCount === 0).length,
    [portfolioExportRollups],
  );

  const handleCopyPortfolioHandoff = async () => {
    try {
      await navigator.clipboard.writeText(buildPortfolioComplianceHandoffSummary(portfolioExportRollups));
      setSuccessMessage('Compliance portfolio handoff summary copied.');
      setErrorMessage('');
    } catch {
      setErrorMessage('Unable to copy compliance portfolio handoff summary.');
    }
  };

  const handleScopeChange = async (nextRanchId: string) => {
    setSelectedRanchId(nextRanchId);
    setEditingApplicationId(null);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = await refreshDashboard(nextRanchId === ALL_RANCHES_VALUE ? undefined : nextRanchId);
      setApplicationValues(defaultApplicationFormValues(getDefaultBlockId(payload)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh compliance scope.');
    }
  };

  const handleCreateProduct = async () => {
    setSavingProduct(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const product = await createProduct(productValues);
      setDashboard((current) => ({
        ...current,
        products: [...current.products, product].sort((left, right) => left.productName.localeCompare(right.productName)),
        summary: { ...current.summary, products: current.summary.products + 1 },
      }));
      setProductValues(defaultProductFormValues());
      setSuccessMessage('Product created.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create product.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleCreateApplication = async () => {
    setSavingApplication(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      if (editingApplicationId) {
        await updateApplicationRecord(editingApplicationId, applicationValues);
        const nextDashboard = await refreshDashboard(selectedRanch?.id);
        setSuccessMessage('Application record updated.');
        setApplicationValues(defaultApplicationFormValues(applicationValues.blockId || getDefaultBlockId(nextDashboard)));
      } else {
        await createApplicationRecord(applicationValues);
        const nextDashboard = await refreshDashboard(selectedRanch?.id);
        setSuccessMessage('Application record created.');
        setApplicationValues(defaultApplicationFormValues(applicationValues.blockId || getDefaultBlockId(nextDashboard)));
      }
      setEditingApplicationId(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save application record.');
    } finally {
      setSavingApplication(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-gray-600">Loading compliance workspace...</div>;

  if (ranches.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">No ranch available yet</h1>
          <p className="mt-2 text-sm text-gray-600">Finish onboarding before managing compliance records.</p>
          <Link href="/onboarding" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">Return to onboarding</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8 animate-fade-in">
      <div className="flex flex-col gap-4 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Compliance &amp; Records</p>
          <h1 className="text-3xl font-bold text-gray-900">{selectedScopeLabel} compliance</h1>
          <p className="text-sm text-gray-600">Live product catalog, real application records, and the first DPR-ready spray export from current ranch data.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {selectedRanch ? (
            <a href={getComplianceDprExportHref(selectedRanch.id)} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700">
              <ArrowDownToLine className="h-4 w-4" />
              Export DPR CSV
            </a>
          ) : (
            <button
              type="button"
              onClick={() => void handleCopyPortfolioHandoff()}
              className="inline-flex items-center gap-2 rounded-xl border border-ranch-border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ClipboardPenLine className="h-4 w-4" />
              Copy portfolio handoff
            </button>
          )}
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700"><div className="font-semibold text-gray-900">{dashboard.products.length}</div><div>Products</div></div>
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700"><div className="font-semibold text-gray-900">{dashboard.applications.length}</div><div>Applications</div></div>
        </div>
      </div>

      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
      {successMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

      <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Ranch scope</p>
            <h2 className="mt-2 text-xl font-semibold text-gray-900">{selectedScopeLabel}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {ranchesInScope} ranch{ranchesInScope === 1 ? '' : 'es'} in view.
              {showPortfolioLabels ? ' Block and application lists include ranch labels in portfolio mode.' : ''}
            </p>
          </div>
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Products" value={dashboard.summary.products} detail="Catalog items available now" />
        <MetricCard label="Applications" value={dashboard.summary.applications} detail="Logged product applications" />
        <MetricCard label="Active REI" value={dashboard.summary.activeRei} detail="Records still under restricted entry" />
        <MetricCard label="Active PHI" value={dashboard.summary.activePhi} detail="Records still within harvest interval" />
        <MetricCard label="Organic Blocks" value={organicBlockCount} detail="Blocks needing organic product care" />
      </div>

      {!selectedRanch && ranches.length > 1 ? (
        <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
          <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Portfolio DPR workbench</h2>
                <p className="mt-1 text-sm text-gray-500">Direct ranch-by-ranch export readiness on top of the current persisted compliance dashboard.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                <span className="rounded-full border border-ranch-border bg-white px-3 py-1.5 font-semibold text-gray-700">
                  {portfolioReadyRanches}/{ranches.length} ranches export-ready
                </span>
                <span className="rounded-full border border-ranch-border bg-white px-3 py-1.5 font-semibold text-gray-700">
                  {portfolioExportRollups.reduce((sum, rollup) => sum + rollup.blockerCount, 0)} open blockers
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
                        {rollup.pesticideCount === 0 ? (
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">No pesticide records</span>
                        ) : rollup.blockerCount === 0 ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Export ready</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{rollup.blockerCount} blockers</span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                        <span>{rollup.applicationCount} applications</span>
                        <span>{rollup.pesticideCount} pesticide</span>
                        <span>{rollup.uniqueProducts} products</span>
                        {rollup.latestAppliedDate ? <span>Latest {formatAppliedDate(rollup.latestAppliedDate)}</span> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">REI {rollup.activeReiCount}</span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">PHI {rollup.activePhiCount}</span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">Organic {rollup.organicCount}</span>
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
                        onClick={() => void handleScopeChange(rollup.ranchId)}
                        className="rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Open ranch
                      </button>
                      <a
                        href={getComplianceDprExportHref(rollup.ranchId)}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
                          rollup.pesticideCount === 0
                            ? 'pointer-events-none border border-ranch-border bg-gray-100 text-gray-400'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                        Export DPR CSV
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
                  <p>Use this workbench to export ranch-by-ranch DPR files without losing the portfolio context above.</p>
                  <p>Readiness stays narrow and explicit: verified pesticide records with applicator license and EPA registration populated.</p>
                  <p>Open the ranch directly when a blocker badge appears, clean the records in place, then export from the same row here.</p>
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
                    <p>All ranches with pesticide records are currently export-ready.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Add product</h2>
                <p className="mt-1 text-sm text-gray-500">Keep a lightweight local catalog for the current workspace.</p>
              </div>
              <div className="grid gap-4 p-6 md:grid-cols-2">
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Product name</span><input type="text" value={productValues.productName} onChange={(event) => setProductValues((current) => ({ ...current, productName: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Manufacturer</span><input type="text" value={productValues.manufacturer} onChange={(event) => setProductValues((current) => ({ ...current, manufacturer: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">EPA reg number</span><input type="text" value={productValues.epaRegNumber} onChange={(event) => setProductValues((current) => ({ ...current, epaRegNumber: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Formulation</span><input type="text" value={productValues.formulation} onChange={(event) => setProductValues((current) => ({ ...current, formulation: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">REI hours</span><input type="number" min="0" step="1" value={productValues.reiHours} onChange={(event) => setProductValues((current) => ({ ...current, reiHours: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">PHI days</span><input type="number" min="0" step="1" value={productValues.phiDays} onChange={(event) => setProductValues((current) => ({ ...current, phiDays: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2 md:col-span-2"><span className="text-sm font-semibold text-gray-900">Target pests</span><input type="text" value={productValues.targetPests} onChange={(event) => setProductValues((current) => ({ ...current, targetPests: event.target.value }))} placeholder="Comma-separated, for example Aphids, Spider Mites" className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700"><input type="checkbox" checked={productValues.restrictedUse} onChange={(event) => setProductValues((current) => ({ ...current, restrictedUse: event.target.checked }))} />Restricted use</label>
                <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700"><input type="checkbox" checked={productValues.isOmriListed} onChange={(event) => setProductValues((current) => ({ ...current, isOmriListed: event.target.checked }))} />OMRI listed</label>
                <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700 md:col-span-2"><input type="checkbox" checked={productValues.isCdfaOrganic} onChange={(event) => setProductValues((current) => ({ ...current, isCdfaOrganic: event.target.checked }))} />CDFA organic approved</label>
              </div>
              <div className="flex justify-end border-t border-ranch-border px-6 py-4"><button type="button" onClick={() => void handleCreateProduct()} disabled={savingProduct} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"><FilePlus2 className="h-4 w-4" />{savingProduct ? 'Saving product...' : 'Create product'}</button></div>
            </div>

            {dashboard.blocks.length === 0 ? (
              <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900">Create your first block to log application records</h2>
                <p className="mt-2 text-sm text-gray-600">Products can be managed now, but application records are scoped to active ranch blocks, just like scouting and irrigation.</p>
                <Link href="/blocks/new" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">Create first block</Link>
              </div>
            ) : (
              <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
                <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                  <h2 className="font-semibold text-gray-900">{editingApplicationId ? 'Edit application record' : 'Log application record'}</h2>
                  <p className="mt-1 text-sm text-gray-500">Capture products, applicator, timing, rate, and the first verification workflow in one place.</p>
                </div>
                <div className="grid gap-4 p-6 md:grid-cols-2">
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Block</span><select value={applicationValues.blockId} onChange={(event) => setApplicationValues((current) => ({ ...current, blockId: event.target.value, targetPestScoutingLogId: '' }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">{dashboard.blocks.map((block) => <option key={block.id} value={block.id}>{showPortfolioLabels ? `${block.name} (${ranchNameById.get(block.ranchId) ?? 'Unknown ranch'})` : block.name}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Record type</span><select value={applicationValues.recordType} onChange={(event) => setApplicationValues((current) => ({ ...current, recordType: event.target.value as ApplicationFormValues['recordType'] }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">{applicationRecordTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Applicator name</span><input type="text" value={applicationValues.applicatorName} onChange={(event) => setApplicationValues((current) => ({ ...current, applicatorName: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Applicator license</span><input type="text" value={applicationValues.applicatorLicense} onChange={(event) => setApplicationValues((current) => ({ ...current, applicatorLicense: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Product</span><select value={applicationValues.productId} onChange={(event) => setApplicationValues((current) => ({ ...current, productId: event.target.value }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"><option value="">Manual product entry</option>{availableProducts.map((product) => <option key={product.id} value={product.id}>{product.productName}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Manual product name</span><input type="text" value={applicationValues.productNameManual} onChange={(event) => setApplicationValues((current) => ({ ...current, productNameManual: event.target.value }))} placeholder="Use when no catalog product is selected" className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Applied date</span><input type="date" value={applicationValues.appliedDate} onChange={(event) => setApplicationValues((current) => ({ ...current, appliedDate: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Acres treated</span><input type="number" min="0.01" step="0.01" value={applicationValues.acresTreated} onChange={(event) => setApplicationValues((current) => ({ ...current, acresTreated: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Rate per acre</span><input type="number" min="0" step="0.0001" value={applicationValues.ratePerAcre} onChange={(event) => setApplicationValues((current) => ({ ...current, ratePerAcre: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Rate unit</span><input type="text" value={applicationValues.rateUnit} onChange={(event) => setApplicationValues((current) => ({ ...current, rateUnit: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Total product used</span><input type="number" min="0" step="0.0001" value={applicationValues.totalProductUsed} onChange={(event) => setApplicationValues((current) => ({ ...current, totalProductUsed: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Total product unit</span><input type="text" value={applicationValues.totalProductUnit} onChange={(event) => setApplicationValues((current) => ({ ...current, totalProductUnit: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Water volume (GPA)</span><input type="number" min="0" step="0.01" value={applicationValues.waterVolumeGpa} onChange={(event) => setApplicationValues((current) => ({ ...current, waterVolumeGpa: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Start time</span><input type="time" value={applicationValues.appliedStartTime} onChange={(event) => setApplicationValues((current) => ({ ...current, appliedStartTime: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">End time</span><input type="time" value={applicationValues.appliedEndTime} onChange={(event) => setApplicationValues((current) => ({ ...current, appliedEndTime: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Target scouting log</span><select value={applicationValues.targetPestScoutingLogId} onChange={(event) => setApplicationValues((current) => ({ ...current, targetPestScoutingLogId: event.target.value, targetPest: availableScoutingLogs.find((log) => log.id === event.target.value)?.pestDisplayName ?? current.targetPest }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"><option value="">None linked</option>{availableScoutingLogs.map((log) => <option key={log.id} value={log.id}>{log.pestDisplayName} / {formatAppliedDate(log.scoutedAt.slice(0, 10))}</option>)}</select></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Target pest</span><input type="text" value={applicationValues.targetPest} onChange={(event) => setApplicationValues((current) => ({ ...current, targetPest: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="space-y-2"><span className="text-sm font-semibold text-gray-900">Equipment used</span><input type="text" value={applicationValues.equipmentUsed} onChange={(event) => setApplicationValues((current) => ({ ...current, equipmentUsed: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" /></label>
                <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
                  <input type="checkbox" checked={applicationValues.certifierNotified} onChange={(event) => setApplicationValues((current) => ({ ...current, certifierNotified: event.target.checked }))} />
                  Certifier notified
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
                  <input type="checkbox" checked={applicationValues.verified} onChange={(event) => setApplicationValues((current) => ({ ...current, verified: event.target.checked }))} />
                  Verified record
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700 md:col-span-2">
                  <input type="checkbox" checked={applicationValues.omriConfirmed} onChange={(event) => setApplicationValues((current) => ({ ...current, omriConfirmed: event.target.checked }))} />
                  OMRI or organic approval confirmed for this application
                </label>
                <label className="space-y-2 md:col-span-2"><span className="text-sm font-semibold text-gray-900">Notes</span><textarea rows={4} value={applicationValues.notes} onChange={(event) => setApplicationValues((current) => ({ ...current, notes: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="Weather, drift notes, crew notes, or organic handling notes." /></label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ranch-border px-6 py-4">
                <div className="text-sm text-gray-500">
                  Selected product: {selectedProduct ? selectedProduct.productName : 'manual entry'}
                </div>
                <div className="flex gap-3">
                  {editingApplicationId ? (
                    <button type="button" onClick={() => {
                      setEditingApplicationId(null);
                      setApplicationValues(defaultApplicationFormValues(getDefaultBlockId(dashboard)));
                      setErrorMessage('');
                      setSuccessMessage('');
                    }} className="rounded-lg border border-ranch-border px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                      Cancel
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void handleCreateApplication()} disabled={savingApplication} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
                    <SprayCan className="h-4 w-4" />
                    {savingApplication ? 'Saving record...' : editingApplicationId ? 'Update application record' : 'Create application record'}
                  </button>
                </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900">{selectedScopeLabel} compliance snapshot</h2>
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4"><div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700"><ShieldCheck className="h-5 w-5" /></div><p className="mt-3 text-xl font-bold text-gray-900">{dashboard.summary.activeRei}</p><p className="text-sm text-gray-600">Active REI records</p></div>
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4"><div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><AlertTriangle className="h-5 w-5" /></div><p className="mt-3 text-xl font-bold text-gray-900">{dashboard.summary.activePhi}</p><p className="text-sm text-gray-600">Active PHI records</p></div>
                </div>
                <div className="rounded-xl border border-ranch-border bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Organic handling</p><p className="mt-2 text-2xl font-bold text-gray-900">{dashboard.summary.organicApplications}</p><p className="mt-1 text-sm text-gray-600">Application records on organic blocks</p></div>
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900">Starter catalog</h2>
              <div className="mt-5 space-y-3">
                {dashboard.products.slice(0, 6).map((product) => (
                  <div key={product.id} className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-gray-900">{product.productName}</p>
                      <div className="flex flex-wrap gap-2">
                        {product.isOmriListed || product.isCdfaOrganic ? <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Organic fit</span> : null}
                        {product.restrictedUse ? <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">Restricted</span> : null}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{product.manufacturer ?? 'Unknown manufacturer'}{product.epaRegNumber ? ` / EPA ${product.epaRegNumber}` : ''}</p>
                    <p className="mt-1 text-sm text-gray-600">REI {product.reiHours ?? 'n/a'} h / PHI {product.phiDays ?? 'n/a'} d</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4"><h2 className="font-semibold text-gray-900">Recent application records</h2></div>
              <div className="divide-y">
                {dashboard.applications.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-gray-600">No application records yet. Create the first one from the form.</div>
                ) : (
                  dashboard.applications.slice(0, 12).map((record) => (
                    <div key={record.id} className="space-y-3 px-6 py-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{record.productDisplayName}</p>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${complianceTone(record)}`}>{complianceLabel(record)}</span>
                            {record.verifiedAt ? <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Verified</span> : <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">Unverified</span>}
                            {record.certifierNotified ? <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">Certifier notified</span> : null}
                          </div>
                          <p className="text-sm text-gray-600">{record.block?.name ?? 'Block'} / {formatBlockCropLabel(record.block?.cropType ?? '')}{record.block?.variety ? ` / ${record.block.variety}` : ''}</p>
                          {showPortfolioLabels && record.block ? (
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                              {ranchNameById.get(record.block.ranchId) ?? 'Unknown ranch'}
                            </p>
                          ) : null}
                          <p className="text-sm text-gray-600">{formatRecordTypeLabel(record.recordType)} / {formatAppliedDate(record.appliedDate)} / {record.applicatorName}</p>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600"><span>{record.acresTreated} acres</span>{record.ratePerAcre ? <span>Rate {record.ratePerAcre} {record.rateUnit ?? ''}</span> : null}{record.targetPest ? <span>Target {record.targetPest}</span> : null}</div>
                          {record.verifiedAt ? (
                            <p className="text-sm text-gray-600">
                              Verified {record.verifiedByProfile?.fullName ? `by ${record.verifiedByProfile.fullName}` : ''} on {new Date(record.verifiedAt).toLocaleString('en-US')}
                            </p>
                          ) : null}
                          {record.notes ? <p className="text-sm text-gray-700">{record.notes}</p> : null}
                        </div>
                        <button type="button" onClick={() => {
                          setEditingApplicationId(record.id);
                          setApplicationValues(applicationRecordToFormValues(record));
                          setErrorMessage('');
                          setSuccessMessage('');
                        }} className="rounded-lg border border-ranch-border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                          Edit
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {selectedBlock?.isOrganic ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><div className="flex items-start gap-3"><Leaf className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p>The selected block is organic. Favor OMRI/CDFA-approved products and keep notes precise for certifier review.</p></div></div>
            ) : (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800"><div className="flex items-start gap-3"><TestTube2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><p>This layer now covers product catalog, application logging, and a first DPR spray export. Deeper compliance workflows can build from these records next.</p></div></div>
            )}
          </div>
        </div>
    </div>
  );
}
