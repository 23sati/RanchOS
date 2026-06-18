import * as ExcelJS from 'exceljs';

export type CrewPayType = 'hourly' | 'piece_rate' | 'salary';

export interface ApprovedPayrollExportEntry {
  crewMemberId: string;
  crewMemberName: string;
  employeeId: string | null;
  position: string | null;
  payType: CrewPayType | null;
  h2aWorker: boolean | null;
  ranchId: string | null;
  ranchName: string | null;
  workDate: string;
  hoursWorked: number;
  grossPay: number;
  approvedAt: string | null;
}

interface PayrollLine {
  crewMemberName: string;
  employeeId: string | null;
  totalHours: number;
  regHours: number;
  otHours: number;
  dtHours: number;
  grossPay: number;
}

export interface PayrollPeriodCrewRollup {
  crewMemberId: string;
  crewMemberName: string;
  employeeId: string | null;
  position: string | null;
  payType: CrewPayType | null;
  h2aWorker: boolean | null;
  ranchIds: string[];
  ranchNames: string[];
  approvedEntries: number;
  totalHours: number;
  totalGrossPay: number;
  lastWorkDate: string | null;
  lastApprovedAt: string | null;
}

export interface PayrollPeriodRanchRollup {
  ranchId: string | null;
  ranchName: string | null;
  crewMembers: number;
  approvedEntries: number;
  totalHours: number;
  totalGrossPay: number;
  latestWorkDate: string | null;
  latestApprovedAt: string | null;
}

export interface PayrollPeriodCrewIssue {
  crewMemberId: string;
  crewMemberName: string;
  employeeId: string | null;
  position: string | null;
  payType: CrewPayType | null;
  h2aWorker: boolean | null;
  ranchNames: string[];
  approvedEntries: number;
  totalHours: number;
  totalGrossPay: number;
  issues: string[];
  lastWorkDate: string | null;
  lastApprovedAt: string | null;
}

export interface PayrollPeriodPayTypeRollup {
  payType: CrewPayType | 'unspecified';
  crewMembers: number;
  approvedEntries: number;
  totalHours: number;
  totalGrossPay: number;
}

export interface PayrollPeriodFlagSummary {
  crewMembers: number;
  approvedEntries: number;
  totalHours: number;
  totalGrossPay: number;
}

export interface PayrollPeriodSummary {
  startDate: string;
  endDate: string;
  approvedEntries: number;
  approvedCrewMembers: number;
  totalHours: number;
  totalGrossPay: number;
  payTypeBreakdown: PayrollPeriodPayTypeRollup[];
  h2aSummary: PayrollPeriodFlagSummary;
  approvalActivity: {
    oldestWorkDate: string | null;
    latestWorkDate: string | null;
    latestApprovedAt: string | null;
  };
  downstreamReadiness: {
    readyCrewMembers: number;
    crewsWithIssues: number;
    missingEmployeeIdCrewMembers: number;
    missingPositionCrewMembers: number;
    missingPayTypeCrewMembers: number;
    ranchesRepresented: number;
    multiRanchCrewMembers: number;
    unlinkedApprovedEntries: number;
  };
  ranchBreakdown: PayrollPeriodRanchRollup[];
  exportBlockers: PayrollPeriodCrewIssue[];
  crewRollups: PayrollPeriodCrewRollup[];
}

