export const crewPayTypeOptions = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'piece_rate', label: 'Piece rate' },
  { value: 'salary', label: 'Salary' },
] as const;

export const laborPieceRateTypeOptions = [
  { value: 'bins', label: 'Bins' },
  { value: 'boxes', label: 'Boxes' },
  { value: 'trees', label: 'Trees' },
  { value: 'lbs', label: 'Pounds' },
] as const;

export type CrewPayType = (typeof crewPayTypeOptions)[number]['value'];
export type LaborPieceRateType = (typeof laborPieceRateTypeOptions)[number]['value'];

export type LaborProfileSummary = {
  id: string;
  fullName: string;
  role: string;
  phone: string | null;
};

export type CrewMemberRecord = {
  id: string;
  orgId: string;
  profileId: string | null;
  fullName: string;
  phone: string | null;
  employeeId: string | null;
  hireDate: string | null;
  position: string | null;
  payType: CrewPayType | null;
  hourlyRate: string | null;
  h2aWorker: boolean | null;
  h2aDisclaimerAcknowledged: boolean | null;
  active: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  profile: LaborProfileSummary | null;
};

export type LaborBlockSummary = {
  id: string;
  name: string;
  ranchId: string;
  cropType: string;
  variety: string;
  acreage: string | null;
  active?: boolean | null;
};

export type LaborTaskSummary = {
  id: string;
  title: string;
  status: string;
  dueDate: string;
  ranchIds: string[];
};

export type LaborEntryRecord = {
  id: string;
  orgId: string;
  crewMemberId: string;
  taskId: string | null;
  blockId: string | null;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: string | null;
  clockInGpsLat: string | null;
  clockInGpsLng: string | null;
  clockOutGpsLat: string | null;
  clockOutGpsLng: string | null;
  pieceRateType: LaborPieceRateType | null;
  pieceRateQuantity: string | null;
  pieceRatePerUnit: string | null;
  grossPay: string | null;
  notes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  crewMember: {
    id: string;
    profileId: string | null;
    fullName: string;
    employeeId: string | null;
    position: string | null;
    payType: CrewPayType | null;
    hourlyRate: string | null;
    h2aWorker: boolean | null;
    active: boolean | null;
  } | null;
  block: LaborBlockSummary | null;
  task: LaborTaskSummary | null;
  approvedByProfile: {
    id: string;
    fullName: string;
    role: string;
  } | null;
};

export type LaborCrewPayrollRollupRecord = {
  crewMemberId: string;
  crewMemberName: string;
  employeeId: string | null;
  position: string | null;
  payType: CrewPayType | null;
  active: boolean | null;
  h2aWorker: boolean | null;
  totalEntries: number;
  approvedEntries: number;
  pendingEntries: number;
  totalHours: number;
  approvedHours: number;
  pendingHours: number;
  totalGrossPay: number;
  approvedGrossPay: number;
  pendingGrossPay: number;
  lastWorkDate: string | null;
  lastApprovedAt: string | null;
};

export type LaborApprovalQueueRecord = {
  laborEntryId: string;
  crewMemberId: string;
  crewMemberName: string;
  payType: CrewPayType | null;
  workDate: string;
  blockName: string | null;
  taskTitle: string | null;
  hoursWorked: number;
  grossPay: number;
  pieceRateType: LaborPieceRateType | null;
  pieceRateQuantity: string | null;
  pieceRatePerUnit: string | null;
  notes: string | null;
  createdAt: string | null;
  ageDays: number | null;
};

export type LaborPayrollPeriodCrewRollupRecord = {
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
};

export type LaborPayrollPeriodRanchRollupRecord = {
  ranchId: string | null;
  ranchName: string | null;
  crewMembers: number;
  approvedEntries: number;
  totalHours: number;
  totalGrossPay: number;
  latestWorkDate: string | null;
  latestApprovedAt: string | null;
};

export type LaborPayrollPeriodCrewIssueRecord = {
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
};

export type LaborPayrollPeriodPayTypeRollupRecord = {
  payType: CrewPayType | 'unspecified';
  crewMembers: number;
  approvedEntries: number;
  totalHours: number;
  totalGrossPay: number;
};

export type LaborPayrollPeriodFlagSummaryRecord = {
  crewMembers: number;
  approvedEntries: number;
  totalHours: number;
  totalGrossPay: number;
};

export type LaborPayrollPeriodPayload = {
  startDate: string;
  endDate: string;
  approvedEntries: number;
  approvedCrewMembers: number;
  totalHours: number;
  totalGrossPay: number;
  payTypeBreakdown: LaborPayrollPeriodPayTypeRollupRecord[];
  h2aSummary: LaborPayrollPeriodFlagSummaryRecord;
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
  ranchBreakdown: LaborPayrollPeriodRanchRollupRecord[];
  exportBlockers: LaborPayrollPeriodCrewIssueRecord[];
  crewRollups: LaborPayrollPeriodCrewRollupRecord[];
};

