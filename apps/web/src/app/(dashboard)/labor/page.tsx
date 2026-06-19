'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, ClipboardPenLine, FileDown, Save, ShieldAlert, TimerReset, Users } from 'lucide-react';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { fetchRanches, type RanchRecord } from '@/lib/ranches';
import {
  LaborDashboardPayload,
  LaborEntryFormValues,
  LaborEntryRecord,
  LaborPayrollPeriodPayload,
  LaborTaskSummary,
  createLaborEntry,
  defaultLaborEntryFormValues,
  defaultLaborPayrollPeriodRange,
  estimateLaborEntryGrossPay,
  estimateLaborHours,
  fetchLaborDashboard,
  fetchLaborPayrollPeriod,
  formatCrewPayType,
  formatCurrency,
  formatHours,
  formatLaborDate,
  formatLaborDateTime,
  formatPayrollPeriodPayType,
  formatPieceRateType,
  getLaborPayrollExportHref,
  getLaborPayrollExportXlsxHref,
  laborEntryToFormValues,
  laborPieceRateTypeOptions,
  setLaborEntryApproval,
  updateLaborEntry,
} from '@/lib/labor';

const emptyDashboard: LaborDashboardPayload = {
  crewMembers: [],
  laborEntries: [],
  availableProfiles: [],
  blocks: [],
  tasks: [],
  crewPayroll: [],
  approvalQueue: [],
  summary: {
    totalCrewMembers: 0,
    activeCrewMembers: 0,
    h2aWorkers: 0,
    laborEntries: 0,
    hoursLast7Days: 0,
    grossPayLast7Days: 0,
    pendingApprovals: 0,
    approvedEntries: 0,
    pendingHours: 0,
    pendingGrossPay: 0,
    approvedGrossPay: 0,
    approvedGrossPayLast7Days: 0,
  },
};

const defaultPayrollPeriod = defaultLaborPayrollPeriodRange();

const emptyPayrollPeriod: LaborPayrollPeriodPayload = {
  startDate: defaultPayrollPeriod.startDate,
  endDate: defaultPayrollPeriod.endDate,
  approvedEntries: 0,
  approvedCrewMembers: 0,
  totalHours: 0,
  totalGrossPay: 0,
  payTypeBreakdown: [],
  h2aSummary: {
    crewMembers: 0,
    approvedEntries: 0,
    totalHours: 0,
    totalGrossPay: 0,
  },
  approvalActivity: {
    oldestWorkDate: null,
    latestWorkDate: null,
    latestApprovedAt: null,
  },
  downstreamReadiness: {
    readyCrewMembers: 0,
    crewsWithIssues: 0,
    missingEmployeeIdCrewMembers: 0,
    missingPositionCrewMembers: 0,
    missingPayTypeCrewMembers: 0,
    ranchesRepresented: 0,
    multiRanchCrewMembers: 0,
    unlinkedApprovedEntries: 0,
  },
  ranchBreakdown: [],
  exportBlockers: [],
  crewRollups: [],
};