function roundNumber(value: number, scale = 2) {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

function escapeCsv(value: string | number | boolean | null | undefined) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  const escapedValue = stringValue.replace(/"/g, '""');
  return /[",\n]/.test(escapedValue) ? `"${escapedValue}"` : escapedValue;
}

function isBlank(value: string | null | undefined) {
  return !value || !value.trim();
}

export function buildPayrollPeriodSummary(
  startDate: string,
  endDate: string,
  records: ApprovedPayrollExportEntry[],
): PayrollPeriodSummary {
  const rollups = records.reduce(
    (map, record) => {
      const existing = map.get(record.crewMemberId) ?? {
        crewMemberId: record.crewMemberId,
        crewMemberName: record.crewMemberName,
        employeeId: record.employeeId,
        position: record.position,
        payType: record.payType,
        h2aWorker: record.h2aWorker,
        ranchIds: new Set<string>(),
        ranchNames: new Set<string>(),
        approvedEntries: 0,
        totalHours: 0,
        totalGrossPay: 0,
        lastWorkDate: null as string | null,
        lastApprovedAt: null as string | null,
      };

      existing.approvedEntries += 1;
      existing.totalHours += record.hoursWorked;
      existing.totalGrossPay += record.grossPay;

      if (!existing.lastWorkDate || record.workDate > existing.lastWorkDate) {
        existing.lastWorkDate = record.workDate;
      }

      if (!existing.lastApprovedAt || (record.approvedAt && record.approvedAt > existing.lastApprovedAt)) {
        existing.lastApprovedAt = record.approvedAt;
      }

      if (record.ranchId) {
        existing.ranchIds.add(record.ranchId);
      }

      if (record.ranchName) {
        existing.ranchNames.add(record.ranchName);
      }

      map.set(record.crewMemberId, existing);
      return map;
    },
    new Map<
      string,
      {
        crewMemberId: string;
        crewMemberName: string;
        employeeId: string | null;
        position: string | null;
        payType: CrewPayType | null;
        h2aWorker: boolean | null;
        ranchIds: Set<string>;
        ranchNames: Set<string>;
        approvedEntries: number;
        totalHours: number;
        totalGrossPay: number;
        lastWorkDate: string | null;
        lastApprovedAt: string | null;
      }
    >(),
  );

  const crewRollups = Array.from(rollups.values())
    .map((rollup) => ({
      ...rollup,
      ranchIds: Array.from(rollup.ranchIds),
      ranchNames: Array.from(rollup.ranchNames).sort((left, right) => left.localeCompare(right)),
      totalHours: roundNumber(rollup.totalHours, 2),
      totalGrossPay: roundNumber(rollup.totalGrossPay, 2),
    }))
    .sort((left, right) => {
      if (right.totalGrossPay !== left.totalGrossPay) {
        return right.totalGrossPay - left.totalGrossPay;
      }

      if (right.totalHours !== left.totalHours) {
        return right.totalHours - left.totalHours;
      }

      return left.crewMemberName.localeCompare(right.crewMemberName);
    });

  const payTypeBreakdownMap = records.reduce(
    (map, record) => {
      const payType = record.payType ?? 'unspecified';
      const existing = map.get(payType) ?? {
        payType,
        crewMemberIds: new Set<string>(),
        approvedEntries: 0,
        totalHours: 0,
        totalGrossPay: 0,
      };

      existing.crewMemberIds.add(record.crewMemberId);
      existing.approvedEntries += 1;
      existing.totalHours += record.hoursWorked;
      existing.totalGrossPay += record.grossPay;

      map.set(payType, existing);
      return map;
    },
    new Map<
      CrewPayType | 'unspecified',
      {
        payType: CrewPayType | 'unspecified';
        crewMemberIds: Set<string>;
        approvedEntries: number;
        totalHours: number;
        totalGrossPay: number;
      }
    >(),
  );

  const payTypeBreakdown = Array.from(payTypeBreakdownMap.values())
    .map((rollup) => ({
      payType: rollup.payType,
      crewMembers: rollup.crewMemberIds.size,
      approvedEntries: rollup.approvedEntries,
      totalHours: roundNumber(rollup.totalHours, 2),
      totalGrossPay: roundNumber(rollup.totalGrossPay, 2),
    }))
    .sort((left, right) => {
      if (right.totalGrossPay !== left.totalGrossPay) {
        return right.totalGrossPay - left.totalGrossPay;
      }

      return left.payType.localeCompare(right.payType);
    });

  const ranchBreakdownMap = records.reduce(
    (map, record) => {
      const ranchKey = record.ranchId ?? 'unlinked';
      const existing = map.get(ranchKey) ?? {
        ranchId: record.ranchId,
        ranchName: record.ranchName ?? (record.ranchId ? 'Unknown ranch' : 'Unlinked labor'),
        crewMemberIds: new Set<string>(),
        approvedEntries: 0,
        totalHours: 0,
        totalGrossPay: 0,
        latestWorkDate: null as string | null,
        latestApprovedAt: null as string | null,
      };

      existing.crewMemberIds.add(record.crewMemberId);
      existing.approvedEntries += 1;
      existing.totalHours += record.hoursWorked;
      existing.totalGrossPay += record.grossPay;

      if (!existing.latestWorkDate || record.workDate > existing.latestWorkDate) {
        existing.latestWorkDate = record.workDate;
      }

      if (!existing.latestApprovedAt || (record.approvedAt && record.approvedAt > existing.latestApprovedAt)) {
        existing.latestApprovedAt = record.approvedAt;
      }

      map.set(ranchKey, existing);
      return map;
    },
    new Map<
      string,
      {
        ranchId: string | null;
        ranchName: string | null;
        crewMemberIds: Set<string>;
        approvedEntries: number;
        totalHours: number;
        totalGrossPay: number;
        latestWorkDate: string | null;
        latestApprovedAt: string | null;
      }
    >(),
  );

  const ranchBreakdown = Array.from(ranchBreakdownMap.values())
    .map((rollup) => ({
      ranchId: rollup.ranchId,
      ranchName: rollup.ranchName,
      crewMembers: rollup.crewMemberIds.size,
      approvedEntries: rollup.approvedEntries,
      totalHours: roundNumber(rollup.totalHours, 2),
      totalGrossPay: roundNumber(rollup.totalGrossPay, 2),
      latestWorkDate: rollup.latestWorkDate,
      latestApprovedAt: rollup.latestApprovedAt,
    }))
    .sort((left, right) => {
      if (right.totalGrossPay !== left.totalGrossPay) {
        return right.totalGrossPay - left.totalGrossPay;
      }

      if (right.totalHours !== left.totalHours) {
        return right.totalHours - left.totalHours;
      }

      return (left.ranchName ?? '').localeCompare(right.ranchName ?? '');
    });

  const exportBlockers = crewRollups
    .map((rollup) => {
      const issues = [];

      if (isBlank(rollup.employeeId)) {
        issues.push('Missing employee ID');
      }

      if (isBlank(rollup.position)) {
        issues.push('Missing position');
      }

      if (!rollup.payType) {
        issues.push('Missing pay type');
      }

      return {
        crewMemberId: rollup.crewMemberId,
        crewMemberName: rollup.crewMemberName,
        employeeId: rollup.employeeId,
        position: rollup.position,
        payType: rollup.payType,
        h2aWorker: rollup.h2aWorker,
        ranchNames: rollup.ranchNames,
        approvedEntries: rollup.approvedEntries,
        totalHours: rollup.totalHours,
        totalGrossPay: rollup.totalGrossPay,
        issues,
        lastWorkDate: rollup.lastWorkDate,
        lastApprovedAt: rollup.lastApprovedAt,
      };
    })
    .filter((rollup) => rollup.issues.length > 0)
    .sort((left, right) => {
      if (right.issues.length !== left.issues.length) {
        return right.issues.length - left.issues.length;
      }

      if (right.totalGrossPay !== left.totalGrossPay) {
        return right.totalGrossPay - left.totalGrossPay;
      }

      return left.crewMemberName.localeCompare(right.crewMemberName);
    });

  const h2aCrewIds = new Set(records.filter((record) => Boolean(record.h2aWorker)).map((record) => record.crewMemberId));
  const h2aRecords = records.filter((record) => Boolean(record.h2aWorker));
  const h2aSummary = {
    crewMembers: h2aCrewIds.size,
    approvedEntries: h2aRecords.length,
    totalHours: roundNumber(h2aRecords.reduce((sum, record) => sum + record.hoursWorked, 0), 2),
    totalGrossPay: roundNumber(h2aRecords.reduce((sum, record) => sum + record.grossPay, 0), 2),
  };

  const totals = crewRollups.reduce(
    (summary, rollup) => ({
      approvedEntries: summary.approvedEntries + rollup.approvedEntries,
      totalHours: summary.totalHours + rollup.totalHours,
      totalGrossPay: summary.totalGrossPay + rollup.totalGrossPay,
    }),
    {
      approvedEntries: 0,
      totalHours: 0,
      totalGrossPay: 0,
    },
  );

  return {
    startDate,
    endDate,
    approvedEntries: totals.approvedEntries,
    approvedCrewMembers: crewRollups.length,
    totalHours: roundNumber(totals.totalHours, 2),
    totalGrossPay: roundNumber(totals.totalGrossPay, 2),
    payTypeBreakdown,
    h2aSummary,
    approvalActivity: {
      oldestWorkDate: records.map((record) => record.workDate).sort((left, right) => left.localeCompare(right))[0] ?? null,
      latestWorkDate: records.map((record) => record.workDate).sort((left, right) => right.localeCompare(left))[0] ?? null,
      latestApprovedAt: records
        .map((record) => record.approvedAt)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => right.localeCompare(left))[0] ?? null,
    },
    downstreamReadiness: {
      readyCrewMembers: crewRollups.length - exportBlockers.length,
      crewsWithIssues: exportBlockers.length,
      missingEmployeeIdCrewMembers: crewRollups.filter((rollup) => isBlank(rollup.employeeId)).length,
      missingPositionCrewMembers: crewRollups.filter((rollup) => isBlank(rollup.position)).length,
      missingPayTypeCrewMembers: crewRollups.filter((rollup) => !rollup.payType).length,
      ranchesRepresented: ranchBreakdown.filter((rollup) => rollup.ranchId).length,
      multiRanchCrewMembers: crewRollups.filter((rollup) => rollup.ranchIds.length > 1).length,
      unlinkedApprovedEntries: records.filter((record) => !record.ranchId).length,
    },
    ranchBreakdown,
    exportBlockers,
    crewRollups,
  };
}

export function buildPayrollPeriodCsv(summary: PayrollPeriodSummary) {
  const rows = [
    [
      'Pay Period Start',
      'Pay Period End',
      'Crew Member',
      'Employee ID',
      'Pay Type',
      'Position',
      'H-2A Worker',
      'Approved Entries',
      'Approved Hours',
      'Gross Pay',
      'Last Work Date',
      'Last Approved At',
    ],
    ...summary.crewRollups.map((rollup) => [
      summary.startDate,
      summary.endDate,
      rollup.crewMemberName,
      rollup.employeeId ?? '',
      rollup.payType ?? '',
      rollup.position ?? '',
      rollup.h2aWorker ? 'yes' : 'no',
      rollup.approvedEntries,
      rollup.totalHours.toFixed(2),
      rollup.totalGrossPay.toFixed(2),
      rollup.lastWorkDate ?? '',
      rollup.lastApprovedAt ?? '',
    ]),
    [
      summary.startDate,
      summary.endDate,
      'TOTALS',
      '',
      '',
      '',
      '',
      summary.approvedEntries,
      summary.totalHours.toFixed(2),
      summary.totalGrossPay.toFixed(2),
      '',
      '',
    ],
  ];

  return `${rows.map((row) => row.map((value) => escapeCsv(value)).join(',')).join('\n')}\n`;
}

export async function buildPayrollPeriodWorkbook(summary: PayrollPeriodSummary) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RanchOS';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'Value', key: 'value', width: 24 },
    { header: 'Detail', key: 'detail', width: 48 },
  ];

  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3D7A4F' },
  };

  summarySheet.addRows([
    { metric: 'Pay Period Start', value: summary.startDate, detail: '' },
    { metric: 'Pay Period End', value: summary.endDate, detail: '' },
    { metric: 'Approved Entries', value: summary.approvedEntries, detail: 'Approved labor entries in scope' },
    { metric: 'Approved Crew Members', value: summary.approvedCrewMembers, detail: 'Crew represented in the approved export' },
    { metric: 'Approved Hours', value: summary.totalHours.toFixed(2), detail: 'Total approved hours' },
    { metric: 'Approved Gross Pay', value: summary.totalGrossPay.toFixed(2), detail: 'Total approved gross pay' },
    { metric: 'H-2A Crew Members', value: summary.h2aSummary.crewMembers, detail: 'Approved H-2A lanes in this pay period' },
    { metric: 'H-2A Approved Entries', value: summary.h2aSummary.approvedEntries, detail: 'Approved H-2A labor entries' },
    { metric: 'H-2A Hours', value: summary.h2aSummary.totalHours.toFixed(2), detail: 'Approved H-2A hours' },
    { metric: 'H-2A Gross Pay', value: summary.h2aSummary.totalGrossPay.toFixed(2), detail: 'Approved H-2A gross pay' },
    { metric: 'Oldest Work Date', value: summary.approvalActivity.oldestWorkDate ?? '', detail: 'Oldest approved work date in the export' },
    { metric: 'Latest Work Date', value: summary.approvalActivity.latestWorkDate ?? '', detail: 'Most recent approved work date in the export' },
    { metric: 'Latest Approval At', value: summary.approvalActivity.latestApprovedAt ?? '', detail: 'Most recent approval timestamp in the export' },
    { metric: 'Ready Crew Members', value: summary.downstreamReadiness.readyCrewMembers, detail: 'Crew lanes with downstream payroll fields filled in' },
    { metric: 'Crew With Issues', value: summary.downstreamReadiness.crewsWithIssues, detail: 'Crew lanes missing payroll handoff metadata' },
    { metric: 'Missing Employee IDs', value: summary.downstreamReadiness.missingEmployeeIdCrewMembers, detail: 'Crew lanes still missing an employee identifier' },
    { metric: 'Missing Positions', value: summary.downstreamReadiness.missingPositionCrewMembers, detail: 'Crew lanes still missing a position label' },
    { metric: 'Missing Pay Types', value: summary.downstreamReadiness.missingPayTypeCrewMembers, detail: 'Crew lanes still missing a payroll rate type' },
    { metric: 'Ranches Represented', value: summary.downstreamReadiness.ranchesRepresented, detail: 'Distinct ranches represented in approved payroll' },
    { metric: 'Multi-Ranch Crew', value: summary.downstreamReadiness.multiRanchCrewMembers, detail: 'Crew lanes touching more than one ranch in this period' },
    { metric: 'Unlinked Approved Entries', value: summary.downstreamReadiness.unlinkedApprovedEntries, detail: 'Approved entries without a ranch-linked block' },
  ]);

  summarySheet.addRow({});
  const payTypeHeader = summarySheet.addRow({
    metric: 'Pay Type',
    value: 'Crew Members',
    detail: 'Approved Entries / Hours / Gross Pay',
  });
  payTypeHeader.font = { bold: true };

  for (const rollup of summary.payTypeBreakdown) {
    summarySheet.addRow({
      metric: rollup.payType,
      value: rollup.crewMembers,
      detail: `${rollup.approvedEntries} entries / ${rollup.totalHours.toFixed(2)} hours / ${rollup.totalGrossPay.toFixed(2)} gross pay`,
    });
  }

  const crewSheet = workbook.addWorksheet('Crew Rollups');
  crewSheet.columns = [
    { header: 'Crew Member', key: 'crewMemberName', width: 28 },
    { header: 'Employee ID', key: 'employeeId', width: 16 },
    { header: 'Pay Type', key: 'payType', width: 14 },
    { header: 'Position', key: 'position', width: 18 },
    { header: 'H-2A Worker', key: 'h2aWorker', width: 12 },
    { header: 'Ranches', key: 'ranches', width: 28 },
    { header: 'Approved Entries', key: 'approvedEntries', width: 16 },
    { header: 'Approved Hours', key: 'totalHours', width: 16 },
    { header: 'Approved Gross Pay', key: 'totalGrossPay', width: 18 },
    { header: 'Last Work Date', key: 'lastWorkDate', width: 16 },
    { header: 'Last Approved At', key: 'lastApprovedAt', width: 24 },
  ];

  crewSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  crewSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' },
  };

  summary.crewRollups.forEach((rollup) => {
    crewSheet.addRow({
      crewMemberName: rollup.crewMemberName,
      employeeId: rollup.employeeId ?? '',
      payType: rollup.payType ?? 'unspecified',
      position: rollup.position ?? '',
      h2aWorker: rollup.h2aWorker ? 'yes' : 'no',
      ranches: rollup.ranchNames.join(', '),
      approvedEntries: rollup.approvedEntries,
      totalHours: rollup.totalHours.toFixed(2),
      totalGrossPay: rollup.totalGrossPay.toFixed(2),
      lastWorkDate: rollup.lastWorkDate ?? '',
      lastApprovedAt: rollup.lastApprovedAt ?? '',
    });
  });

  const ranchSheet = workbook.addWorksheet('Ranch Rollups');
  ranchSheet.columns = [
    { header: 'Ranch', key: 'ranchName', width: 26 },
    { header: 'Approved Entries', key: 'approvedEntries', width: 16 },
    { header: 'Crew Members', key: 'crewMembers', width: 16 },
    { header: 'Approved Hours', key: 'totalHours', width: 16 },
    { header: 'Approved Gross Pay', key: 'totalGrossPay', width: 18 },
    { header: 'Latest Work Date', key: 'latestWorkDate', width: 16 },
    { header: 'Latest Approved At', key: 'latestApprovedAt', width: 24 },
  ];

  ranchSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ranchSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' },
  };

  summary.ranchBreakdown.forEach((rollup) => {
    ranchSheet.addRow({
      ranchName: rollup.ranchName ?? 'Unlinked labor',
      approvedEntries: rollup.approvedEntries,
      crewMembers: rollup.crewMembers,
      totalHours: rollup.totalHours.toFixed(2),
      totalGrossPay: rollup.totalGrossPay.toFixed(2),
      latestWorkDate: rollup.latestWorkDate ?? '',
      latestApprovedAt: rollup.latestApprovedAt ?? '',
    });
  });

  const blockersSheet = workbook.addWorksheet('Export Blockers');
  blockersSheet.columns = [
    { header: 'Crew Member', key: 'crewMemberName', width: 28 },
    { header: 'Employee ID', key: 'employeeId', width: 16 },
    { header: 'Pay Type', key: 'payType', width: 14 },
    { header: 'Position', key: 'position', width: 18 },
    { header: 'Ranches', key: 'ranches', width: 28 },
    { header: 'Issues', key: 'issues', width: 34 },
    { header: 'Approved Entries', key: 'approvedEntries', width: 16 },
    { header: 'Approved Hours', key: 'totalHours', width: 16 },
    { header: 'Approved Gross Pay', key: 'totalGrossPay', width: 18 },
    { header: 'Last Work Date', key: 'lastWorkDate', width: 16 },
    { header: 'Last Approved At', key: 'lastApprovedAt', width: 24 },
  ];

  blockersSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  blockersSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFB45309' },
  };

  if (summary.exportBlockers.length === 0) {
    blockersSheet.addRow({
      crewMemberName: 'No downstream blockers',
      issues: 'All crew lanes have employee ID, pay type, and position filled in.',
    });
  } else {
    summary.exportBlockers.forEach((rollup) => {
      blockersSheet.addRow({
        crewMemberName: rollup.crewMemberName,
        employeeId: rollup.employeeId ?? '',
        payType: rollup.payType ?? 'unspecified',
        position: rollup.position ?? '',
        ranches: rollup.ranchNames.join(', '),
        issues: rollup.issues.join(', '),
        approvedEntries: rollup.approvedEntries,
        totalHours: rollup.totalHours.toFixed(2),
        totalGrossPay: rollup.totalGrossPay.toFixed(2),
        lastWorkDate: rollup.lastWorkDate ?? '',
        lastApprovedAt: rollup.lastApprovedAt ?? '',
      });
    });
  }

  return workbook.xlsx.writeBuffer();
}

