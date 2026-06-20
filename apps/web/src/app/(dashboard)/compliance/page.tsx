'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownToLine,
  ClipboardCheck,
  FilePlus2,
  Leaf,
  PackageSearch,
  Save,
  ShieldAlert,
  SprayCan,
} from 'lucide-react';
import { fetchOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding';
import { formatBlockCropLabel } from '@/lib/blocks';
import { fetchRanches, type RanchRecord } from '@/lib/ranches';
import {
  type ApplicationFormValues,
  type ApplicationRecord,
  applicationRecordToFormValues,
  applicationRecordTypeOptions,
  type ComplianceDashboardPayload,
  createApplicationRecord,
  createProduct,
  defaultApplicationFormValues,
  defaultProductFormValues,
  fetchComplianceDashboard,
  formatAppliedDate,
  formatCountdownDays,
  formatCountdownHours,
  formatDateTime,
  formatQuantity,
  formatRecordTypeLabel,
  getComplianceDprExportHref,
  getComplianceOrganicReportHref,
  getComplianceSprayReportHref,
  type ProductFormValues,
  productRecordToFormValues,
  updateApplicationRecord,
  updateProduct,
} from '@/lib/compliance';

const emptyDashboard: ComplianceDashboardPayload = {
  blocks: [],
  products: [],
  scoutingLogs: [],
  applications: [],
  pesticideInventoryItems: [],
  pesticideInventoryStocks: [],
  reiCalendar: [],
  annualSummary: {
    activeIngredients: [],
    counties: [],
  },
  organicSummary: {
    certifierName: 'Organic certifier',
    organicBlocks: [],
    applications: [],
  },
  automationQueue: [],
  summary: {
    products: 0,
    applications: 0,
    pesticideApplications: 0,
    dprReady: 0,
    blockedPesticides: 0,
    activeRei: 0,
    activePhi: 0,
    organicApplications: 0,
    syncedInventoryRecords: 0,
    restrictedUseApplications: 0,
  },
};

const ALL_RANCHES_VALUE = 'all';

function MetricCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClasses = {
    default: 'border-ranch-border bg-white',
    warning: 'border-amber-200 bg-amber-50',
    danger: 'border-red-200 bg-red-50',
    success: 'border-emerald-200 bg-emerald-50',
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <h2 className="mt-2 text-3xl font-bold text-gray-900">{value}</h2>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-ranch-border bg-gray-50 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'default' | 'warning' | 'danger' | 'success' | 'info';
}) {
  const toneClasses = {
    default: 'bg-gray-100 text-gray-700',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    success: 'bg-emerald-100 text-emerald-800',
    info: 'bg-sky-100 text-sky-800',
  };

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}>{label}</span>;
}

