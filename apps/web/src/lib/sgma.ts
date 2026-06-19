export type SgmaScope = 'workspace' | 'ranch';

export type SgmaReportFilters = {
  scope: SgmaScope;
  ranchId?: string | null;
  startDate: string;
  endDate: string;
};

export type SgmaReportPayload = {
  generatedAt: string;
  scope: SgmaScope;
  scopeLabel: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  summary: {
    ranchesInScope: number;
    activeBlocks: number;
    activeAcres: number;
    configuredBlocks: number;
    linkedStations: number;
    completedEvents: number;
    missingAppliedDataEvents: number;
    blocksMissingStation: number;
    blocksMissingAcreage: number;
    totalAppliedAcreFeet: number | null;
    totalEstimatedCropEtAcreFeet: number | null;
    netAppliedMinusEstimatedEtAcreFeet: number | null;
  };
  assumptions: string[];
  ranches: Array<{
    ranchId: string;
    name: string;
    county: string | null;
    activeBlocks: number;
    activeAcres: number;
    configuredBlocks: number;
    completedEvents: number;
    missingAppliedDataEvents: number;
    totalAppliedAcreFeet: number | null;
    totalEstimatedCropEtAcreFeet: number | null;
    netAppliedMinusEstimatedEtAcreFeet: number | null;
    latestIrrigationDate: string | null;
    latestEtDate: string | null;
  }>;
  blocks: Array<{
    blockId: string;
    ranchId: string;
    ranchName: string;
    ranchCounty: string | null;
    blockName: string;
    cropType: string;
    variety: string;
    acreage: number | null;
    waterDistrict: string | null;
    gsaName: string | null;
    isOrganic: boolean;
    cimisStation: {
      id: number;
      name: string;
      county: string | null;
    } | null;
    completedEvents: number;
    missingAppliedDataEvents: number;
    totalAppliedDepthInches: number | null;
    totalAppliedAcreFeet: number | null;
    estimatedCropEtDepthInches: number | null;
    estimatedCropEtAcreFeet: number | null;
    netAppliedMinusEstimatedEtAcreFeet: number | null;
    latestIrrigationDate: string | null;
    latestEtDate: string | null;
  }>;
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

function formatPacificDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getPacificDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value ?? new Date().getFullYear()),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? 1),
  };
}

function buildQuery(filters: SgmaReportFilters) {
  const params = new URLSearchParams({
    scope: filters.scope,
    start_date: filters.startDate,
    end_date: filters.endDate,
  });

  if (filters.scope === 'ranch' && filters.ranchId) {
    params.set('ranch_id', filters.ranchId);
  }

  return params.toString();
}

export async function fetchSgmaReport(filters: SgmaReportFilters) {
  return request<SgmaReportPayload>(`/api/v1/sgma?${buildQuery(filters)}`, {
    method: 'GET',
  });
}

export function getSgmaReportExportHref(filters: SgmaReportFilters) {
  return `/api/v1/sgma/export/report.csv?${buildQuery(filters)}`;
}

export function getCurrentWaterYearRange(reference = new Date()) {
  const parts = getPacificDateParts(reference);
  const waterYearStartYear = parts.month >= 10 ? parts.year : parts.year - 1;

  return {
    startDate: `${waterYearStartYear}-10-01`,
    endDate: formatPacificDate(reference),
  };
}

export function getRecentDateRange(days: number, reference = new Date()) {
  const endDate = formatPacificDate(reference);
  const start = new Date(reference);
  start.setDate(start.getDate() - Math.max(days - 1, 0));

  return {
    startDate: formatPacificDate(start),
    endDate,
  };
}

export function formatSgmaDate(value: string | null | undefined) {
  if (!value) {
    return 'Not set';
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

export function formatGeneratedAt(value: string | null | undefined) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatAcreFeet(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'Not set';
  }

  return `${value.toFixed(2)} ac-ft`;
}

export function formatDepthInches(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'Not set';
  }

  return `${value.toFixed(2)} in`;
}

export function formatAcreage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'Not set';
  }

  return `${value.toFixed(2)} acres`;
}