export function calculateHoursWorked(input: {
  clockIn?: Date | null;
  clockOut?: Date | null;
  hoursWorked?: number | null;
}) {
  if (input.hoursWorked !== null && input.hoursWorked !== undefined) {
    if (!Number.isFinite(input.hoursWorked) || input.hoursWorked < 0) {
      throw new Error('Hours worked must be zero or greater.');
    }

    return roundNumber(input.hoursWorked, 2);
  }

  if (!input.clockIn && !input.clockOut) {
    return null;
  }

  if (!input.clockIn || !input.clockOut) {
    throw new Error('Provide both clock in and clock out, or leave both blank.');
  }

  const durationMs = input.clockOut.getTime() - input.clockIn.getTime();
  if (durationMs < 0) {
    throw new Error('Clock out must be after clock in.');
  }

  return roundNumber(durationMs / (1000 * 60 * 60), 2);
}

export function calculateGrossPay(input: {
  payType: CrewPayType | null;
  hourlyRate?: number | null;
  hoursWorked?: number | null;
  pieceRateQuantity?: number | null;
  pieceRatePerUnit?: number | null;
  grossPayOverride?: number | null;
}) {
  if (input.payType === 'hourly') {
    if (input.hoursWorked === null || input.hoursWorked === undefined) {
      throw new Error('Hourly labor entries need hours worked or clock times.');
    }

    if (input.hourlyRate === null || input.hourlyRate === undefined) {
      throw new Error('Hourly crew members need an hourly rate before logging labor.');
    }

    return roundNumber(input.hoursWorked * input.hourlyRate, 2);
  }

  if (input.payType === 'piece_rate') {
    if (input.pieceRateQuantity === null || input.pieceRateQuantity === undefined) {
      throw new Error('Piece-rate labor entries need a quantity.');
    }

    if (input.pieceRatePerUnit === null || input.pieceRatePerUnit === undefined) {
      throw new Error('Piece-rate labor entries need a rate per unit.');
    }

    return roundNumber(input.pieceRateQuantity * input.pieceRatePerUnit, 2);
  }

  if (input.grossPayOverride === null || input.grossPayOverride === undefined) {
    throw new Error('Salary labor entries need a gross pay amount.');
  }

  if (!Number.isFinite(input.grossPayOverride) || input.grossPayOverride < 0) {
    throw new Error('Gross pay must be zero or greater.');
  }

  return roundNumber(input.grossPayOverride, 2);
}

export async function exportPayrollToExcel(records: PayrollLine[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Weekly Payroll');

  worksheet.columns = [
    { header: 'Employee Name', key: 'crewMemberName', width: 25 },
    { header: 'Employee ID', key: 'employeeId', width: 15 },
    { header: 'Total Hours', key: 'totalHours', width: 12 },
    { header: 'Regular Hours', key: 'regHours', width: 15 },
    { header: 'OT Hours (1.5x)', key: 'otHours', width: 15 },
    { header: 'DT Hours (2.0x)', key: 'dtHours', width: 15 },
    { header: 'Gross Pay ($)', key: 'grossPay', width: 15 },
  ];

  // Formatting headers
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3D7A4F' } // Ranch Leaf Green
  };
  worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

  records.forEach(r => worksheet.addRow(r));

  // Add totals row
  const totalRow = worksheet.addRow({
    crewMemberName: 'TOTALS',
    grossPay: records.reduce((sum, r) => sum + r.grossPay, 0)
  });
  totalRow.font = { bold: true };

  return await workbook.xlsx.writeBuffer();
}
