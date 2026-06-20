'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardPenLine,
  ClipboardList,
  Leaf,
  MapPinned,
  TriangleAlert,
} from 'lucide-react';
import { BlockRecord, fetchBlocks, formatBlockCropLabel } from '@/lib/blocks';
import {
  ComplianceDashboardPayload,
  fetchComplianceDashboard,
} from '@/lib/compliance';
import {
  HarvestDashboardPayload,
  fetchHarvestDashboard,
} from '@/lib/harvest';
import {
  defaultLaborPayrollPeriodRange,
  fetchLaborPayrollPeriod,
  formatCurrency,
  LaborPayrollPeriodPayload,
} from '@/lib/labor';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { calculateRanchCoverage, fetchRanches, RanchRecord } from '@/lib/ranches';
import { TaskRecord, fetchTasks, formatTaskDueDate, formatTaskStatusLabel } from '@/lib/tasks';

type TaskSummary = {
  open: number;
  inProgress: number;
  overdue: number;
  dueToday: number;
  completed: number;
  total: number;
};

type RanchPortfolioSummary = {
  ranch: RanchRecord;
  blocks: BlockRecord[];
  tasks: TaskRecord[];
  mappedAcres: number;
  organicBlocks: number;
  coverage: ReturnType<typeof calculateRanchCoverage>;
};

const ALL_RANCHES_VALUE = 'all';
const defaultPayrollPeriod = defaultLaborPayrollPeriodRange();

