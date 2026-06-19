export const harvestMethodOptions = [
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'hand', label: 'Hand' },
  { value: 'shake_catch', label: 'Shake and catch' },
] as const;

export const handlerTicketStatusOptions = [
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'matched', label: 'Matched' },
  { value: 'discrepancy', label: 'Discrepancy' },
] as const;

export type HarvestMethod = (typeof harvestMethodOptions)[number]['value'];
export type HandlerTicketStatus = (typeof handlerTicketStatusOptions)[number]['value'];

export type HarvestBlockRecord = {
  id: string;
  name: string;
  ranchId: string;
  cropType: string;
  variety: string;
  acreage: string | null;
  isOrganic: boolean;
};

export type HarvestCrewRecord = {
  id: string;
  fullName: string;
  employeeId: string | null;
  position: string | null;
  active: boolean | null;
};

export type HarvestEventRecord = {
  id: string;
  orgId: string;
  blockId: string;
  blockSeasonId: string | null;
  harvestDate: string;
  harvestMethod: HarvestMethod | null;
  totalPounds: string | null;
  totalBins: number | null;
  binWeightLbs: string | null;
  pickerCount: number | null;
  crewIds: string[] | null;
  hulledWeightLbs: string | null;
  hullSplitPct: string | null;
  brix: string | null;
  acidRatio: string | null;
  handlerName: string | null;
  loadTicket: string | null;
  handlerTicketReconciled: boolean | null;
  notes: string | null;
  createdBy: string;
  createdAt: string | null;
  block: HarvestBlockRecord | null;
  blockSeason: {
    id: string;
    blockId: string;
    seasonYear: number;
    harvestStart: string | null;
    harvestEnd: string | null;
    totalYieldLbs: string | null;
    yieldPerAcre: string | null;
  } | null;
  crewMembers: HarvestCrewRecord[];
  crewCount: number;
  poundsPerAcre: number | null;
};

export type HandlerTicketImportRecord = {
  id: string;
  orgId: string;
  harvestEventId: string | null;
  importDate: string;
  handlerName: string;
  loadTicket: string;
  ticketDate: string | null;
  netPounds: string | null;
  grossPounds: string | null;
  moisturePct: string | null;
  hulledWeightLbs: string | null;
  pricePerPound: string | null;
  grossValue: string | null;
  status: HandlerTicketStatus;
  discrepancyNotes: string | null;
  importedBy: string | null;
  createdAt: string | null;
  harvestEvent: HarvestEventRecord | null;
};

export type HarvestDashboardPayload = {
  blocks: HarvestBlockRecord[];
  crewMembers: HarvestCrewRecord[];
  harvestEvents: HarvestEventRecord[];
  handlerTicketImports: HandlerTicketImportRecord[];
  summary: {
    totalEvents: number;
    totalPounds: number;
    totalBins: number;
    importedTickets: number;
    matchedTickets: number;
    discrepancyTickets: number;
    unmatchedTickets: number;
    unreconciledTickets: number;
  };
};

export type HarvestFormValues = {
  blockId: string;
  harvestDate: string;
  harvestMethod: HarvestMethod;
  totalPounds: string;
  totalBins: string;
  binWeightLbs: string;
  pickerCount: string;
  crewIds: string[];
  hulledWeightLbs: string;
  hullSplitPct: string;
  brix: string;
  acidRatio: string;
  handlerName: string;
  loadTicket: string;
  handlerTicketReconciled: boolean;
  notes: string;
};