export default function CompliancePage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [dashboard, setDashboard] = useState<ComplianceDashboardPayload>(emptyDashboard);
  const [selectedRanchId, setSelectedRanchId] = useState<string>(ALL_RANCHES_VALUE);
  const [productValues, setProductValues] = useState<ProductFormValues>(defaultProductFormValues());
  const [applicationValues, setApplicationValues] = useState<ApplicationFormValues>(defaultApplicationFormValues());
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingApplicationId, setEditingApplicationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingApplication, setSavingApplication] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const selectedRanch = useMemo(
    () => ranches.find((ranch) => ranch.id === selectedRanchId) ?? null,
    [ranches, selectedRanchId],
  );

  const scopeBlocks = useMemo(
    () =>
      selectedRanch
        ? dashboard.blocks.filter((block) => block.ranchId === selectedRanch.id)
        : dashboard.blocks,
    [dashboard.blocks, selectedRanch],
  );

  const scopeBlockIds = useMemo(() => new Set(scopeBlocks.map((block) => block.id)), [scopeBlocks]);

  const scopedApplications = useMemo(
    () => dashboard.applications.filter((record) => scopeBlockIds.has(record.blockId)),
    [dashboard.applications, scopeBlockIds],
  );

  const scopedReiCalendar = useMemo(
    () => dashboard.reiCalendar.filter((entry) => scopeBlockIds.has(entry.blockId)),
    [dashboard.reiCalendar, scopeBlockIds],
  );

  const scopedAutomationQueue = useMemo(
    () =>
      dashboard.automationQueue.filter((entry) =>
        scopedApplications.some((record) => record.id === entry.applicationId),
      ),
    [dashboard.automationQueue, scopedApplications],
  );

  const scopedOrganicApplications = useMemo(
    () =>
      dashboard.organicSummary.applications.filter((entry) =>
        scopedApplications.some((record) => record.id === entry.applicationId),
      ),
    [dashboard.organicSummary.applications, scopedApplications],
  );

  const selectedBlock = useMemo(
    () => scopeBlocks.find((block) => block.id === applicationValues.blockId) ?? scopeBlocks[0] ?? null,
    [scopeBlocks, applicationValues.blockId],
  );

  const availableProducts = useMemo(() => {
    if (!selectedBlock) {
      return dashboard.products;
    }

    return dashboard.products.filter((product) =>
      !product.applicableCrops?.length || product.applicableCrops.includes(selectedBlock.cropType),
    );
  }, [dashboard.products, selectedBlock]);

  const selectedProduct = useMemo(
    () => dashboard.products.find((product) => product.id === applicationValues.productId) ?? null,
    [dashboard.products, applicationValues.productId],
  );

  const availableScoutingLogs = useMemo(() => {
    if (!selectedBlock) {
      return dashboard.scoutingLogs;
    }

    return dashboard.scoutingLogs.filter((log) => log.blockId === selectedBlock.id).slice(0, 12);
  }, [dashboard.scoutingLogs, selectedBlock]);

  const availableStockRows = useMemo(() => {
    if (!selectedProduct?.inventoryItemId) {
      return [];
    }

    return dashboard.pesticideInventoryStocks.filter((stock) => stock.itemId === selectedProduct.inventoryItemId);
  }, [dashboard.pesticideInventoryStocks, selectedProduct]);

  const selectedStockRow = useMemo(
    () => availableStockRows.find((stock) => stock.id === applicationValues.sourceInventoryStockId) ?? null,
    [availableStockRows, applicationValues.sourceInventoryStockId],
  );

  const selectedScopeLabel = selectedRanch
    ? selectedRanch.name
    : ranches.length > 1
      ? 'All ranches'
      : ranches[0]?.name ?? status?.organization?.name ?? 'Current workspace';

  const applyDashboard = (payload: ComplianceDashboardPayload) => {
    setDashboard(payload);
  };

  const refreshDashboard = async (ranchId?: string) => {
    const payload = await fetchComplianceDashboard(ranchId);
    applyDashboard(payload);
    return payload;
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
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

        const initialScope =
          ranchRows.length > 1
            ? ALL_RANCHES_VALUE
            : onboardingStatus.ranch?.id ?? ranchRows[0]?.id ?? ALL_RANCHES_VALUE;

        setSelectedRanchId(initialScope);
        const payload = await fetchComplianceDashboard(initialScope === ALL_RANCHES_VALUE ? undefined : initialScope);
        if (cancelled) {
          return;
        }

        applyDashboard(payload);
        const firstBlockId = payload.blocks[0]?.id ?? '';
        setApplicationValues(defaultApplicationFormValues(firstBlockId));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load compliance automation.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scopeBlocks.length === 0) {
      if (applicationValues.blockId) {
        setApplicationValues((current) => ({ ...current, blockId: '' }));
      }
      return;
    }

    if (!scopeBlocks.some((block) => block.id === applicationValues.blockId)) {
      setApplicationValues((current) => ({ ...current, blockId: scopeBlocks[0]?.id ?? '' }));
    }
  }, [scopeBlocks, applicationValues.blockId]);

  useEffect(() => {
    if (selectedProduct?.epaRegNumber && !editingApplicationId) {
      setApplicationValues((current) => ({
        ...current,
        epaRegNumber: current.productId ? '' : current.epaRegNumber,
      }));
    }
  }, [selectedProduct, editingApplicationId]);

  const handleScopeChange = async (nextRanchId: string) => {
    setSelectedRanchId(nextRanchId);
    setEditingApplicationId(null);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = await refreshDashboard(nextRanchId === ALL_RANCHES_VALUE ? undefined : nextRanchId);
      const firstBlockId = payload.blocks[0]?.id ?? '';
      setApplicationValues(defaultApplicationFormValues(firstBlockId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh compliance scope.');
    }
  };

  const handleSaveProduct = async () => {
    setSavingProduct(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (editingProductId) {
        await updateProduct(editingProductId, productValues);
        setSuccessMessage('Pesticide product updated.');
      } else {
        await createProduct(productValues);
        setSuccessMessage('Pesticide product created.');
      }

      await refreshDashboard(selectedRanch?.id);
      setEditingProductId(null);
      setProductValues(defaultProductFormValues());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save pesticide product.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleSaveApplication = async () => {
    setSavingApplication(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (editingApplicationId) {
        await updateApplicationRecord(editingApplicationId, applicationValues);
        setSuccessMessage('Pesticide application updated.');
      } else {
        await createApplicationRecord(applicationValues);
        setSuccessMessage('Pesticide application created.');
      }

      const refreshed = await refreshDashboard(selectedRanch?.id);
      setEditingApplicationId(null);
      setApplicationValues(defaultApplicationFormValues(refreshed.blocks[0]?.id ?? ''));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save pesticide application.');
    } finally {
      setSavingApplication(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading pesticide compliance automation...</div>;
  }

  if (!ranches.length) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">No ranch available yet</h1>
          <p className="mt-2 text-sm text-gray-600">
            Finish onboarding before managing pesticide compliance.
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
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Pesticide Compliance</p>
          <h1 className="text-3xl font-bold text-gray-900">{selectedScopeLabel} automation</h1>
          <p className="max-w-3xl text-sm text-gray-600">
            Automate pesticide record validation, REI/PHI calculations, inventory deduction, DPR-ready review, and organic documentation from one workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {selectedRanch ? (
            <>
              <a
                href={getComplianceDprExportHref(selectedRanch.id)}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-700 ring-1 ring-ranch-border hover:bg-gray-50"
              >
                <ArrowDownToLine className="h-4 w-4" />
                DPR CSV
              </a>
              <a
                href={getComplianceSprayReportHref(selectedRanch.id)}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
              >
                <ClipboardCheck className="h-4 w-4" />
                Spray PDF
              </a>
            </>
          ) : null}
          {dashboard.organicSummary.organicBlocks.length > 0 ? (
            <a
              href={getComplianceOrganicReportHref()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Leaf className="h-4 w-4" />
              Organic PDF
            </a>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}
      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div>
      ) : null}

      <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
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

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Pesticides" value={dashboard.summary.pesticideApplications} detail="Logged pesticide applications" />
        <MetricCard label="DPR Ready" value={dashboard.summary.dprReady} detail="Verified and blocker-free pesticide records" tone="success" />
        <MetricCard label="Blocked" value={dashboard.summary.blockedPesticides} detail="Records still missing compliance inputs" tone={dashboard.summary.blockedPesticides > 0 ? 'danger' : 'default'} />
        <MetricCard label="Active REI" value={dashboard.summary.activeRei} detail="Current worker entry restrictions" tone={dashboard.summary.activeRei > 0 ? 'warning' : 'default'} />
        <MetricCard label="Active PHI" value={dashboard.summary.activePhi} detail="Current harvest interval restrictions" tone={dashboard.summary.activePhi > 0 ? 'warning' : 'default'} />
        <MetricCard label="Inventory Sync" value={dashboard.summary.syncedInventoryRecords} detail="Applications auto-deducted from stock" tone="success" />
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Automation queue"
          description="Records with blockers or warnings that still need pesticide-compliance attention."
        >
          <div className="divide-y">
            {scopedAutomationQueue.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">No pesticide records are waiting on compliance cleanup in this scope.</div>
            ) : (
              scopedAutomationQueue.map((entry) => (
                <div key={entry.applicationId} className="space-y-3 px-6 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{entry.productName}</p>
                    {entry.verified ? <StatusBadge label="Verified" tone="success" /> : <StatusBadge label="Unverified" tone="default" />}
                    <StatusBadge
                      label={
                        entry.inventoryStatus === 'synced'
                          ? 'Inventory synced'
                          : entry.inventoryStatus === 'unmapped'
                            ? 'Unmapped inventory'
                            : entry.inventoryStatus === 'insufficient_stock'
                              ? 'Insufficient stock'
                              : entry.inventoryStatus === 'pending'
                                ? 'Inventory pending'
                                : entry.inventoryStatus === 'mismatch'
                                  ? 'Inventory mismatch'
                                  : 'Not applicable'
                      }
                      tone={entry.inventoryStatus === 'synced' ? 'success' : entry.inventoryStatus === 'not_applicable' ? 'default' : 'warning'}
                    />
                  </div>
                  <p className="text-sm text-gray-600">
                    {entry.blockName}
                    {entry.ranchName ? ` / ${entry.ranchName}` : ''} / {formatAppliedDate(entry.appliedDate)}
                  </p>
                  {entry.blockingIssues.length > 0 ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <p className="font-semibold">Blocking issues</p>
                      <ul className="mt-2 space-y-1">
                        {entry.blockingIssues.map((issue) => (
                          <li key={issue}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {entry.warnings.length > 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      <p className="font-semibold">Warnings</p>
                      <ul className="mt-2 space-y-1">
                        {entry.warnings.map((warning) => (
                          <li key={warning}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="REI calendar"
          description="Live list of active re-entry restrictions workers need to respect right now."
        >
          <div className="divide-y">
            {scopedReiCalendar.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">No active REI restrictions in this scope.</div>
            ) : (
              scopedReiCalendar.map((entry) => (
                <div key={entry.applicationId} className="flex items-start justify-between gap-4 px-6 py-4">
                  <div>
                    <p className="font-semibold text-gray-900">{entry.blockName}</p>
                    <p className="mt-1 text-sm text-gray-600">{entry.productName}</p>
                    {entry.ranchName ? <p className="mt-1 text-xs text-gray-500">{entry.ranchName}</p> : null}
                  </div>
                  <div className="text-right">
                    <StatusBadge label={`Safe in ${formatCountdownHours(entry.reiCountdownHours)}`} tone="danger" />
                    <p className="mt-2 text-xs text-gray-500">{formatDateTime(entry.reiExpiry)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard
          title={editingProductId ? 'Edit pesticide product' : 'Create pesticide product'}
          description="Map product labels, compliance timing, active ingredients, and the pesticide inventory item that should auto-deduct on use."
          action={
            <button
              type="button"
              onClick={() => {
                setEditingProductId(null);
                setProductValues(defaultProductFormValues());
              }}
              className="rounded-lg border border-ranch-border px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Reset
            </button>
          }
        >
          <div className="grid gap-4 p-6 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Product name</span>
              <input type="text" value={productValues.productName} onChange={(event) => setProductValues((current) => ({ ...current, productName: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Manufacturer</span>
              <input type="text" value={productValues.manufacturer} onChange={(event) => setProductValues((current) => ({ ...current, manufacturer: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">EPA reg #</span>
              <input type="text" value={productValues.epaRegNumber} onChange={(event) => setProductValues((current) => ({ ...current, epaRegNumber: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">CDFA reg #</span>
              <input type="text" value={productValues.cdfaRegNumber} onChange={(event) => setProductValues((current) => ({ ...current, cdfaRegNumber: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">DPR product id</span>
              <input type="text" value={productValues.dprProductId} onChange={(event) => setProductValues((current) => ({ ...current, dprProductId: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Linked inventory item</span>
              <select value={productValues.inventoryItemId} onChange={(event) => setProductValues((current) => ({ ...current, inventoryItemId: event.target.value }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                <option value="">No inventory mapping yet</option>
                {dashboard.pesticideInventoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.sku ? ` (${item.sku})` : ''} / {item.unit}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Label URL</span>
              <input type="url" value={productValues.labelUrl} onChange={(event) => setProductValues((current) => ({ ...current, labelUrl: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">REI hours</span>
              <input type="number" min="0" step="1" value={productValues.reiHours} onChange={(event) => setProductValues((current) => ({ ...current, reiHours: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">PHI days</span>
              <input type="number" min="0" step="1" value={productValues.phiDays} onChange={(event) => setProductValues((current) => ({ ...current, phiDays: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Formulation</span>
              <input type="text" value={productValues.formulation} onChange={(event) => setProductValues((current) => ({ ...current, formulation: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Active ingredients</span>
              <textarea rows={4} value={productValues.activeIngredients} onChange={(event) => setProductValues((current) => ({ ...current, activeIngredients: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="One per line. Format: Ingredient name | percentage" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Target pests</span>
              <input type="text" value={productValues.targetPests} onChange={(event) => setProductValues((current) => ({ ...current, targetPests: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="NOW, mites, aphids" />
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
              <input type="checkbox" checked={productValues.restrictedUse} onChange={(event) => setProductValues((current) => ({ ...current, restrictedUse: event.target.checked }))} />
              Restricted-use pesticide
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
              <input type="checkbox" checked={productValues.isOmriListed} onChange={(event) => setProductValues((current) => ({ ...current, isOmriListed: event.target.checked }))} />
              OMRI listed
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700 md:col-span-2">
              <input type="checkbox" checked={productValues.isCdfaOrganic} onChange={(event) => setProductValues((current) => ({ ...current, isCdfaOrganic: event.target.checked }))} />
              CDFA organic approved
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-ranch-border px-6 py-4">
            <p className="text-sm text-gray-500">Inventory mapping makes pesticide use auto-deduct from stock and turns compliance into a real closed loop.</p>
            <button type="button" onClick={() => void handleSaveProduct()} disabled={savingProduct} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
              <Save className="h-4 w-4" />
              {savingProduct ? 'Saving...' : editingProductId ? 'Update product' : 'Create product'}
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title={editingApplicationId ? 'Edit pesticide application' : 'Log pesticide application'}
          description="Every pesticide record runs through validation, REI/PHI automation, organic checks, and optional lot-level inventory deduction."
        >
          {scopeBlocks.length === 0 ? (
            <div className="p-6">
              <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900">Create your first block before logging pesticide use</h2>
                <p className="mt-2 text-sm text-gray-600">
                  Pesticide applications are block-scoped so the automation can calculate acreage, REI, PHI, and organic status correctly.
                </p>
                <Link href="/blocks/new" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
                  Create first block
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 p-6 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Block</span>
                  <select value={applicationValues.blockId} onChange={(event) => setApplicationValues((current) => ({ ...current, blockId: event.target.value, targetPestScoutingLogId: '' }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                    {scopeBlocks.map((block) => (
                      <option key={block.id} value={block.id}>{block.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Record type</span>
                  <select value={applicationValues.recordType} onChange={(event) => setApplicationValues((current) => ({ ...current, recordType: event.target.value as ApplicationFormValues['recordType'] }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                    {applicationRecordTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Applicator name</span>
                  <input type="text" value={applicationValues.applicatorName} onChange={(event) => setApplicationValues((current) => ({ ...current, applicatorName: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Applicator license</span>
                  <input type="text" value={applicationValues.applicatorLicense} onChange={(event) => setApplicationValues((current) => ({ ...current, applicatorLicense: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Catalog product</span>
                  <select value={applicationValues.productId} onChange={(event) => setApplicationValues((current) => ({ ...current, productId: event.target.value, sourceInventoryStockId: '', epaRegNumber: '' }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                    <option value="">Manual product entry</option>
                    {availableProducts.map((product) => (
                      <option key={product.id} value={product.id}>{product.productName}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Manual product name</span>
                  <input type="text" value={applicationValues.productNameManual} onChange={(event) => setApplicationValues((current) => ({ ...current, productNameManual: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="Only when no catalog product exists" />
                </label>
                {!selectedProduct ? (
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-gray-900">Manual EPA reg #</span>
                    <input type="text" value={applicationValues.epaRegNumber} onChange={(event) => setApplicationValues((current) => ({ ...current, epaRegNumber: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                  </label>
                ) : null}
                {selectedProduct?.inventoryItemId ? (
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold text-gray-900">Source pesticide lot</span>
                    <select value={applicationValues.sourceInventoryStockId} onChange={(event) => setApplicationValues((current) => ({ ...current, sourceInventoryStockId: event.target.value }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                      <option value="">Select pesticide lot</option>
                      {availableStockRows.map((stock) => (
                        <option key={stock.id} value={stock.id}>
                          {stock.locationName} / Lot {stock.lotCode ?? 'unlabeled'} / {formatQuantity(stock.quantityOnHand)} {stock.inventoryUnit ?? ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Applied date</span>
                  <input type="date" value={applicationValues.appliedDate} onChange={(event) => setApplicationValues((current) => ({ ...current, appliedDate: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Acres treated</span>
                  <input type="number" min="0.01" step="0.01" value={applicationValues.acresTreated} onChange={(event) => setApplicationValues((current) => ({ ...current, acresTreated: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Rate per acre</span>
                  <input type="number" min="0" step="0.0001" value={applicationValues.ratePerAcre} onChange={(event) => setApplicationValues((current) => ({ ...current, ratePerAcre: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Rate unit</span>
                  <input type="text" value={applicationValues.rateUnit} onChange={(event) => setApplicationValues((current) => ({ ...current, rateUnit: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Total product used</span>
                  <input type="number" min="0" step="0.0001" value={applicationValues.totalProductUsed} onChange={(event) => setApplicationValues((current) => ({ ...current, totalProductUsed: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Total product unit</span>
                  <input type="text" value={applicationValues.totalProductUnit} onChange={(event) => setApplicationValues((current) => ({ ...current, totalProductUnit: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Water volume GPA</span>
                  <input type="number" min="0" step="0.01" value={applicationValues.waterVolumeGpa} onChange={(event) => setApplicationValues((current) => ({ ...current, waterVolumeGpa: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Equipment used</span>
                  <input type="text" value={applicationValues.equipmentUsed} onChange={(event) => setApplicationValues((current) => ({ ...current, equipmentUsed: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Start time</span>
                  <input type="time" value={applicationValues.appliedStartTime} onChange={(event) => setApplicationValues((current) => ({ ...current, appliedStartTime: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">End time</span>
                  <input type="time" value={applicationValues.appliedEndTime} onChange={(event) => setApplicationValues((current) => ({ ...current, appliedEndTime: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Wind speed MPH</span>
                  <input type="number" min="0" step="0.01" value={applicationValues.windSpeedMph} onChange={(event) => setApplicationValues((current) => ({ ...current, windSpeedMph: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Wind direction</span>
                  <input type="text" value={applicationValues.windDirection} onChange={(event) => setApplicationValues((current) => ({ ...current, windDirection: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="NW, E, variable..." />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Temperature F</span>
                  <input type="number" step="0.01" value={applicationValues.tempF} onChange={(event) => setApplicationValues((current) => ({ ...current, tempF: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Target scouting log</span>
                  <select value={applicationValues.targetPestScoutingLogId} onChange={(event) => setApplicationValues((current) => ({ ...current, targetPestScoutingLogId: event.target.value, targetPest: availableScoutingLogs.find((log) => log.id === event.target.value)?.pestDisplayName ?? current.targetPest }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                    <option value="">No scouting link</option>
                    {availableScoutingLogs.map((log) => (
                      <option key={log.id} value={log.id}>
                        {log.pestDisplayName} / {formatAppliedDate(log.scoutedAt.slice(0, 10))}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-gray-900">Target pest</span>
                  <input type="text" value={applicationValues.targetPest} onChange={(event) => setApplicationValues((current) => ({ ...current, targetPest: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
                  <input type="checkbox" checked={applicationValues.omriConfirmed} onChange={(event) => setApplicationValues((current) => ({ ...current, omriConfirmed: event.target.checked }))} />
                  Organic approval confirmed
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
                  <input type="checkbox" checked={applicationValues.certifierNotified} onChange={(event) => setApplicationValues((current) => ({ ...current, certifierNotified: event.target.checked }))} />
                  Certifier notified
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700 md:col-span-2">
                  <input type="checkbox" checked={applicationValues.verified} onChange={(event) => setApplicationValues((current) => ({ ...current, verified: event.target.checked }))} />
                  Mark as verified once all blockers are cleared
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-gray-900">Notes</span>
                  <textarea rows={4} value={applicationValues.notes} onChange={(event) => setApplicationValues((current) => ({ ...current, notes: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="Weather observations, posting notes, crew notes, drift notes..." />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ranch-border px-6 py-4">
                <div className="text-sm text-gray-500">
                  {selectedProduct ? `Selected product: ${selectedProduct.productName}` : 'Manual product entry'}
                  {selectedStockRow ? ` / Lot ${selectedStockRow.lotCode ?? 'unlabeled'} at ${selectedStockRow.locationName}` : ''}
                </div>
                <div className="flex gap-3">
                  {editingApplicationId ? (
                    <button type="button" onClick={() => {
                      setEditingApplicationId(null);
                      setApplicationValues(defaultApplicationFormValues(scopeBlocks[0]?.id ?? ''));
                      setErrorMessage('');
                      setSuccessMessage('');
                    }} className="rounded-lg border border-ranch-border px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                      Cancel
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void handleSaveApplication()} disabled={savingApplication} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
                    <SprayCan className="h-4 w-4" />
                    {savingApplication ? 'Saving...' : editingApplicationId ? 'Update application' : 'Create application'}
                  </button>
                </div>
              </div>
            </>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="Pesticide catalog"
          description="Mapped products, current compliance metadata, and live inventory-link status."
        >
          <div className="divide-y">
            {dashboard.products.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">No pesticide products yet.</div>
            ) : (
              dashboard.products.map((product) => (
                <div key={product.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{product.productName}</p>
                      {product.restrictedUse ? <StatusBadge label="Restricted use" tone="danger" /> : null}
                      {product.isOmriListed || product.isCdfaOrganic ? <StatusBadge label="Organic approved" tone="success" /> : null}
                      {product.inventoryItemId ? <StatusBadge label="Inventory linked" tone="info" /> : <StatusBadge label="Inventory unmapped" tone="warning" />}
                    </div>
                    <p className="text-sm text-gray-600">
                      {product.manufacturer ?? 'Unknown manufacturer'}
                      {product.epaRegNumber ? ` / EPA ${product.epaRegNumber}` : ''}
                      {product.cdfaRegNumber ? ` / CDFA ${product.cdfaRegNumber}` : ''}
                    </p>
                    <p className="text-sm text-gray-600">
                      REI {product.reiHours ?? 'n/a'}h / PHI {product.phiDays ?? 'n/a'}d
                      {product.formulation ? ` / ${product.formulation}` : ''}
                    </p>
                    {product.inventorySummary ? (
                      <p className="text-sm text-gray-500">
                        {formatQuantity(product.inventorySummary.quantityOnHand)} {product.inventoryItem?.unit ?? ''} on hand across {product.inventorySummary.stockRowCount} stock rows
                      </p>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => {
                    setEditingProductId(product.id);
                    setProductValues(productRecordToFormValues(product));
                    setErrorMessage('');
                    setSuccessMessage('');
                  }} className="rounded-lg border border-ranch-border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Edit
                  </button>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <div className="space-y-8">
          <SectionCard
            title="Annual pesticide summary"
            description="Rollups for active ingredient and county reporting."
          >
            <div className="grid gap-6 p-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Active ingredients</h3>
                <div className="mt-3 space-y-3">
                  {dashboard.annualSummary.activeIngredients.length === 0 ? (
                    <p className="text-sm text-gray-600">No pesticide usage summary yet.</p>
                  ) : (
                    dashboard.annualSummary.activeIngredients.slice(0, 8).map((row) => (
                      <div key={row.ingredientName} className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                        <p className="font-semibold text-gray-900">{row.ingredientName}</p>
                        <p className="mt-1 text-sm text-gray-600">{row.applicationCount} applications / {formatQuantity(row.totalAcres)} treated acres</p>
                        <p className="mt-1 text-xs text-gray-500">{formatQuantity(row.totalProductUsed, 4)} total units logged</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Counties</h3>
                <div className="mt-3 space-y-3">
                  {dashboard.annualSummary.counties.length === 0 ? (
                    <p className="text-sm text-gray-600">No county rollups yet.</p>
                  ) : (
                    dashboard.annualSummary.counties.map((row) => (
                      <div key={row.county} className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                        <p className="font-semibold text-gray-900">{row.county}</p>
                        <p className="mt-1 text-sm text-gray-600">{row.applicationCount} applications / {formatQuantity(row.totalAcres)} treated acres</p>
                        <p className="mt-1 text-xs text-gray-500">{formatQuantity(row.totalProductUsed, 4)} total units logged</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Organic review"
            description={`Organic blocks and inputs for ${dashboard.organicSummary.certifierName} inspection readiness.`}
          >
            <div className="space-y-4 p-6">
              {dashboard.organicSummary.organicBlocks.length === 0 ? (
                <p className="text-sm text-gray-600">No organic blocks in this workspace yet.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <div className="flex items-start gap-3">
                      <Leaf className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                      <p>
                        {dashboard.organicSummary.organicBlocks.length} organic block(s) tracked. Any pesticide application here now checks OMRI/organic approval and can be exported as an annual organic input log.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {scopedOrganicApplications.slice(0, 8).map((entry) => (
                      <div key={entry.applicationId} className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900">{entry.productName}</p>
                          {entry.omriApproved ? <StatusBadge label="Approved" tone="success" /> : <StatusBadge label="Review" tone="danger" />}
                          {entry.certifierNotified ? <StatusBadge label="Certifier notified" tone="info" /> : null}
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{entry.blockName} / {formatAppliedDate(entry.appliedDate)} / {entry.applicatorName}</p>
                        <p className="mt-1 text-sm text-gray-500">{entry.rate} / {entry.totalUsed}</p>
                        {entry.blockingIssues.length > 0 ? <p className="mt-2 text-sm text-red-700">{entry.blockingIssues[0]}</p> : null}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="Recent pesticide records"
        description="Live compliance status, countdowns, and inventory linkage on the latest application records."
      >
        <div className="divide-y">
          {scopedApplications.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-600">No compliance records yet. Create the first pesticide application from the form.</div>
          ) : (
            scopedApplications.slice(0, 20).map((record) => (
              <div key={record.id} className="space-y-3 px-6 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{record.productDisplayName}</p>
                      {record.automation.dprReady ? <StatusBadge label="DPR ready" tone="success" /> : null}
                      {record.verifiedAt ? <StatusBadge label="Verified" tone="success" /> : <StatusBadge label="Unverified" tone="default" />}
                      {record.automation.inventoryStatus === 'synced' ? <StatusBadge label="Inventory synced" tone="info" /> : null}
                      {record.isOrganicBlock ? <StatusBadge label="Organic block" tone="success" /> : null}
                      {record.product?.restrictedUse ? <StatusBadge label="Restricted use" tone="danger" /> : null}
                    </div>
                    <p className="text-sm text-gray-600">
                      {record.block?.name ?? 'Block'} / {formatBlockCropLabel(record.block?.cropType ?? '')}
                      {record.block?.variety ? ` / ${record.block.variety}` : ''}
                      {record.ranch?.name ? ` / ${record.ranch.name}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                      <span>{formatRecordTypeLabel(record.recordType)}</span>
                      <span>{formatAppliedDate(record.appliedDate)}</span>
                      <span>{record.applicatorName}</span>
                      <span>{record.acresTreated} acres</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                      {record.automation.reiActive ? <span>REI safe in {formatCountdownHours(record.automation.reiCountdownHours)}</span> : null}
                      {record.automation.phiActive ? <span>PHI safe in {formatCountdownDays(record.automation.phiCountdownDays)}</span> : null}
                      {record.sourceInventoryStock ? <span>Lot {record.sourceInventoryStock.lotCode ?? 'unlabeled'} / {record.sourceInventoryStock.locationName}</span> : null}
                    </div>
                    {record.automation.blockingIssues.length > 0 ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <p className="font-semibold">Blocking issues</p>
                        <ul className="mt-2 space-y-1">
                          {record.automation.blockingIssues.map((issue) => (
                            <li key={issue}>• {issue}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {record.automation.warnings.length > 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <p className="font-semibold">Warnings</p>
                        <ul className="mt-2 space-y-1">
                          {record.automation.warnings.map((warning) => (
                            <li key={warning}>• {warning}</li>
                          ))}
                        </ul>
                      </div>
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
      </SectionCard>

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <div className="flex items-start gap-3">
          <PackageSearch className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
          <p>
            Pesticide applications now validate DPR-critical fields, calculate REI and PHI automatically, flag organic conflicts, and can auto-deduct the exact pesticide lot used when the product is inventory-mapped.
          </p>
        </div>
      </div>
    </div>
  );
}