export type LaborDashboardPayload = {
  crewMembers: CrewMemberRecord[];
  laborEntries: LaborEntryRecord[];
  availableProfiles: LaborProfileSummary[];
  blocks: LaborBlockSummary[];
  tasks: LaborTaskSummary[];
  crewPayroll: LaborCrewPayrollRollupRecord[];
  approvalQueue: LaborApprovalQueueRecord[];
  summary: {
    totalCrewMembers: number;
    activeCrewMembers: number;
    h2aWorkers: number;
    laborEntries: number;
    hoursLast7Days: number;
    grossPayLast7Days: number;
    pendingApprovals: number;
    approvedEntries: number;
    pendingHours: number;
    pendingGrossPay: number;
    approvedGrossPay: number;
    approvedGrossPayLast7Days: number;
  };
};

export type CrewMemberFormValues = {
  fullName: string;
  profileId: string;
  phone: string;
  employeeId: string;
  hireDate: string;
  position: string;
  payType: CrewPayType;
  hourlyRate: string;
  h2aWorker: boolean;
  h2aDisclaimerAcknowledged: boolean;
  active: boolean;
};

export type LaborEntryFormValues = {
  crewMemberId: string;
  taskId: string;
  blockId: string;
  workDate: string;
  clockIn: string;
  clockOut: string;
  hoursWorked: string;
  pieceRateType: LaborPieceRateType | '';
  pieceRateQuantity: string;
  pieceRatePerUnit: string;
  grossPay: string;
  notes: string;
};

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
    ...init,
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Request failed.');
  }

  return payload as T;
}