const emptyComplianceDashboard: ComplianceDashboardPayload = {
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
    certifierName: '',
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

const emptyHarvestDashboard: HarvestDashboardPayload = {
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

const emptyLaborPayrollPeriod: LaborPayrollPeriodPayload = {
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

type OverviewAdminRollup = {
  ranchId: string;
  ranchName: string;
  complianceBlockers: number;
  complianceReasons: string[];
  harvestBlockers: number;
  harvestReasons: string[];
  payrollBlockers: number;
  payrollReasons: string[];
  totalPressure: number;
  payrollGross: number;
};

function emptyTaskSummary(): TaskSummary {
  return {
    open: 0,
    inProgress: 0,
    overdue: 0,
    dueToday: 0,
    completed: 0,
    total: 0,
  };
}

function statusTone(status: TaskRecord['effectiveStatus']) {
  if (status === 'completed') {
    return 'bg-emerald-100 text-emerald-800';
  }

  if (status === 'in_progress') {
    return 'bg-sky-100 text-sky-800';
  }

  if (status === 'overdue') {
    return 'bg-red-100 text-red-800';
  }

  return 'bg-amber-100 text-amber-800';
}

function getPriorityTaskOrder(task: TaskRecord) {
  if (task.effectiveStatus === 'overdue') return 0;
  if (task.effectiveStatus === 'in_progress') return 1;
  if (task.effectiveStatus === 'pending') return 2;
  return 3;
}

function getTodayInPacific() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildTaskSummary(tasks: TaskRecord[]) {
  const today = getTodayInPacific();
  const summary = emptyTaskSummary();

  for (const task of tasks) {
    summary.total += 1;

    if (task.effectiveStatus === 'pending') {
      summary.open += 1;
    } else if (task.effectiveStatus === 'in_progress') {
      summary.inProgress += 1;
    } else if (task.effectiveStatus === 'overdue') {
      summary.overdue += 1;
    } else if (task.effectiveStatus === 'completed') {
      summary.completed += 1;
    }

    if (task.status !== 'completed' && task.dueDate === today) {
      summary.dueToday += 1;
    }
  }

  return summary;
}

function normalizeTicketKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function buildOverviewAdminHandoffSummary(rows: OverviewAdminRollup[], payPeriod: LaborPayrollPeriodPayload) {
  return [
    `Overview admin handoff`,
    `Payroll range: ${payPeriod.startDate} to ${payPeriod.endDate}`,
    ...(
      rows.length === 0
        ? ['- No ranch admin pressure available.']
        : rows.map((row) => {
            const parts = [
              `compliance ${row.complianceBlockers}`,
              `harvest ${row.harvestBlockers}`,
              `payroll ${row.payrollBlockers}`,
            ];
            const reasons = [...row.complianceReasons, ...row.harvestReasons, ...row.payrollReasons];
            const reasonText = reasons.length > 0 ? ` | ${Array.from(new Set(reasons)).join(', ')}` : '';
            return `- ${row.ranchName}: ${parts.join(' / ')} blockers | payroll gross ${formatCurrency(row.payrollGross)}${reasonText}`;
          })
    ),
  ].join('\n');
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = icon;

  return (
    <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">{value}</h2>
          <p className="mt-1 text-sm text-gray-500">{detail}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50">
          <Icon className="h-6 w-6 text-gray-700" />
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [complianceDashboard, setComplianceDashboard] = useState<ComplianceDashboardPayload>(emptyComplianceDashboard);
  const [harvestDashboard, setHarvestDashboard] = useState<HarvestDashboardPayload>(emptyHarvestDashboard);
  const [laborPayPeriod, setLaborPayPeriod] = useState<LaborPayrollPeriodPayload>(emptyLaborPayrollPeriod);
  const [selectedRanchId, setSelectedRanchId] = useState<string>(ALL_RANCHES_VALUE);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const onboardingStatus = await fetchOnboardingStatus();
        const [ranchRows, blockRows, taskRows] = await Promise.all([
          fetchRanches(),
          fetchBlocks(),
          fetchTasks(),
        ]);
        const adminResults = await Promise.allSettled([
          fetchComplianceDashboard(),
          fetchHarvestDashboard(),
          fetchLaborPayrollPeriod(defaultPayrollPeriod.startDate, defaultPayrollPeriod.endDate),
        ]);

        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);
        setRanches(ranchRows);
        setBlocks(blockRows);
        setTasks(taskRows);
        if (adminResults[0].status === 'fulfilled') {
          setComplianceDashboard(adminResults[0].value);
        }
        if (adminResults[1].status === 'fulfilled') {
          setHarvestDashboard(adminResults[1].value);
        }
        if (adminResults[2].status === 'fulfilled') {
          setLaborPayPeriod(adminResults[2].value);
        }
        setSelectedRanchId(
          ranchRows.length > 1
            ? ALL_RANCHES_VALUE
            : onboardingStatus.ranch?.id ?? ranchRows[0]?.id ?? ALL_RANCHES_VALUE,
        );
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load overview data.');
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

  const ranchSummaries = useMemo<RanchPortfolioSummary[]>(() => {
    return ranches.map((ranch) => {
      const ranchBlocks = blocks.filter((block) => block.ranchId === ranch.id);
      const ranchTasks = tasks.filter((task) => task.blocks.some((block) => block.ranchId === ranch.id));

      return {
        ranch,
        blocks: ranchBlocks,
        tasks: ranchTasks,
        mappedAcres: ranchBlocks.reduce((sum, block) => sum + Number(block.acreage ?? 0), 0),
        organicBlocks: ranchBlocks.filter((block) => block.isOrganic).length,
        coverage: calculateRanchCoverage(ranchBlocks, ranch.boundary),
      };
    });
  }, [blocks, ranches, tasks]);

  const selectedRanchSummary = useMemo(
    () => ranchSummaries.find((summary) => summary.ranch.id === selectedRanchId) ?? null,
    [ranchSummaries, selectedRanchId],
  );

  const filteredBlocks = useMemo(
    () =>
      selectedRanchId === ALL_RANCHES_VALUE
        ? blocks
        : blocks.filter((block) => block.ranchId === selectedRanchId),
    [blocks, selectedRanchId],
  );

  const filteredTasks = useMemo(
    () =>
      selectedRanchId === ALL_RANCHES_VALUE
        ? tasks
        : tasks.filter((task) => task.blocks.some((block) => block.ranchId === selectedRanchId)),
    [selectedRanchId, tasks],
  );

  const taskSummary = useMemo(() => buildTaskSummary(filteredTasks), [filteredTasks]);

  const totalAcres = useMemo(
    () => filteredBlocks.reduce((sum, block) => sum + Number(block.acreage ?? 0), 0),
    [filteredBlocks],
  );

  const organicBlocks = useMemo(
    () => filteredBlocks.filter((block) => block.isOrganic).length,
    [filteredBlocks],
  );

  const coverageSummary = useMemo(() => {
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

  const focusTasks = useMemo(() => {
    return filteredTasks
      .filter((task) => task.effectiveStatus !== 'completed')
      .sort((left, right) => {
        const statusDiff = getPriorityTaskOrder(left) - getPriorityTaskOrder(right);
        if (statusDiff !== 0) {
          return statusDiff;
        }

        return left.dueDate.localeCompare(right.dueDate);
      })
      .slice(0, 5);
  }, [filteredTasks]);

  const recentBlocks = useMemo(
    () =>
      [...filteredBlocks]
        .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''))
        .slice(0, 5),
    [filteredBlocks],
  );

  const cropBreakdown = useMemo(() => {
    return filteredBlocks.reduce<Record<string, number>>((accumulator, block) => {
      accumulator[block.cropType] = (accumulator[block.cropType] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [filteredBlocks]);

  const ranchNameById = useMemo(
    () => new Map(ranches.map((ranch) => [ranch.id, ranch.name])),
    [ranches],
  );

  const selectedScopeLabel = selectedRanchSummary
    ? selectedRanchSummary.ranch.name
    : `${ranches.length} ranch${ranches.length === 1 ? '' : 'es'}`;

  const ranchesWithBoundaries = ranchSummaries.filter(
    (summary) => summary.coverage.boundaryAcres !== null,
  ).length;
  const overviewAdminRollups = useMemo<OverviewAdminRollup[]>(() => {
    return ranches
      .map((ranch) => {
        const complianceApplications = complianceDashboard.applications.filter(
          (record) => record.block?.ranchId === ranch.id && record.recordType === 'pesticide',
        );
        const complianceReasons = [
          complianceApplications.some((record) => !record.verifiedAt) ? 'unverified DPR records' : null,
          complianceApplications.some((record) => !record.applicatorLicense) ? 'missing applicator license' : null,
          complianceApplications.some((record) => !record.epaRegNumber) ? 'missing EPA registration' : null,
        ].filter((value): value is string => Boolean(value));
        const complianceBlockers = complianceApplications.filter(
          (record) => !(record.verifiedAt && record.applicatorLicense && record.epaRegNumber),
        ).length;

        const harvestBlockIds = new Set(harvestDashboard.blocks.filter((block) => block.ranchId === ranch.id).map((block) => block.id));
        const harvestEvents = harvestDashboard.harvestEvents.filter((event) => harvestBlockIds.has(event.blockId));
        const harvestImports = harvestDashboard.handlerTicketImports.filter(
          (record) => record.harvestEvent?.block?.ranchId === ranch.id,
        );
        const matchedImportTicketKeys = new Set(
          harvestImports
            .filter((row) => row.status === 'matched')
            .map((row) => normalizeTicketKey(row.loadTicket))
            .filter(Boolean),
        );
        const discrepancyImports = harvestImports.filter((row) => row.status === 'discrepancy').length;
        const unmatchedImports = harvestImports.filter((row) => row.status === 'unmatched').length;
        const openHarvestTickets = harvestEvents.filter(
          (event) =>
            event.loadTicket &&
            event.handlerTicketReconciled !== true &&
            !matchedImportTicketKeys.has(normalizeTicketKey(event.loadTicket)),
        ).length;
        const missingLoadTickets = harvestEvents.filter((event) => !event.loadTicket).length;
        const harvestBlockers = discrepancyImports + unmatchedImports + openHarvestTickets + missingLoadTickets;
        const harvestReasons = [
          discrepancyImports > 0 ? 'ticket discrepancies' : null,
          unmatchedImports > 0 ? 'unmatched harvest imports' : null,
          openHarvestTickets > 0 ? 'open event tickets' : null,
          missingLoadTickets > 0 ? 'missing load tickets' : null,
        ].filter((value): value is string => Boolean(value));

        const payrollRanchRollup = laborPayPeriod.ranchBreakdown.find((rollup) => rollup.ranchId === ranch.id) ?? null;
        const payrollBlockerLanes = laborPayPeriod.exportBlockers.filter((blocker) => blocker.ranchNames.includes(ranch.name));
        const payrollReasons = Array.from(new Set(payrollBlockerLanes.flatMap((blocker) => blocker.issues))).sort((left, right) =>
          left.localeCompare(right),
        );
        const payrollBlockers = payrollBlockerLanes.length;

        return {
          ranchId: ranch.id,
          ranchName: ranch.name,
          complianceBlockers,
          complianceReasons,
          harvestBlockers,
          harvestReasons,
          payrollBlockers,
          payrollReasons,
          totalPressure: complianceBlockers + harvestBlockers + payrollBlockers,
          payrollGross: payrollRanchRollup?.totalGrossPay ?? 0,
        };
      })
      .sort((left, right) => {
        if (right.totalPressure !== left.totalPressure) {
          return right.totalPressure - left.totalPressure;
        }

        if (right.payrollGross !== left.payrollGross) {
          return right.payrollGross - left.payrollGross;
        }

        return left.ranchName.localeCompare(right.ranchName);
      });
  }, [complianceDashboard.applications, harvestDashboard.blocks, harvestDashboard.harvestEvents, harvestDashboard.handlerTicketImports, laborPayPeriod.exportBlockers, laborPayPeriod.ranchBreakdown, ranches]);
  const filteredAdminRollups = useMemo(
    () => selectedRanchSummary ? overviewAdminRollups.filter((row) => row.ranchId === selectedRanchSummary.ranch.id) : overviewAdminRollups,
    [overviewAdminRollups, selectedRanchSummary],
  );
  const totalCompliancePressure = useMemo(
    () => filteredAdminRollups.reduce((sum, row) => sum + row.complianceBlockers, 0),
    [filteredAdminRollups],
  );
  const totalHarvestPressure = useMemo(
    () => filteredAdminRollups.reduce((sum, row) => sum + row.harvestBlockers, 0),
    [filteredAdminRollups],
  );
  const totalPayrollPressure = useMemo(
    () => filteredAdminRollups.reduce((sum, row) => sum + row.payrollBlockers, 0),
    [filteredAdminRollups],
  );

  const handleCopyAdminHandoff = async () => {
    try {
      await navigator.clipboard.writeText(buildOverviewAdminHandoffSummary(filteredAdminRollups, laborPayPeriod));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to copy admin handoff summary.');
    }
  };

  const setupChecks = [
    {
      label: 'Organization onboarded',
      value: Boolean(status?.organization?.id),
      help: status?.organization?.name ?? 'Not started',
    },
    {
      label: 'Ranches saved',
      value: ranches.length > 0,
      help: `${ranches.length} ranch${ranches.length === 1 ? '' : 'es'} in the workspace`,
    },
    {
      label: 'Ranches with boundaries',
      value: ranchesWithBoundaries > 0,
      help: `${ranchesWithBoundaries} ranch${ranchesWithBoundaries === 1 ? '' : 'es'} ready for coverage checks`,
    },
    {
      label: 'Blocks created',
      value: filteredBlocks.length > 0,
      help: `${filteredBlocks.length} active block${filteredBlocks.length === 1 ? '' : 's'} in scope`,
    },
    {
      label: 'Tasks flowing',
      value: taskSummary.total > 0,
      help: `${taskSummary.total} task${taskSummary.total === 1 ? '' : 's'} in scope`,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8 animate-fade-in">
      <div className="flex flex-col gap-4 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Overview</p>
          <h1 className="text-3xl font-bold text-gray-900">
            {status?.organization?.name ?? 'RanchOS overview'}
          </h1>
          <p className="text-sm text-gray-600">
            {selectedRanchSummary
              ? `${selectedRanchSummary.ranch.name}${selectedRanchSummary.ranch.county ? `, ${selectedRanchSummary.ranch.county} County` : ''} - focused workspace summary`
              : ranches.length > 1
                ? `${ranches.length} ranch portfolio - live workspace summary`
                : status?.ranch
                  ? `${status.ranch.name}${status.ranch.county ? `, ${status.ranch.county} County` : ''} - live workspace summary`
                  : 'Live summary of your current ranch workspace'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/tasks/new"
            className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
          >
            <ClipboardList className="h-4 w-4" />
            New Task
          </Link>
          <Link
            href="/blocks/new"
            className="inline-flex items-center gap-2 rounded-xl border border-ranch-border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Leaf className="h-4 w-4" />
            New Block
          </Link>
        </div>
      </div>

      {ranches.length > 1 ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Ranch scope</h2>
              <p className="mt-1 text-sm text-gray-500">
                Switch between the full portfolio and one ranch at a time.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedRanchId(ALL_RANCHES_VALUE)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  selectedRanchId === ALL_RANCHES_VALUE
                    ? 'bg-green-600 text-white'
                    : 'border border-ranch-border bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                All ranches
              </button>
              {ranches.map((ranch) => (
                <button
                  key={ranch.id}
                  type="button"
                  onClick={() => setSelectedRanchId(ranch.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    selectedRanchId === ranch.id
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

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Ranches In Scope"
          value={loading ? '...' : selectedRanchSummary ? 1 : ranches.length}
          detail={selectedScopeLabel}
          icon={Building2}
        />
        <MetricCard
          label="Mapped Acres"
          value={loading ? '...' : totalAcres.toFixed(2)}
          detail="Across the current scope"
          icon={MapPinned}
        />
        <MetricCard
          label="Open Tasks"
          value={loading ? '...' : taskSummary.open}
          detail={`${taskSummary.inProgress} in progress`}
          icon={ClipboardList}
        />
        <MetricCard
          label="Overdue"
          value={loading ? '...' : taskSummary.overdue}
          detail={`${taskSummary.dueToday} due today`}
          icon={TriangleAlert}
        />
      </div>

      <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-ranch-border bg-gray-50 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              {selectedRanchSummary ? `${selectedRanchSummary.ranch.name} admin handoff` : 'Portfolio admin handoff'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Cross-page export and admin pressure across compliance, harvest, and payroll using the existing persisted workflows.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyAdminHandoff()}
            className="inline-flex items-center gap-2 rounded-xl border border-ranch-border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <ClipboardPenLine className="h-4 w-4" />
            Copy handoff
          </button>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-3">
          <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Compliance pressure</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{totalCompliancePressure}</p>
            <p className="mt-1 text-sm text-gray-500">DPR-ready blockers across the current scope</p>
          </div>
          <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Harvest pressure</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{totalHarvestPressure}</p>
            <p className="mt-1 text-sm text-gray-500">Open reconciliation items and missing load tickets</p>
          </div>
          <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Payroll pressure</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{totalPayrollPressure}</p>
            <p className="mt-1 text-sm text-gray-500">Blocked payroll lanes in the current pay period</p>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="space-y-3">
            {filteredAdminRollups.length === 0 ? (
              <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-4 text-sm text-gray-600">
                Admin handoff rows will appear after ranch data starts flowing through compliance, harvest, or payroll.
              </div>
            ) : (
              filteredAdminRollups.map((row) => (
                <div key={row.ranchId} className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{row.ranchName}</p>
                        {row.totalPressure === 0 ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Clean handoff</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                            {row.totalPressure} blockers
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                          Compliance {row.complianceBlockers}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                          Harvest {row.harvestBlockers}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                          Payroll {row.payrollBlockers}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                          Payroll gross {formatCurrency(row.payrollGross)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                        {row.complianceReasons.map((reason) => (
                          <span key={`c-${row.ranchId}-${reason}`} className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">
                            {reason}
                          </span>
                        ))}
                        {row.harvestReasons.map((reason) => (
                          <span key={`h-${row.ranchId}-${reason}`} className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">
                            {reason}
                          </span>
                        ))}
                        {row.payrollReasons.map((reason) => (
                          <span key={`p-${row.ranchId}-${reason}`} className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {!selectedRanchSummary ? (
                        <button
                          type="button"
                          onClick={() => setSelectedRanchId(row.ranchId)}
                          className="rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Focus ranch
                        </button>
                      ) : null}
                      <Link href="/compliance" className="rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                        Compliance
                      </Link>
                      <Link href="/harvest" className="rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                        Harvest
                      </Link>
                      <Link href="/labor" className="rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                        Labor
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-ranch-border bg-gray-50 px-6 py-4">
              <div>
                <h2 className="font-semibold text-gray-900">Task focus</h2>
                <p className="mt-1 text-sm text-gray-500">
                  The next work needing attention across {selectedRanchSummary ? 'this ranch' : 'the full portfolio'}.
                </p>
              </div>
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-800"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="divide-y">
              {loading ? (
                <div className="px-6 py-8 text-sm text-gray-600">Loading tasks...</div>
              ) : focusTasks.length === 0 ? (
                <div className="space-y-3 px-6 py-8 text-sm text-gray-600">
                  <p>No live tasks yet.</p>
                  <Link
                    href="/tasks/new"
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Create first task
                  </Link>
                </div>
              ) : (
                focusTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="block px-6 py-5 transition hover:bg-gray-50"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(task.effectiveStatus)}`}
                          >
                            {formatTaskStatusLabel(task.effectiveStatus)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {task.taskType?.nameEn ?? 'General'} - Due {formatTaskDueDate(task.dueDate)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {task.blocks.length === 0 ? (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                              No blocks assigned
                            </span>
                          ) : (
                            task.blocks.map((block) => (
                              <span
                                key={block.blockId}
                                className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-800"
                              >
                                {block.name}
                                {selectedRanchSummary ? '' : ` - ${ranchNameById.get(block.ranchId) ?? 'Unknown ranch'}`}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {task.assignees.length > 0
                          ? task.assignees.map((assignee) => assignee.fullName).join(', ')
                          : 'Unassigned'}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-ranch-border bg-gray-50 px-6 py-4">
              <div>
                <h2 className="font-semibold text-gray-900">Block inventory</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Current active blocks for {selectedRanchSummary ? 'the selected ranch' : 'all ranches in the workspace'}.
                </p>
              </div>
              <Link
                href="/blocks"
                className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-800"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="divide-y">
              {loading ? (
                <div className="px-6 py-8 text-sm text-gray-600">Loading blocks...</div>
              ) : recentBlocks.length === 0 ? (
                <div className="space-y-3 px-6 py-8 text-sm text-gray-600">
                  <p>No blocks created yet.</p>
                  <Link
                    href="/blocks/new"
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
                  >
                    <Leaf className="h-4 w-4" />
                    Create first block
                  </Link>
                </div>
              ) : (
                recentBlocks.map((block) => (
                  <Link
                    key={block.id}
                    href={`/blocks/${block.id}`}
                    className="block px-6 py-5 transition hover:bg-gray-50"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{block.name}</h3>
                        <p className="mt-1 text-sm text-gray-600">
                          {formatBlockCropLabel(block.cropType)} - {block.variety}
                          {block.acreage ? ` - ${block.acreage} acres` : ''}
                        </p>
                      </div>
                      <div className="text-sm text-gray-500">
                        {selectedRanchSummary
                          ? (block.isOrganic ? 'Organic block' : 'Conventional')
                          : `${ranchNameById.get(block.ranchId) ?? 'Unknown ranch'} - ${block.isOrganic ? 'Organic' : 'Conventional'}`}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900">Workspace health</h2>
            <div className="mt-5 space-y-4">
              {setupChecks.map((check) => (
                <div
                  key={check.label}
                  className="flex items-start gap-3 rounded-xl border border-ranch-border bg-gray-50 px-4 py-3"
                >
                  {check.value ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{check.label}</p>
                    <p className="text-sm text-gray-600">{check.help}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-gray-900">Ranch portfolio</h2>
              <div className="rounded-xl border border-ranch-border bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {coverageSummary.boundaryAcres
                  ? `${(coverageSummary.coveragePct ?? 0).toFixed(1)}% mapped coverage`
                  : 'Add ranch boundaries for coverage'}
              </div>
            </div>

            <div className="mt-5 space-y-4 text-sm text-gray-600">
              {ranchSummaries.length === 0 ? (
                <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                  <p>No ranches saved yet.</p>
                </div>
              ) : (
                ranchSummaries.map((summary) => (
                  <button
                    key={summary.ranch.id}
                    type="button"
                    onClick={() => setSelectedRanchId(summary.ranch.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selectedRanchId === summary.ranch.id
                        ? 'border-green-300 bg-green-50/40'
                        : 'border-ranch-border bg-gray-50 hover:bg-gray-100/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">{summary.ranch.name}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          {summary.ranch.county ? `${summary.ranch.county} County` : 'County not set'}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
                        {summary.blocks.length} block{summary.blocks.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-gray-500">
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="font-semibold text-gray-900">{summary.mappedAcres.toFixed(2)}</p>
                        <p>Mapped acres</p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="font-semibold text-gray-900">
                          {summary.tasks.filter((task) => task.effectiveStatus !== 'completed').length}
                        </p>
                        <p>Active tasks</p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="font-semibold text-gray-900">
                          {summary.coverage.boundaryAcres
                            ? `${(summary.coverage.coveragePct ?? 0).toFixed(0)}%`
                            : 'No boundary'}
                        </p>
                        <p>Coverage</p>
                      </div>
                    </div>
                  </button>
                ))
              )}

              {ranches.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setSelectedRanchId(ALL_RANCHES_VALUE)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedRanchId === ALL_RANCHES_VALUE
                      ? 'border-green-300 bg-green-50/40'
                      : 'border-ranch-border bg-gray-50 hover:bg-gray-100/70'
                  }`}
                >
                  <p className="text-lg font-semibold text-gray-900">All ranches</p>
                  <p className="mt-1 text-sm text-gray-600">
                    View the full operational portfolio in one place.
                  </p>
                </button>
              ) : null}

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Blocks</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{filteredBlocks.length}</p>
                </div>
                <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Organic</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{organicBlocks}</p>
                </div>
              </div>

              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Crop mix</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(cropBreakdown).length > 0 ? (
                    Object.entries(cropBreakdown).map(([cropType, count]) => (
                      <span
                        key={cropType}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm"
                      >
                        {formatBlockCropLabel(cropType)}: {count}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">No blocks yet</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900">Today</h2>
            <div className="mt-5 space-y-3">
              <Link
                href="/tasks"
                className="flex items-center justify-between rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-green-700" />
                  Due today
                </span>
                <span className="font-semibold text-gray-900">{taskSummary.dueToday}</span>
              </Link>
              <Link
                href="/tasks"
                className="flex items-center justify-between rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                <span className="inline-flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-red-700" />
                  Overdue tasks
                </span>
                <span className="font-semibold text-gray-900">{taskSummary.overdue}</span>
              </Link>
              <Link
                href="/settings"
                className="flex items-center justify-between rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                <span className="inline-flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-sky-700" />
                  Ranch mapping settings
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