function sortLaborEntries(records: LaborEntryRecord[]) {
  return [...records].sort((left, right) => {
    const dateDiff = right.workDate.localeCompare(left.workDate);
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

function formatAgeDays(value: number | null) {
  if (value === null) {
    return 'Review soon';
  }

  if (value <= 0) {
    return 'Worked today';
  }

  if (value === 1) {
    return '1 day pending';
  }

  return `${value} days pending`;
}

const ALL_RANCHES_VALUE = 'all-ranches';

type ScopedCrewPayrollRecord = LaborDashboardPayload['crewPayroll'][number] & {
  ranchIds: string[];
};

type ScopedApprovalQueueRecord = LaborDashboardPayload['approvalQueue'][number] & {
  ranchId: string | null;
};

function toLaborNumber(value: string | number | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isEntryInScope(entry: LaborEntryRecord, ranchId: string | null) {
  if (!ranchId) {
    return true;
  }

  return entry.block?.ranchId === ranchId;
}

function buildScopedCrewPayroll(entries: LaborEntryRecord[]): ScopedCrewPayrollRecord[] {
  const rollups = entries.reduce(
    (map, entry) => {
      if (!entry.crewMember) {
        return map;
      }

      const existing = map.get(entry.crewMemberId) ?? {
        crewMemberId: entry.crewMemberId,
        crewMemberName: entry.crewMember.fullName,
        employeeId: entry.crewMember.employeeId,
        position: entry.crewMember.position,
        payType: entry.crewMember.payType,
        active: entry.crewMember.active,
        h2aWorker: entry.crewMember.h2aWorker,
        totalEntries: 0,
        approvedEntries: 0,
        pendingEntries: 0,
        totalHours: 0,
        approvedHours: 0,
        pendingHours: 0,
        totalGrossPay: 0,
        approvedGrossPay: 0,
        pendingGrossPay: 0,
        lastWorkDate: null as string | null,
        lastApprovedAt: null as string | null,
        ranchIds: new Set<string>(),
      };

      const hoursWorked = toLaborNumber(entry.hoursWorked);
      const grossPay = toLaborNumber(entry.grossPay);
      const approved = Boolean(entry.approvedAt);

      existing.totalEntries += 1;
      existing.totalHours += hoursWorked;
      existing.totalGrossPay += grossPay;

      if (approved) {
        existing.approvedEntries += 1;
        existing.approvedHours += hoursWorked;
        existing.approvedGrossPay += grossPay;
        if (!existing.lastApprovedAt || (entry.approvedAt && entry.approvedAt > existing.lastApprovedAt)) {
          existing.lastApprovedAt = entry.approvedAt;
        }
      } else {
        existing.pendingEntries += 1;
        existing.pendingHours += hoursWorked;
        existing.pendingGrossPay += grossPay;
      }

      if (!existing.lastWorkDate || entry.workDate > existing.lastWorkDate) {
        existing.lastWorkDate = entry.workDate;
      }

      if (entry.block?.ranchId) {
        existing.ranchIds.add(entry.block.ranchId);
      }

      map.set(entry.crewMemberId, existing);
      return map;
    },
    new Map<
      string,
      Omit<ScopedCrewPayrollRecord, 'ranchIds'> & {
        ranchIds: Set<string>;
      }
    >(),
  );

  return Array.from(rollups.values())
    .map((rollup) => ({
      ...rollup,
      totalHours: Number(rollup.totalHours.toFixed(2)),
      approvedHours: Number(rollup.approvedHours.toFixed(2)),
      pendingHours: Number(rollup.pendingHours.toFixed(2)),
      totalGrossPay: Number(rollup.totalGrossPay.toFixed(2)),
      approvedGrossPay: Number(rollup.approvedGrossPay.toFixed(2)),
      pendingGrossPay: Number(rollup.pendingGrossPay.toFixed(2)),
      ranchIds: Array.from(rollup.ranchIds),
    }))
    .sort((left, right) => {
      if (right.pendingGrossPay !== left.pendingGrossPay) {
        return right.pendingGrossPay - left.pendingGrossPay;
      }

      if (right.totalGrossPay !== left.totalGrossPay) {
        return right.totalGrossPay - left.totalGrossPay;
      }

      return left.crewMemberName.localeCompare(right.crewMemberName);
    });
}

function buildScopedApprovalQueue(entries: LaborEntryRecord[]): ScopedApprovalQueueRecord[] {
  return entries
    .filter((entry) => !entry.approvedAt)
    .sort((left, right) => {
      const dateDiff = left.workDate.localeCompare(right.workDate);
      return dateDiff !== 0 ? dateDiff : (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
    })
    .map((entry) => ({
      laborEntryId: entry.id,
      crewMemberId: entry.crewMemberId,
      crewMemberName: entry.crewMember?.fullName ?? 'Crew member',
      payType: entry.crewMember?.payType ?? null,
      workDate: entry.workDate,
      blockName: entry.block?.name ?? null,
      taskTitle: entry.task?.title ?? null,
      hoursWorked: Number(toLaborNumber(entry.hoursWorked).toFixed(2)),
      grossPay: Number(toLaborNumber(entry.grossPay).toFixed(2)),
      pieceRateType: entry.pieceRateType,
      pieceRateQuantity: entry.pieceRateQuantity,
      pieceRatePerUnit: entry.pieceRatePerUnit,
      notes: entry.notes,
      createdAt: entry.createdAt,
      ageDays: Math.max(
        0,
        Math.floor((Date.now() - new Date(`${entry.workDate}T12:00:00.000Z`).getTime()) / (1000 * 60 * 60 * 24)),
      ),
      ranchId: entry.block?.ranchId ?? null,
    }))
    .slice(0, 12);
}

function summarizeScopedLabor(entries: LaborEntryRecord[]) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const crewIds = new Set(entries.map((entry) => entry.crewMemberId));

  return entries.reduce(
    (summary, entry) => {
      const hoursWorked = toLaborNumber(entry.hoursWorked);
      const grossPay = toLaborNumber(entry.grossPay);
      const approved = Boolean(entry.approvedAt);

      summary.crewMembers = crewIds.size;

      if (entry.workDate >= cutoffDate) {
        summary.hoursLast7Days += hoursWorked;
      }

      if (approved) {
        summary.approvedEntries += 1;
        if (entry.workDate >= cutoffDate) {
          summary.approvedGrossPayLast7Days += grossPay;
        }
      } else {
        summary.pendingApprovals += 1;
        summary.pendingGrossPay += grossPay;
      }

      return summary;
    },
    {
      crewMembers: crewIds.size,
      pendingApprovals: 0,
      approvedEntries: 0,
      pendingGrossPay: 0,
      approvedGrossPayLast7Days: 0,
      hoursLast7Days: 0,
    },
  );
}

function formatScopedBlockLabel(
  block: LaborDashboardPayload['blocks'][number],
  ranchNameById: Map<string, string>,
  showPortfolioLabels: boolean,
) {
  if (!showPortfolioLabels) {
    return block.name;
  }

  return `${block.name} - ${ranchNameById.get(block.ranchId) ?? 'Unknown ranch'}`;
}

function formatScopedTaskLabel(task: LaborTaskSummary, ranchNameById: Map<string, string>, showPortfolioLabels: boolean) {
  if (!showPortfolioLabels) {
    return task.title;
  }

  if (task.ranchIds.length === 1) {
    return `${task.title} - ${ranchNameById.get(task.ranchIds[0]) ?? 'Unknown ranch'}`;
  }

  if (task.ranchIds.length > 1) {
    return `${task.title} - ${task.ranchIds.length} ranches`;
  }

  return `${task.title} - Any ranch`;
}

function formatScopedRanchLabel(ranchId: string | null, ranchNameById: Map<string, string>) {
  if (!ranchId) {
    return 'Unlinked labor';
  }

  return ranchNameById.get(ranchId) ?? 'Unknown ranch';
}

function formatPayrollRanchCoverage(ranchNames: string[]) {
  if (ranchNames.length === 0) {
    return 'Unlinked labor';
  }

  if (ranchNames.length === 1) {
    return ranchNames[0];
  }

  return `${ranchNames.length} ranches`;
}

type PayrollPortfolioRollup = {
  ranchId: string | null;
  ranchName: string;
  crewMembers: number;
  readyCrewLanes: number;
  blockerCrewLanes: number;
  approvedEntries: number;
  totalHours: number;
  totalGrossPay: number;
  latestWorkDate: string | null;
  latestApprovedAt: string | null;
  blockerReasons: string[];
};

function buildPayrollHandoffSummary(payPeriod: LaborPayrollPeriodPayload) {
  const blockerLines =
    payPeriod.exportBlockers.length === 0
      ? ['- No downstream export blockers.']
      : payPeriod.exportBlockers.slice(0, 6).map((blocker) => {
          const ranchCoverage = formatPayrollRanchCoverage(blocker.ranchNames);
          return `- ${blocker.crewMemberName}: ${blocker.issues.join(', ')} (${blocker.approvedEntries} entries, ${formatHours(
            blocker.totalHours,
          )}, ${formatCurrency(blocker.totalGrossPay)}, ${ranchCoverage})`;
        });

  const ranchLines =
    payPeriod.ranchBreakdown.length === 0
      ? ['- No ranch-linked approved payroll in range.']
      : payPeriod.ranchBreakdown.slice(0, 6).map((rollup) => {
          const label = rollup.ranchName ?? 'Unlinked labor';
          return `- ${label}: ${rollup.approvedEntries} entries, ${rollup.crewMembers} crew, ${formatHours(
            rollup.totalHours,
          )}, ${formatCurrency(rollup.totalGrossPay)}`;
        });

  return [
    `Approved payroll export handoff`,
    `Range: ${formatLaborDate(payPeriod.startDate)} to ${formatLaborDate(payPeriod.endDate)}`,
    `Approved entries: ${payPeriod.approvedEntries}`,
    `Approved crew lanes: ${payPeriod.approvedCrewMembers}`,
    `Approved hours: ${formatHours(payPeriod.totalHours)}`,
    `Approved gross pay: ${formatCurrency(payPeriod.totalGrossPay)}`,
    `Ready crew lanes: ${payPeriod.downstreamReadiness.readyCrewMembers}`,
    `Crew with blockers: ${payPeriod.downstreamReadiness.crewsWithIssues}`,
    `Missing employee IDs: ${payPeriod.downstreamReadiness.missingEmployeeIdCrewMembers}`,
    `Missing positions: ${payPeriod.downstreamReadiness.missingPositionCrewMembers}`,
    `Missing pay types: ${payPeriod.downstreamReadiness.missingPayTypeCrewMembers}`,
    `Ranches represented: ${payPeriod.downstreamReadiness.ranchesRepresented}`,
    `Multi-ranch crew lanes: ${payPeriod.downstreamReadiness.multiRanchCrewMembers}`,
    `Unlinked approved entries: ${payPeriod.downstreamReadiness.unlinkedApprovedEntries}`,
    '',
    'Top export blockers',
    ...blockerLines,
    '',
    'Ranch breakdown',
    ...ranchLines,
  ].join('\n');
}

export default function LaborPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [selectedRanchId, setSelectedRanchId] = useState(ALL_RANCHES_VALUE);
  const [dashboard, setDashboard] = useState<LaborDashboardPayload>(emptyDashboard);
  const [payPeriodStart, setPayPeriodStart] = useState(defaultPayrollPeriod.startDate);
  const [payPeriodEnd, setPayPeriodEnd] = useState(defaultPayrollPeriod.endDate);
  const [payPeriod, setPayPeriod] = useState<LaborPayrollPeriodPayload>(emptyPayrollPeriod);
  const [formValues, setFormValues] = useState<LaborEntryFormValues>(defaultLaborEntryFormValues());
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [selectedReviewCrewId, setSelectedReviewCrewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payPeriodLoading, setPayPeriodLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approvalSavingEntryId, setApprovalSavingEntryId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const applyDashboard = (
    laborDashboard: LaborDashboardPayload,
    options: {
      resetForm?: boolean;
      formCrewMemberId?: string | null;
      reviewCrewMemberId?: string | null;
    } = {},
  ) => {
    const sortedDashboard = {
      ...laborDashboard,
      laborEntries: sortLaborEntries(laborDashboard.laborEntries),
    };
    const defaultCrewMemberId = laborDashboard.crewMembers.find((crewMember) => crewMember.active)?.id ?? '';
    const requestedFormCrewMemberId = options.formCrewMemberId ?? defaultCrewMemberId;
    const nextFormCrewMemberId = laborDashboard.crewMembers.some(
      (crewMember) => crewMember.id === requestedFormCrewMemberId && crewMember.active,
    )
      ? requestedFormCrewMemberId
      : defaultCrewMemberId;
    const requestedReviewCrewMemberId = options.reviewCrewMemberId ?? selectedReviewCrewId ?? nextFormCrewMemberId;
    const nextReviewCrewMemberId = sortedDashboard.crewPayroll.some(
      (rollup) => rollup.crewMemberId === requestedReviewCrewMemberId,
    )
      ? requestedReviewCrewMemberId
      : sortedDashboard.crewPayroll[0]?.crewMemberId ?? nextFormCrewMemberId;

    setDashboard(sortedDashboard);
    setSelectedReviewCrewId(nextReviewCrewMemberId || null);

    if (options.resetForm) {
      setEditingEntryId(null);
      setFormValues(defaultLaborEntryFormValues(nextFormCrewMemberId));
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [onboardingStatus, laborDashboard, ranchRows] = await Promise.all([
          fetchOnboardingStatus(),
          fetchLaborDashboard(),
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
            : ranchRows[0]?.id ?? onboardingStatus.ranch?.id ?? ALL_RANCHES_VALUE,
        );
        applyDashboard(laborDashboard, { resetForm: true });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load labor workspace.');
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

  const activeCrewMembers = useMemo(
    () => dashboard.crewMembers.filter((crewMember) => crewMember.active),
    [dashboard.crewMembers],
  );
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
  const showPortfolioLabels = !selectedRanch && ranches.length > 1;
  const blocksInScope = useMemo(
    () => (selectedRanch ? dashboard.blocks.filter((block) => block.ranchId === selectedRanch.id) : dashboard.blocks),
    [dashboard.blocks, selectedRanch],
  );
  const tasksInScope = useMemo(
    () =>
      selectedRanch
        ? dashboard.tasks.filter((task) => task.ranchIds.length === 0 || task.ranchIds.includes(selectedRanch.id))
        : dashboard.tasks,
    [dashboard.tasks, selectedRanch],
  );
  const scopedLaborEntries = useMemo(
    () => dashboard.laborEntries.filter((entry) => isEntryInScope(entry, selectedRanch?.id ?? null)),
    [dashboard.laborEntries, selectedRanch],
  );
  const scopedSummary = useMemo(() => summarizeScopedLabor(scopedLaborEntries), [scopedLaborEntries]);
  const scopedCrewPayroll = useMemo(() => buildScopedCrewPayroll(scopedLaborEntries), [scopedLaborEntries]);
  const scopedApprovalQueue = useMemo(() => buildScopedApprovalQueue(scopedLaborEntries), [scopedLaborEntries]);
  const hiddenPortfolioEntryCount = selectedRanch ? dashboard.laborEntries.length - scopedLaborEntries.length : 0;
  const scopeVisibilityNote =
    selectedRanch && hiddenPortfolioEntryCount > 0
      ? `${hiddenPortfolioEntryCount} additional portfolio labor record${hiddenPortfolioEntryCount === 1 ? '' : 's'} stay visible only in the all-ranches view.`
      : null;

  const selectedCrewMember = useMemo(
    () => dashboard.crewMembers.find((crewMember) => crewMember.id === formValues.crewMemberId) ?? null,
    [dashboard.crewMembers, formValues.crewMemberId],
  );

  const estimatedHours = estimateLaborHours(formValues);
  const estimatedGrossPay = estimateLaborEntryGrossPay(selectedCrewMember, formValues);
  const selectedReviewCrew = useMemo(
    () =>
      scopedCrewPayroll.find((rollup) => rollup.crewMemberId === selectedReviewCrewId) ??
      scopedCrewPayroll[0] ??
      null,
    [scopedCrewPayroll, selectedReviewCrewId],
  );

  const resetForm = () => {
    setEditingEntryId(null);
    setFormValues(defaultLaborEntryFormValues(activeCrewMembers[0]?.id ?? ''));
  };

  const refreshDashboardAndPayroll = async (
    options: {
      resetForm?: boolean;
      formCrewMemberId?: string | null;
      reviewCrewMemberId?: string | null;
    } = {},
  ) => {
    const refreshedDashboard = await fetchLaborDashboard();
    applyDashboard(refreshedDashboard, options);

    if (payPeriodStart && payPeriodEnd && payPeriodStart <= payPeriodEnd) {
      const refreshedPayPeriod = await fetchLaborPayrollPeriod(payPeriodStart, payPeriodEnd);
      setPayPeriod(refreshedPayPeriod);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (editingEntryId) {
        await updateLaborEntry(editingEntryId, formValues);
        await refreshDashboardAndPayroll({
          resetForm: true,
          formCrewMemberId: formValues.crewMemberId,
          reviewCrewMemberId: formValues.crewMemberId,
        });
        setSuccessMessage('Labor entry updated and returned to payroll review.');
      } else {
        await createLaborEntry(formValues);
        await refreshDashboardAndPayroll({
          resetForm: true,
          formCrewMemberId: formValues.crewMemberId,
          reviewCrewMemberId: formValues.crewMemberId,
        });
        setSuccessMessage('Labor entry created.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save labor entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprovalToggle = async (entryId: string, crewMemberId: string, approved: boolean) => {
    setApprovalSavingEntryId(entryId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await setLaborEntryApproval(entryId, approved);
      await refreshDashboardAndPayroll({
        reviewCrewMemberId: selectedReviewCrewId ?? crewMemberId,
      });
      setSuccessMessage(approved ? 'Labor entry approved for payroll review.' : 'Payroll approval cleared.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update labor approval.');
    } finally {
      setApprovalSavingEntryId(null);
    }
  };

  useEffect(() => {
    if (formValues.blockId && !blocksInScope.some((block) => block.id === formValues.blockId)) {
      setFormValues((current) => ({ ...current, blockId: '' }));
    }
  }, [blocksInScope, formValues.blockId]);

  useEffect(() => {
    if (formValues.taskId && !tasksInScope.some((task) => task.id === formValues.taskId)) {
      setFormValues((current) => ({ ...current, taskId: '' }));
    }
  }, [formValues.taskId, tasksInScope]);

  useEffect(() => {
    let cancelled = false;

    if (!payPeriodStart || !payPeriodEnd || payPeriodStart > payPeriodEnd) {
      setPayPeriodLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadPayPeriod = async () => {
      setPayPeriodLoading(true);

      try {
        const payrollPeriod = await fetchLaborPayrollPeriod(payPeriodStart, payPeriodEnd);
        if (!cancelled) {
          setPayPeriod(payrollPeriod);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load payroll export review.');
        }
      } finally {
        if (!cancelled) {
          setPayPeriodLoading(false);
        }
      }
    };

    void loadPayPeriod();

    return () => {
      cancelled = true;
    };
  }, [payPeriodStart, payPeriodEnd]);

  const payPeriodRangeInvalid = payPeriodStart > payPeriodEnd;
  const payPeriodExportHref = payPeriodRangeInvalid ? '' : getLaborPayrollExportHref(payPeriodStart, payPeriodEnd);
  const payPeriodExportXlsxHref = payPeriodRangeInvalid ? '' : getLaborPayrollExportXlsxHref(payPeriodStart, payPeriodEnd);
  const payrollPortfolioRollups = useMemo<PayrollPortfolioRollup[]>(() => {
    return payPeriod.ranchBreakdown
      .map((rollup) => {
        const matchingBlockers = payPeriod.exportBlockers.filter((blocker) =>
          rollup.ranchName ? blocker.ranchNames.includes(rollup.ranchName) : blocker.ranchNames.length === 0,
        );
        const blockerReasons = Array.from(new Set(matchingBlockers.flatMap((blocker) => blocker.issues))).sort((left, right) =>
          left.localeCompare(right),
        );

        return {
          ranchId: rollup.ranchId,
          ranchName: rollup.ranchName ?? 'Unlinked labor',
          crewMembers: rollup.crewMembers,
          readyCrewLanes: Math.max(rollup.crewMembers - matchingBlockers.length, 0),
          blockerCrewLanes: matchingBlockers.length,
          approvedEntries: rollup.approvedEntries,
          totalHours: rollup.totalHours,
          totalGrossPay: rollup.totalGrossPay,
          latestWorkDate: rollup.latestWorkDate,
          latestApprovedAt: rollup.latestApprovedAt,
          blockerReasons,
        };
      })
      .sort((left, right) => {
        if (right.blockerCrewLanes !== left.blockerCrewLanes) {
          return right.blockerCrewLanes - left.blockerCrewLanes;
        }

        if (right.totalGrossPay !== left.totalGrossPay) {
          return right.totalGrossPay - left.totalGrossPay;
        }

        return left.ranchName.localeCompare(right.ranchName);
      });
  }, [payPeriod.exportBlockers, payPeriod.ranchBreakdown]);
  const payrollPortfolioReadyRanches = useMemo(
    () => payrollPortfolioRollups.filter((rollup) => rollup.crewMembers > 0 && rollup.blockerCrewLanes === 0).length,
    [payrollPortfolioRollups],
  );
  const handleCopyPayrollHandoff = async () => {
    try {
      await navigator.clipboard.writeText(buildPayrollHandoffSummary(payPeriod));
      setSuccessMessage('Payroll export handoff summary copied.');
      setErrorMessage('');
    } catch {
      setErrorMessage('Unable to copy payroll export handoff summary.');
    }
  };
  const handleScopeChange = (nextRanchId: string) => {
    setSelectedRanchId(nextRanchId);
    setEditingEntryId(null);
    setSelectedReviewCrewId(null);
    setSuccessMessage('');
    setErrorMessage('');
    setFormValues(defaultLaborEntryFormValues(activeCrewMembers[0]?.id ?? ''));
  };

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading labor workflow...</div>;
  }

  if (!status?.organization) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Finish onboarding first</h1>
          <p className="mt-2 text-sm text-gray-600">Labor logging unlocks after the workspace is connected to an organization.</p>
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
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Labor</p>
          <h1 className="text-3xl font-bold text-gray-900">{selectedScopeLabel} labor log</h1>
          <p className="text-sm text-gray-600">Crew time, piece work, and payroll review on persisted labor records, now with ranch-scoped operating views.</p>
        </div>
        <Link href="/settings/team" className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700">
          Manage crew
          <ArrowRight className="h-4 w-4" />
        </Link>
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
              {selectedRanch ? 'Focused on a single ranch for block-linked labor review.' : 'Portfolio-wide labor view.'}
              {showPortfolioLabels ? ' Block, task, approval, and entry lists include ranch labels in all-ranches mode.' : ''}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {ranches.length > 1 ? (
            <button
              type="button"
              onClick={() => handleScopeChange(ALL_RANCHES_VALUE)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                selectedRanchId === ALL_RANCHES_VALUE ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                selectedRanchId === ranch.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {ranch.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Crew In View" value={scopedSummary.crewMembers} detail="Crew represented by labor in this scope" />
        <MetricCard label="Pending Approval" value={scopedSummary.pendingApprovals} detail="Entries still waiting for payroll sign-off" />
        <MetricCard label="Pending Gross" value={formatCurrency(scopedSummary.pendingGrossPay)} detail="Unapproved pay still sitting in review" />
        <MetricCard label="Approved Gross / 7 Days" value={formatCurrency(scopedSummary.approvedGrossPayLast7Days)} detail="Approved pay captured in the last week" />
      </div>

      {activeCrewMembers.length === 0 ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Add your first crew member to unlock labor logging</h2>
          <p className="mt-2 text-sm text-gray-600">Crew setup is the one prerequisite for this first labor slice.</p>
          <Link href="/settings/team" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            Open team settings
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">{editingEntryId ? 'Edit labor entry' : 'Create labor entry'}</h2>
                <p className="mt-1 text-sm text-gray-500">Hourly, piece-rate, and salary flows all post to the live labor table.</p>
              </div>

              <div className="grid gap-4 p-6 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Crew member</span>
                  <select value={formValues.crewMemberId} onChange={(event) => setFormValues((current) => ({ ...current, crewMemberId: event.target.value }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                    {activeCrewMembers.map((crewMember) => (
                      <option key={crewMember.id} value={crewMember.id}>
                        {crewMember.fullName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Work date</span>
                  <input type="date" value={formValues.workDate} onChange={(event) => setFormValues((current) => ({ ...current, workDate: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Block</span>
                  <select value={formValues.blockId} onChange={(event) => setFormValues((current) => ({ ...current, blockId: event.target.value }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                    <option value="">No block linked</option>
                    {blocksInScope.map((block) => (
                      <option key={block.id} value={block.id}>
                        {formatScopedBlockLabel(block, ranchNameById, showPortfolioLabels)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Task</span>
                  <select value={formValues.taskId} onChange={(event) => setFormValues((current) => ({ ...current, taskId: event.target.value }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                    <option value="">No task linked</option>
                    {tasksInScope.map((task) => (
                      <option key={task.id} value={task.id}>
                        {formatScopedTaskLabel(task, ranchNameById, showPortfolioLabels)}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedCrewMember?.payType === 'hourly' ? (
                  <>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-gray-900">Hours worked</span>
                      <input type="number" min="0" step="0.01" value={formValues.hoursWorked} onChange={(event) => setFormValues((current) => ({ ...current, hoursWorked: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="Leave blank to calculate from clock times" />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-gray-900">Clock in</span>
                      <input type="datetime-local" value={formValues.clockIn} onChange={(event) => setFormValues((current) => ({ ...current, clockIn: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-gray-900">Clock out</span>
                      <input type="datetime-local" value={formValues.clockOut} onChange={(event) => setFormValues((current) => ({ ...current, clockOut: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                    </label>
                  </>
                ) : null}

                {selectedCrewMember?.payType === 'piece_rate' ? (
                  <>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-gray-900">Piece-rate unit</span>
                      <select value={formValues.pieceRateType} onChange={(event) => setFormValues((current) => ({ ...current, pieceRateType: event.target.value as LaborEntryFormValues['pieceRateType'] }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                        <option value="">Choose a unit</option>
                        {laborPieceRateTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-gray-900">Quantity</span>
                      <input type="number" min="0" step="0.01" value={formValues.pieceRateQuantity} onChange={(event) => setFormValues((current) => ({ ...current, pieceRateQuantity: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-gray-900">Rate per unit</span>
                      <input type="number" min="0" step="0.0001" value={formValues.pieceRatePerUnit} onChange={(event) => setFormValues((current) => ({ ...current, pieceRatePerUnit: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                    </label>
                  </>
                ) : null}

                {selectedCrewMember?.payType === 'salary' ? (
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-gray-900">Gross pay</span>
                    <input type="number" min="0" step="0.01" value={formValues.grossPay} onChange={(event) => setFormValues((current) => ({ ...current, grossPay: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
                  </label>
                ) : null}

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-gray-900">Notes</span>
                  <textarea rows={4} value={formValues.notes} onChange={(event) => setFormValues((current) => ({ ...current, notes: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="Crew details, orchard notes, or payroll context." />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ranch-border px-6 py-4">
                <div className="text-sm text-gray-500">
                  {editingEntryId
                    ? 'Editing an approved entry will clear its approval and send it back through payroll review.'
                    : selectedRanch
                      ? 'Choose a block in this ranch to keep the new record inside the current scope.'
                      : 'Create the next real labor record for this organization.'}
                </div>
                <div className="flex gap-3">
                  {editingEntryId ? (
                    <button type="button" onClick={resetForm} className="rounded-lg border border-ranch-border px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                      Cancel
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void handleSubmit()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : editingEntryId ? 'Update labor entry' : 'Create labor entry'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Labor snapshot</h2>
                  <p className="mt-1 text-sm text-gray-500">The selected crew member drives the compensation workflow.</p>
                </div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-700">
                  <Users className="h-6 w-6" />
                </div>
              </div>

              {selectedCrewMember ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Selected crew member</p>
                    <p className="mt-2 text-xl font-bold text-gray-900">{selectedCrewMember.fullName}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                      <span>{formatCrewPayType(selectedCrewMember.payType)}</span>
                      {selectedCrewMember.hourlyRate ? <span>{formatCurrency(selectedCrewMember.hourlyRate)} / hour</span> : null}
                      {selectedCrewMember.position ? <span>{selectedCrewMember.position}</span> : null}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Estimated hours</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">{formatHours(estimatedHours)}</p>
                    </div>
                    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Estimated gross pay</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(estimatedGrossPay)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-gray-600">Choose a crew member to start logging work.</p>
              )}
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Payroll review</h2>
                  <p className="mt-1 text-sm text-gray-500">Review pending labor in the current scope and move approved work into the export-ready pay period.</p>
                </div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <ShieldAlert className="h-6 w-6" />
                </div>
              </div>

              {selectedReviewCrew ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-ranch-border bg-amber-50/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Selected payroll lane</p>
                        <p className="mt-2 text-xl font-bold text-gray-900">{selectedReviewCrew.crewMemberName}</p>
                      </div>
                      <div className="text-right text-sm text-gray-600">
                        <p>{formatCrewPayType(selectedReviewCrew.payType)}</p>
                        {selectedReviewCrew.lastWorkDate ? <p>{formatLaborDate(selectedReviewCrew.lastWorkDate)}</p> : null}
                        {!selectedRanch && selectedReviewCrew.ranchIds.length === 1 ? (
                          <p>{formatScopedRanchLabel(selectedReviewCrew.ranchIds[0], ranchNameById)}</p>
                        ) : null}
                        {!selectedRanch && selectedReviewCrew.ranchIds.length > 1 ? (
                          <p>{selectedReviewCrew.ranchIds.length} ranches</p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Pending gross pay</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(selectedReviewCrew.pendingGrossPay)}</p>
                      <p className="mt-1 text-sm text-gray-500">{selectedReviewCrew.pendingEntries} entries still pending</p>
                    </div>
                    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Approved gross pay</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(selectedReviewCrew.approvedGrossPay)}</p>
                      <p className="mt-1 text-sm text-gray-500">{selectedReviewCrew.approvedEntries} entries approved</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-gray-600">
                  {selectedRanch ? 'Payroll rollups will appear after this ranch has logged labor.' : 'Payroll rollups will appear after labor entries are logged.'}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">Approved payroll export</h2>
                    <p className="mt-1 text-sm text-gray-500">Approved labor only, grouped by crew and ready for a clean CSV handoff.</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Start</span>
                      <input
                        type="date"
                        value={payPeriodStart}
                        onChange={(event) => setPayPeriodStart(event.target.value)}
                        className="w-full rounded-lg border border-ranch-border px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">End</span>
                      <input
                        type="date"
                        value={payPeriodEnd}
                        onChange={(event) => setPayPeriodEnd(event.target.value)}
                        className="w-full rounded-lg border border-ranch-border px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-sm text-gray-600">
                    <p>
                      Reviewing approved labor from {formatLaborDate(payPeriod.startDate)} through {formatLaborDate(payPeriod.endDate)}.
                    </p>
                    <p className="mt-1">This stays inside the current labor approval flow and avoids payroll tax logic.</p>
                    {selectedRanch ? (
                      <p className="mt-1 text-amber-700">
                        Ranch scope applies to the live review panels above. Approved pay-period export remains org-wide for a clean downstream handoff.
                      </p>
                    ) : null}
                  </div>
                  {payPeriodRangeInvalid ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                      Start date must be on or before end date.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <a
                        href={payPeriodExportHref}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                      >
                        <FileDown className="h-4 w-4" />
                        Export CSV
                      </a>
                      <a
                        href={payPeriodExportXlsxHref}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-ranch-border bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <FileDown className="h-4 w-4" />
                        Export XLSX
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleCopyPayrollHandoff()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-ranch-border bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <ClipboardPenLine className="h-4 w-4" />
                        Copy handoff summary
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 xl:grid-cols-4">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Approved entries</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{payPeriod.approvedEntries}</p>
                  </div>
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Approved hours</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{formatHours(payPeriod.totalHours)}</p>
                  </div>
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Approved gross pay</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(payPeriod.totalGrossPay)}</p>
                    <p className="mt-1 text-sm text-gray-500">{payPeriod.approvedCrewMembers} crew lanes included</p>
                  </div>
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Ready crew lanes</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{payPeriod.downstreamReadiness.readyCrewMembers}</p>
                    <p className="mt-1 text-sm text-gray-500">{payPeriod.downstreamReadiness.crewsWithIssues} lanes still need admin cleanup</p>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-4">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Approval activity</p>
                    <div className="mt-3 space-y-2 text-sm text-gray-600">
                      <p>
                        Oldest work:{' '}
                        <span className="font-semibold text-gray-900">
                          {payPeriod.approvalActivity.oldestWorkDate
                            ? formatLaborDate(payPeriod.approvalActivity.oldestWorkDate)
                            : '--'}
                        </span>
                      </p>
                      <p>
                        Latest work:{' '}
                        <span className="font-semibold text-gray-900">
                          {payPeriod.approvalActivity.latestWorkDate
                            ? formatLaborDate(payPeriod.approvalActivity.latestWorkDate)
                            : '--'}
                        </span>
                      </p>
                      <p>
                        Latest approval:{' '}
                        <span className="font-semibold text-gray-900">
                          {formatLaborDateTime(payPeriod.approvalActivity.latestApprovedAt)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">H-2A approved summary</p>
                    <div className="mt-3 space-y-2 text-sm text-gray-600">
                      <p>
                        Crew lanes: <span className="font-semibold text-gray-900">{payPeriod.h2aSummary.crewMembers}</span>
                      </p>
                      <p>
                        Approved entries:{' '}
                        <span className="font-semibold text-gray-900">{payPeriod.h2aSummary.approvedEntries}</span>
                      </p>
                      <p>
                        Approved hours:{' '}
                        <span className="font-semibold text-gray-900">{formatHours(payPeriod.h2aSummary.totalHours)}</span>
                      </p>
                      <p>
                        Approved gross:{' '}
                        <span className="font-semibold text-gray-900">{formatCurrency(payPeriod.h2aSummary.totalGrossPay)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Pay type mix</p>
                    {payPeriod.payTypeBreakdown.length === 0 ? (
                      <p className="mt-3 text-sm text-gray-600">Approved pay type rollups will appear after approvals land.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {payPeriod.payTypeBreakdown.map((rollup) => (
                          <div key={rollup.payType} className="rounded-lg border border-white/80 bg-white px-3 py-3 text-sm text-gray-600 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-gray-900">{formatPayrollPeriodPayType(rollup.payType)}</p>
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                                {rollup.crewMembers} crew
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3">
                              <span>{rollup.approvedEntries} entries</span>
                              <span>{formatHours(rollup.totalHours)}</span>
                              <span>{formatCurrency(rollup.totalGrossPay)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Downstream readiness</p>
                    <div className="mt-3 space-y-2 text-sm text-gray-600">
                      <p>
                        Ready lanes: <span className="font-semibold text-gray-900">{payPeriod.downstreamReadiness.readyCrewMembers}</span>
                      </p>
                      <p>
                        Missing employee IDs:{' '}
                        <span className="font-semibold text-gray-900">{payPeriod.downstreamReadiness.missingEmployeeIdCrewMembers}</span>
                      </p>
                      <p>
                        Missing positions:{' '}
                        <span className="font-semibold text-gray-900">{payPeriod.downstreamReadiness.missingPositionCrewMembers}</span>
                      </p>
                      <p>
                        Missing pay types:{' '}
                        <span className="font-semibold text-gray-900">{payPeriod.downstreamReadiness.missingPayTypeCrewMembers}</span>
                      </p>
                      <p>
                        Ranches represented:{' '}
                        <span className="font-semibold text-gray-900">{payPeriod.downstreamReadiness.ranchesRepresented}</span>
                      </p>
                      <p>
                        Multi-ranch crew:{' '}
                        <span className="font-semibold text-gray-900">{payPeriod.downstreamReadiness.multiRanchCrewMembers}</span>
                      </p>
                      <p>
                        Unlinked approved entries:{' '}
                        <span className="font-semibold text-gray-900">{payPeriod.downstreamReadiness.unlinkedApprovedEntries}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Export blockers</p>
                        <p className="mt-1 text-sm text-gray-600">Crew lanes missing downstream payroll metadata inside this approved period.</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                        {payPeriod.exportBlockers.length} lanes
                      </span>
                    </div>

                    {payPeriod.exportBlockers.length === 0 ? (
                      <p className="mt-4 text-sm text-gray-600">All approved crew lanes have employee ID, pay type, and position populated.</p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {payPeriod.exportBlockers.map((blocker) => (
                          <div key={blocker.crewMemberId} className="rounded-lg border border-white/80 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-gray-900">{blocker.crewMemberName}</p>
                                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                                  {formatPayrollRanchCoverage(blocker.ranchNames)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-gray-900">{formatCurrency(blocker.totalGrossPay)}</p>
                                <p>{blocker.approvedEntries} entries</p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {blocker.issues.map((issue) => (
                                <span key={issue} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                                  {issue}
                                </span>
                              ))}
                              {blocker.h2aWorker ? (
                                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">H-2A</span>
                              ) : null}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
                              <span>{formatHours(blocker.totalHours)}</span>
                              {blocker.lastWorkDate ? <span>Last work {formatLaborDate(blocker.lastWorkDate)}</span> : null}
                              {blocker.lastApprovedAt ? <span>Approved {formatLaborDateTime(blocker.lastApprovedAt)}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Ranch breakdown</p>
                        <p className="mt-1 text-sm text-gray-600">Org-wide approved payroll stays grouped by ranch here even when live review above is ranch-scoped.</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                        {payPeriod.ranchBreakdown.length} rows
                      </span>
                    </div>

                    {payPeriod.ranchBreakdown.length === 0 ? (
                      <p className="mt-4 text-sm text-gray-600">Ranch rollups will appear after approved labor lands in this pay period.</p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {payPeriod.ranchBreakdown.map((rollup, index) => (
                          <div
                            key={`${rollup.ranchId ?? 'unlinked'}-${index}`}
                            className="rounded-lg border border-white/80 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-gray-900">{rollup.ranchName ?? 'Unlinked labor'}</p>
                                <p className="mt-1">{rollup.crewMembers} crew lanes represented</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-gray-900">{formatCurrency(rollup.totalGrossPay)}</p>
                                <p>{formatHours(rollup.totalHours)}</p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
                              <span>{rollup.approvedEntries} entries</span>
                              {rollup.latestWorkDate ? <span>Latest work {formatLaborDate(rollup.latestWorkDate)}</span> : null}
                              {rollup.latestApprovedAt ? <span>Latest approval {formatLaborDateTime(rollup.latestApprovedAt)}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {!selectedRanch && ranches.length > 1 ? (
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Portfolio payroll workbench</p>
                        <p className="mt-1 text-sm text-gray-600">The payroll export stays org-wide, but this shows which ranches are contributing clean lanes versus admin blockers.</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                          {payrollPortfolioReadyRanches}/{ranches.length} ranches clean
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                          {payrollPortfolioRollups.reduce((sum, rollup) => sum + rollup.blockerCrewLanes, 0)} blocked lanes
                        </span>
                      </div>
                    </div>

                    {payrollPortfolioRollups.length === 0 ? (
                      <p className="mt-4 text-sm text-gray-600">Portfolio payroll rollups will appear after approved labor lands in this pay period.</p>
                    ) : (
                      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                        <div className="space-y-3">
                          {payrollPortfolioRollups.map((rollup, index) => (
                            <div
                              key={`${rollup.ranchId ?? 'unlinked'}-${index}`}
                              className="rounded-lg border border-white/80 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-gray-900">{rollup.ranchName}</p>
                                    {rollup.blockerCrewLanes === 0 ? (
                                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Clean lanes</span>
                                    ) : (
                                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                                        {rollup.blockerCrewLanes} blocked lanes
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                                    <span>{rollup.crewMembers} crew lanes</span>
                                    <span>{rollup.approvedEntries} entries</span>
                                    <span>{formatHours(rollup.totalHours)}</span>
                                    {rollup.latestWorkDate ? <span>Latest work {formatLaborDate(rollup.latestWorkDate)}</span> : null}
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                                      Ready {rollup.readyCrewLanes}
                                    </span>
                                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                                      Gross {formatCurrency(rollup.totalGrossPay)}
                                    </span>
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

                                {rollup.ranchId ? (
                                  <button
                                    type="button"
                                    onClick={() => handleScopeChange(rollup.ranchId!)}
                                    className="rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                  >
                                    Open ranch
                                  </button>
                                ) : (
                                  <div className="rounded-lg border border-ranch-border bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-500">
                                    Unlinked labor
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-lg border border-white/80 bg-white px-4 py-4 text-sm text-gray-600 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Portfolio guidance</p>
                            <div className="mt-3 space-y-2">
                              <p>The pay-period export remains one org-wide downstream handoff, but this workbench shows where cleanup is concentrated.</p>
                              <p>Use `Open ranch` to clean approvals and labor metadata in the scoped review lane above, then return here to confirm the ranch contribution is clean.</p>
                              <p>Multi-ranch crew lanes can appear in more than one ranch row because they contribute approved labor across multiple ranches in the same pay period.</p>
                            </div>
                          </div>

                          <div className="rounded-lg border border-white/80 bg-white px-4 py-4 text-sm text-gray-600 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Top ranch blockers</p>
                            <div className="mt-3 space-y-2">
                              {payrollPortfolioRollups.some((rollup) => rollup.blockerReasons.length > 0) ? (
                                payrollPortfolioRollups
                                  .filter((rollup) => rollup.blockerReasons.length > 0)
                                  .slice(0, 5)
                                  .map((rollup) => (
                                    <div key={rollup.ranchId ?? rollup.ranchName} className="rounded-lg border border-ranch-border bg-gray-50 px-3 py-3">
                                      <p className="font-semibold text-gray-900">{rollup.ranchName}</p>
                                      <p className="mt-1">{rollup.blockerReasons.join(', ')}</p>
                                    </div>
                                  ))
                              ) : (
                                <p>All represented ranches are currently contributing clean payroll lanes.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="rounded-xl border border-ranch-border">
                  {payPeriodLoading ? (
                    <div className="px-5 py-6 text-sm text-gray-600">Refreshing approved pay period...</div>
                  ) : payPeriod.crewRollups.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-gray-600">No approved labor entries fall inside this pay period yet.</div>
                  ) : (
                    <div className="divide-y">
                      {payPeriod.crewRollups.map((rollup) => (
                        <div key={rollup.crewMemberId} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-gray-900">{rollup.crewMemberName}</p>
                              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                                {rollup.approvedEntries} approved
                              </span>
                              {rollup.h2aWorker ? (
                                <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                                  H-2A
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-600">
                              <span>{formatCrewPayType(rollup.payType)}</span>
                              {rollup.position ? <span>{rollup.position}</span> : null}
                              {rollup.employeeId ? <span>ID {rollup.employeeId}</span> : null}
                              <span>{formatPayrollRanchCoverage(rollup.ranchNames)}</span>
                              {rollup.lastWorkDate ? <span>Last work {formatLaborDate(rollup.lastWorkDate)}</span> : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600 lg:justify-end">
                            <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700">
                              {formatHours(rollup.totalHours)}
                            </span>
                            <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700">
                              {formatCurrency(rollup.totalGrossPay)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Crew payroll board</h2>
                <p className="mt-1 text-sm text-gray-500">Recent labor grouped by crew for quick review inside the current ranch scope.</p>
              </div>

              <div className="divide-y">
                {scopedCrewPayroll.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-gray-600">
                    {selectedRanch ? 'Crew payroll rollups will populate after this ranch logs labor.' : 'Crew payroll rollups will populate after the first labor entries land.'}
                  </div>
                ) : (
                  scopedCrewPayroll.map((rollup) => {
                    const isSelected = selectedReviewCrew?.crewMemberId === rollup.crewMemberId;

                    return (
                      <button
                        type="button"
                        key={rollup.crewMemberId}
                        onClick={() => setSelectedReviewCrewId(rollup.crewMemberId)}
                        className={`flex w-full flex-col gap-3 px-6 py-4 text-left transition hover:bg-gray-50 ${isSelected ? 'bg-amber-50/60' : 'bg-white'}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{rollup.crewMemberName}</p>
                            <p className="mt-1 text-sm text-gray-600">
                              {formatCrewPayType(rollup.payType)}
                              {rollup.position ? ` - ${rollup.position}` : ''}
                            </p>
                            {!selectedRanch && rollup.ranchIds.length === 1 ? (
                              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                                {formatScopedRanchLabel(rollup.ranchIds[0], ranchNameById)}
                              </p>
                            ) : null}
                            {!selectedRanch && rollup.ranchIds.length > 1 ? (
                              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                                {rollup.ranchIds.length} ranches
                              </p>
                            ) : null}
                          </div>
                          <div className="text-right text-sm text-gray-600">
                            <p>{formatCurrency(rollup.totalGrossPay)}</p>
                            <p>{rollup.totalEntries} entries</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">
                            {rollup.pendingEntries} pending
                          </span>
                          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">
                            {rollup.approvedEntries} approved
                          </span>
                          <span>{formatHours(rollup.totalHours)}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Approval queue</h2>
                <p className="mt-1 text-sm text-gray-500">Oldest unapproved labor entries waiting for payroll review in the current scope.</p>
              </div>

              <div className="divide-y">
                {scopedApprovalQueue.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-gray-600">
                    {selectedRanch ? 'Nothing in this ranch is waiting for approval right now.' : 'Nothing is waiting for approval right now.'}
                  </div>
                ) : (
                  scopedApprovalQueue.map((queueItem) => (
                    <div key={queueItem.laborEntryId} className="space-y-3 px-6 py-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{queueItem.crewMemberName}</p>
                            {queueItem.payType ? (
                              <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                                {formatCrewPayType(queueItem.payType)}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <span>{formatLaborDate(queueItem.workDate)}</span>
                            {queueItem.blockName ? <span>{queueItem.blockName}</span> : null}
                            {queueItem.taskTitle ? <span>{queueItem.taskTitle}</span> : null}
                            {showPortfolioLabels ? <span>{formatScopedRanchLabel(queueItem.ranchId, ranchNameById)}</span> : null}
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <span>{formatHours(queueItem.hoursWorked)}</span>
                            <span>{formatCurrency(queueItem.grossPay)}</span>
                            <span>{formatAgeDays(queueItem.ageDays)}</span>
                          </div>
                          {queueItem.notes ? <p className="text-sm text-gray-700">{queueItem.notes}</p> : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleApprovalToggle(queueItem.laborEntryId, queueItem.crewMemberId, true)}
                          disabled={approvalSavingEntryId === queueItem.laborEntryId}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <BadgeCheck className="h-4 w-4" />
                          {approvalSavingEntryId === queueItem.laborEntryId ? 'Approving...' : 'Approve'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Recent labor entries</h2>
              </div>

              <div className="divide-y">
                {scopedLaborEntries.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-gray-600">
                    {selectedRanch ? 'No labor entries in this ranch yet. Log the first block-linked entry to start review.' : 'No labor entries yet. Use the form to create the first one.'}
                  </div>
                ) : (
                  scopedLaborEntries.slice(0, 16).map((entry) => (
                    <div key={entry.id} className="space-y-3 px-6 py-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-gray-900">{entry.crewMember?.fullName ?? 'Crew member'}</p>
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                entry.approvedAt ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {entry.approvedAt ? 'Approved' : 'Pending approval'}
                            </span>
                            {entry.crewMember?.payType ? <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">{formatCrewPayType(entry.crewMember.payType)}</span> : null}
                            {entry.pieceRateType ? <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{formatPieceRateType(entry.pieceRateType)}</span> : null}
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <span>{formatLaborDate(entry.workDate)}</span>
                            {entry.block ? <span>{entry.block.name}</span> : null}
                            {entry.task ? <span>{entry.task.title}</span> : null}
                            {showPortfolioLabels ? <span>{formatScopedRanchLabel(entry.block?.ranchId ?? null, ranchNameById)}</span> : null}
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <span>{formatHours(entry.hoursWorked)}</span>
                            <span>{formatCurrency(entry.grossPay)}</span>
                            {entry.pieceRateQuantity && entry.pieceRatePerUnit ? <span>{entry.pieceRateQuantity} @ {entry.pieceRatePerUnit}</span> : null}
                          </div>
                          {(entry.clockIn || entry.clockOut) ? (
                            <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                              <span>In {formatLaborDateTime(entry.clockIn)}</span>
                              <span>Out {formatLaborDateTime(entry.clockOut)}</span>
                            </div>
                          ) : null}
                          {entry.approvedAt ? (
                            <div className="flex flex-wrap gap-3 text-sm text-emerald-700">
                              <span>Approved {formatLaborDateTime(entry.approvedAt)}</span>
                              {entry.approvedByProfile ? <span>{entry.approvedByProfile.fullName}</span> : null}
                            </div>
                          ) : null}
                          {entry.notes ? <p className="text-sm text-gray-700">{entry.notes}</p> : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleApprovalToggle(entry.id, entry.crewMemberId, !entry.approvedAt)}
                            disabled={approvalSavingEntryId === entry.id}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                              entry.approvedAt
                                ? 'border border-ranch-border text-gray-700 hover:bg-gray-50'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            <BadgeCheck className="h-4 w-4" />
                            {approvalSavingEntryId === entry.id
                              ? 'Saving...'
                              : entry.approvedAt
                                ? 'Clear approval'
                                : 'Approve'}
                          </button>
                          <button type="button" onClick={() => {
                            setEditingEntryId(entry.id);
                            setFormValues(laborEntryToFormValues(entry));
                            setSelectedReviewCrewId(entry.crewMemberId);
                            setSuccessMessage('');
                            setErrorMessage('');
                          }} className="inline-flex items-center gap-2 rounded-lg border border-ranch-border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                            <ClipboardPenLine className="h-4 w-4" />
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <div className="flex items-start gap-3">
                <TimerReset className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                <div className="space-y-1">
                  <p>
                    Labor logging, approval review, and approved-entry payroll export now run on persisted records. Mobile clock-in and deeper downstream payroll admin still stay intentionally deferred.
                  </p>
                  {scopeVisibilityNote ? <p>{scopeVisibilityNote}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