export type HandlerTicketFormValues = {
  harvestEventId: string;
  handlerName: string;
  loadTicket: string;
  ticketDate: string;
  netPounds: string;
  grossPounds: string;
  moisturePct: string;
  hulledWeightLbs: string;
  pricePerPound: string;
  grossValue: string;
  status: HandlerTicketStatus;
  discrepancyNotes: string;
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

export function defaultHarvestFormValues(blockId = ''): HarvestFormValues {
  return {
    blockId,
    harvestDate: new Date().toISOString().slice(0, 10),
    harvestMethod: 'mechanical',
    totalPounds: '',
    totalBins: '',
    binWeightLbs: '1000',
    pickerCount: '',
    crewIds: [],
    hulledWeightLbs: '',
    hullSplitPct: '',
    brix: '',
    acidRatio: '',
    handlerName: '',
    loadTicket: '',
    handlerTicketReconciled: false,
    notes: '',
  };
}

export function defaultHandlerTicketFormValues(): HandlerTicketFormValues {
  return {
    harvestEventId: '',
    handlerName: '',
    loadTicket: '',
    ticketDate: new Date().toISOString().slice(0, 10),
    netPounds: '',
    grossPounds: '',
    moisturePct: '',
    hulledWeightLbs: '',
    pricePerPound: '',
    grossValue: '',
    status: 'unmatched',
    discrepancyNotes: '',
  };
}

export function harvestEventToFormValues(event: HarvestEventRecord): HarvestFormValues {
  return {
    blockId: event.blockId,
    harvestDate: event.harvestDate,
    harvestMethod: event.harvestMethod ?? 'mechanical',
    totalPounds: event.totalPounds ?? '',
    totalBins: event.totalBins?.toString() ?? '',
    binWeightLbs: event.binWeightLbs ?? '1000',
    pickerCount: event.pickerCount?.toString() ?? '',
    crewIds: event.crewIds ?? [],
    hulledWeightLbs: event.hulledWeightLbs ?? '',
    hullSplitPct: event.hullSplitPct ?? '',
    brix: event.brix ?? '',
    acidRatio: event.acidRatio ?? '',
    handlerName: event.handlerName ?? '',
    loadTicket: event.loadTicket ?? '',
    handlerTicketReconciled: Boolean(event.handlerTicketReconciled),
    notes: event.notes ?? '',
  };
}

export function handlerTicketImportToFormValues(record: HandlerTicketImportRecord): HandlerTicketFormValues {
  return {
    harvestEventId: record.harvestEventId ?? '',
    handlerName: record.handlerName,
    loadTicket: record.loadTicket,
    ticketDate: record.ticketDate ?? '',
    netPounds: record.netPounds ?? '',
    grossPounds: record.grossPounds ?? '',
    moisturePct: record.moisturePct ?? '',
    hulledWeightLbs: record.hulledWeightLbs ?? '',
    pricePerPound: record.pricePerPound ?? '',
    grossValue: record.grossValue ?? '',
    status: record.status,
    discrepancyNotes: record.discrepancyNotes ?? '',
  };
}

function buildHarvestPayload(values: HarvestFormValues) {
  return {
    blockId: values.blockId,
    harvestDate: values.harvestDate,
    harvestMethod: values.harvestMethod,
    totalPounds: nullableString(values.totalPounds),
    totalBins: nullableString(values.totalBins),
    binWeightLbs: nullableString(values.binWeightLbs),
    pickerCount: nullableString(values.pickerCount),
    crewIds: values.crewIds,
    hulledWeightLbs: nullableString(values.hulledWeightLbs),
    hullSplitPct: nullableString(values.hullSplitPct),
    brix: nullableString(values.brix),
    acidRatio: nullableString(values.acidRatio),
    handlerName: nullableString(values.handlerName),
    loadTicket: nullableString(values.loadTicket),
    handlerTicketReconciled: values.handlerTicketReconciled,
    notes: nullableString(values.notes),
  };
}

function buildHandlerTicketPayload(values: HandlerTicketFormValues) {
  return {
    harvestEventId: nullableString(values.harvestEventId),
    handlerName: values.handlerName.trim(),
    loadTicket: values.loadTicket.trim(),
    ticketDate: nullableString(values.ticketDate),
    netPounds: nullableString(values.netPounds),
    grossPounds: nullableString(values.grossPounds),
    moisturePct: nullableString(values.moisturePct),
    hulledWeightLbs: nullableString(values.hulledWeightLbs),
    pricePerPound: nullableString(values.pricePerPound),
    grossValue: nullableString(values.grossValue),
    status: values.status,
    discrepancyNotes: nullableString(values.discrepancyNotes),
  };
}

export async function fetchHarvestDashboard() {
  return request<HarvestDashboardPayload>('/api/v1/harvest', {
    method: 'GET',
  });
}

export async function createHarvestEvent(values: HarvestFormValues) {
  return request<HarvestEventRecord>('/api/v1/harvest', {
    method: 'POST',
    body: JSON.stringify(buildHarvestPayload(values)),
  });
}

export async function updateHarvestEvent(id: string, values: HarvestFormValues) {
  return request<HarvestEventRecord>(`/api/v1/harvest/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(buildHarvestPayload(values)),
  });
}

export async function createHandlerTicketImport(values: HandlerTicketFormValues) {
  return request<HandlerTicketImportRecord>('/api/v1/harvest/handler-ticket-imports', {
    method: 'POST',
    body: JSON.stringify(buildHandlerTicketPayload(values)),
  });
}

export async function updateHandlerTicketImport(id: string, values: HandlerTicketFormValues) {
  return request<HandlerTicketImportRecord>(`/api/v1/harvest/handler-ticket-imports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(buildHandlerTicketPayload(values)),
  });
}

export function getHarvestExportHref(ranchId?: string) {
  return ranchId
    ? `/api/v1/harvest/export.csv?ranch_id=${encodeURIComponent(ranchId)}`
    : '/api/v1/harvest/export.csv';
}

export function formatHarvestMethod(value: HarvestMethod | null) {
  return harvestMethodOptions.find((option) => option.value === value)?.label ?? 'Unspecified';
}

export function formatHandlerTicketStatus(value: HandlerTicketStatus | null | undefined) {
  return handlerTicketStatusOptions.find((option) => option.value === value)?.label ?? 'Unmatched';
}

export function formatHarvestDate(value: string | null) {
  if (!value) {
    return '--';
  }

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

export function formatHarvestNumber(value: string | number | null, digits = 2) {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(amount);
}

export function formatHarvestCurrency(value: string | number | null) {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}