function nullableString(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

function isoToLocalDateTimeInput(value: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateTimeToIso(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Clock time is invalid.');
  }

  return parsed.toISOString();
}

function roundNumber(value: number, scale = 2) {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

export function defaultCrewMemberFormValues(): CrewMemberFormValues {
  return {
    fullName: '',
    profileId: '',
    phone: '',
    employeeId: '',
    hireDate: '',
    position: '',
    payType: 'hourly',
    hourlyRate: '',
    h2aWorker: false,
    h2aDisclaimerAcknowledged: false,
    active: true,
  };
}

export function defaultLaborEntryFormValues(crewMemberId = ''): LaborEntryFormValues {
  return {
    crewMemberId,
    taskId: '',
    blockId: '',
    workDate: new Date().toISOString().slice(0, 10),
    clockIn: '',
    clockOut: '',
    hoursWorked: '',
    pieceRateType: '',
    pieceRateQuantity: '',
    pieceRatePerUnit: '',
    grossPay: '',
    notes: '',
  };
}

export function defaultLaborPayrollPeriodRange(referenceDate = new Date()) {
  const endDate = new Date(referenceDate);
  const startDate = new Date(referenceDate);
  startDate.setDate(startDate.getDate() - 13);

  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
}

export function crewMemberToFormValues(crewMember: CrewMemberRecord): CrewMemberFormValues {
  return {
    fullName: crewMember.fullName,
    profileId: crewMember.profileId ?? '',
    phone: crewMember.phone ?? '',
    employeeId: crewMember.employeeId ?? '',
    hireDate: crewMember.hireDate ?? '',
    position: crewMember.position ?? '',
    payType: crewMember.payType ?? 'hourly',
    hourlyRate: crewMember.hourlyRate ?? '',
    h2aWorker: Boolean(crewMember.h2aWorker),
    h2aDisclaimerAcknowledged: Boolean(crewMember.h2aDisclaimerAcknowledged),
    active: crewMember.active ?? true,
  };
}

export function laborEntryToFormValues(entry: LaborEntryRecord): LaborEntryFormValues {
  return {
    crewMemberId: entry.crewMemberId,
    taskId: entry.taskId ?? '',
    blockId: entry.blockId ?? '',
    workDate: entry.workDate,
    clockIn: isoToLocalDateTimeInput(entry.clockIn),
    clockOut: isoToLocalDateTimeInput(entry.clockOut),
    hoursWorked: entry.hoursWorked ?? '',
    pieceRateType: entry.pieceRateType ?? '',
    pieceRateQuantity: entry.pieceRateQuantity ?? '',
    pieceRatePerUnit: entry.pieceRatePerUnit ?? '',
    grossPay: entry.grossPay ?? '',
    notes: entry.notes ?? '',
  };
}

function buildCrewMemberPayload(values: CrewMemberFormValues) {
  return {
    fullName: values.fullName.trim(),
    profileId: nullableString(values.profileId),
    phone: nullableString(values.phone),
    employeeId: nullableString(values.employeeId),
    hireDate: nullableString(values.hireDate),
    position: nullableString(values.position),
    payType: values.payType,
    hourlyRate: values.payType === 'hourly' ? nullableString(values.hourlyRate) : null,
    h2aWorker: values.h2aWorker,
    h2aDisclaimerAcknowledged: values.h2aWorker ? values.h2aDisclaimerAcknowledged : false,
    active: values.active,
  };
}

function buildLaborEntryPayload(values: LaborEntryFormValues) {
  return {
    crewMemberId: values.crewMemberId,
    taskId: nullableString(values.taskId),
    blockId: nullableString(values.blockId),
    workDate: values.workDate,
    clockIn: localDateTimeToIso(values.clockIn),
    clockOut: localDateTimeToIso(values.clockOut),
    hoursWorked: nullableString(values.hoursWorked),
    pieceRateType: nullableString(values.pieceRateType),
    pieceRateQuantity: nullableString(values.pieceRateQuantity),
    pieceRatePerUnit: nullableString(values.pieceRatePerUnit),
    grossPay: nullableString(values.grossPay),
    notes: nullableString(values.notes),
  };
}

export async function fetchLaborDashboard() {
  return request<LaborDashboardPayload>('/api/v1/labor', {
    method: 'GET',
  });
}

export async function fetchLaborPayrollPeriod(startDate: string, endDate: string) {
  return request<LaborPayrollPeriodPayload>(
    `/api/v1/labor/payroll-period?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    {
      method: 'GET',
    },
  );
}

export async function createCrewMember(values: CrewMemberFormValues) {
  return request<CrewMemberRecord>('/api/v1/labor/crew-members', {
    method: 'POST',
    body: JSON.stringify(buildCrewMemberPayload(values)),
  });
}

export async function updateCrewMember(id: string, values: CrewMemberFormValues) {
  return request<CrewMemberRecord>(`/api/v1/labor/crew-members/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(buildCrewMemberPayload(values)),
  });
}

export async function createLaborEntry(values: LaborEntryFormValues) {
  return request<LaborEntryRecord>('/api/v1/labor/entries', {
    method: 'POST',
    body: JSON.stringify(buildLaborEntryPayload(values)),
  });
}

export async function updateLaborEntry(id: string, values: LaborEntryFormValues) {
  return request<LaborEntryRecord>(`/api/v1/labor/entries/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(buildLaborEntryPayload(values)),
  });
}

export async function setLaborEntryApproval(id: string, approved: boolean) {
  return request<LaborEntryRecord>(`/api/v1/labor/entries/${id}/approval`, {
    method: 'PATCH',
    body: JSON.stringify({ approved }),
  });
}

export function getLaborPayrollExportHref(startDate: string, endDate: string) {
  return `/api/v1/labor/payroll-period/export.csv?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
}

export function getLaborPayrollExportXlsxHref(startDate: string, endDate: string) {
  return `/api/v1/labor/payroll-period/export.xlsx?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
}

export function formatCrewPayType(value: CrewPayType | null) {
  return crewPayTypeOptions.find((option) => option.value === value)?.label ?? 'Unspecified';
}

export function formatPayrollPeriodPayType(value: CrewPayType | 'unspecified') {
  return value === 'unspecified' ? 'Unspecified' : formatCrewPayType(value);
}

export function formatPieceRateType(value: LaborPieceRateType | null) {
  return laborPieceRateTypeOptions.find((option) => option.value === value)?.label ?? 'Units';
}

export function formatCurrency(value: string | number | null) {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatHours(value: string | number | null) {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '--';
  }

  return `${roundNumber(amount, 2).toFixed(2)} h`;
}

export function formatLaborDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatLaborDateTime(value: string | null) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function estimateLaborHours(values: LaborEntryFormValues) {
  if (values.hoursWorked.trim()) {
    const parsed = Number(values.hoursWorked);
    return Number.isFinite(parsed) && parsed >= 0 ? roundNumber(parsed, 2) : null;
  }

  if (!values.clockIn || !values.clockOut) {
    return null;
  }

  const start = new Date(values.clockIn);
  const end = new Date(values.clockOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    return null;
  }

  return roundNumber((end.getTime() - start.getTime()) / (1000 * 60 * 60), 2);
}

export function estimateLaborEntryGrossPay(
  crewMember: Pick<CrewMemberRecord, 'payType' | 'hourlyRate'> | null,
  values: LaborEntryFormValues,
) {
  if (!crewMember?.payType) {
    return null;
  }

  if (crewMember.payType === 'hourly') {
    const hoursWorked = estimateLaborHours(values);
    const hourlyRate = Number(crewMember.hourlyRate ?? '');
    if (hoursWorked === null || !Number.isFinite(hourlyRate)) {
      return null;
    }

    return roundNumber(hoursWorked * hourlyRate, 2);
  }

  if (crewMember.payType === 'piece_rate') {
    const quantity = Number(values.pieceRateQuantity);
    const rate = Number(values.pieceRatePerUnit);
    if (!Number.isFinite(quantity) || !Number.isFinite(rate)) {
      return null;
    }

    return roundNumber(quantity * rate, 2);
  }

  const grossPay = Number(values.grossPay);
  return Number.isFinite(grossPay) ? roundNumber(grossPay, 2) : null;
}
