export { subscribeToOrgEvents } from './org-events';

export type DegreeDayDashboardPayload = {
  generatedAt: string;
  ranch: {
    id: string;
    name: string;
  };
  summary: {
    activeBlocks: number;
    configuredBlocks: number;
    trackedModels: number;
    nearingThreshold: number;
    reachedThreshold: number;
    latestObservationDate: string | null;
  };
  blocks: DegreeDayBlockRecord[];
  stationModels: DegreeDayStationModelRecord[];
};

export type DegreeDayBlockRecord = {
  id: string;
  name: string;
  cropType: string;
  variety: string;
  acreage: string | null;
  isOrganic: boolean;
  hasStationConfig: boolean;
  cimisStation: {
    id: number;
    name: string;
    county: string | null;
    isActive: boolean | null;
  } | null;
  modelStatuses: Array<{
    pestModel: string;
    pestLabel: string;
    latestDate: string | null;
    latestCumulativeDd: number | null;
    actionThresholdDd: number;
    progressRatio: number | null;
    sevenDayGain: number | null;
  }>;
};

export type DegreeDayStationModelRecord = {
  key: string;
  pestModel: string;
  pestLabel: string;
  actionThresholdDd: number;
  lowerThresholdF: number;
  upperThresholdF: number;
  biofixMonth: number;
  applicableCrops: string[];
  station: {
    id: number;
    name: string;
    county: string | null;
    isActive: boolean | null;
  } | null;
  trackedBlockIds: string[];
  trackedBlockNames: string[];
  latestDate: string | null;
  latestDailyDd: number | null;
  latestCumulativeDd: number | null;
  sevenDayGain: number | null;
  progressRatio: number | null;
  trend: Array<{
    date: string;
    dailyDd: number | null;
    cumulativeDd: number | null;
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

export async function fetchDegreeDayDashboard(ranchId: string) {
  return request<DegreeDayDashboardPayload>(
    `/api/v1/degree-days?ranch_id=${encodeURIComponent(ranchId)}`,
    {
      method: 'GET',
    },
  );
}

export function formatDegreeDayDate(value: string | null) {
  if (!value) {
    return 'No data yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatShortDegreeDayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDegreeDayValue(value: number | null, digits = 0) {
  if (value === null || value === undefined) {
    return 'No data';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatProgressPercent(value: number | null) {
  if (value === null || value === undefined) {
    return 'No data';
  }

  return `${Math.round(value * 100)}%`;
}
