export const scoutingRatingOptions = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
  { value: 'action', label: 'Action required' },
] as const;

export const pestCategoryOptions = [
  { value: 'insect', label: 'Insect' },
  { value: 'mite', label: 'Mite' },
  { value: 'disease', label: 'Disease' },
  { value: 'weed', label: 'Weed' },
  { value: 'vertebrate', label: 'Vertebrate' },
  { value: 'beneficial', label: 'Beneficial' },
] as const;

export type ScoutingRating = (typeof scoutingRatingOptions)[number]['value'];
export type PestCategory = (typeof pestCategoryOptions)[number]['value'];

export type ScoutingBlockRecord = {
  id: string;
  name: string;
  ranchId: string;
  cropType: string;
  variety: string;
  acreage: string | null;
  treeCount: number | null;
  isOrganic: boolean;
  active: boolean | null;
};

export type PestSpeciesRecord = {
  id: string;
  nameEn: string;
  nameEs: string;
  nameScientific: string | null;
  category: PestCategory;
  applicableCrops: string[];
  actionThresholdDescription: string | null;
  isAllowedInOrganic: boolean | null;
  ucIpmUrl: string | null;
  isSystem: boolean | null;
};

export type ScoutingLogRecord = {
  id: string;
  orgId: string;
  blockId: string;
  scoutedBy: string;
  scoutedAt: string;
  pestSpeciesId: string | null;
  pestNameCustom: string | null;
  rating: ScoutingRating | null;
  countPerSample: string | null;
  sampleCount: number | null;
  observationNotes: string | null;
  photoUrls: string[] | null;
  gpsLat: string | null;
  gpsLng: string | null;
  createdAt: string | null;
  block: {
    id: string;
    name: string;
    ranchId: string;
    cropType: string;
    variety: string;
    acreage: string | null;
    isOrganic: boolean;
    active: boolean | null;
  } | null;
  scoutedByProfile: {
    id: string;
    fullName: string;
    role: string;
  } | null;
  pestSpecies: PestSpeciesRecord | null;
  pestDisplayName: string;
};

export type ScoutingDashboardPayload = {
  blocks: ScoutingBlockRecord[];
  species: PestSpeciesRecord[];
  logs: ScoutingLogRecord[];
  blockInsights: ScoutingBlockInsightRecord[];
  pestSummaries: ScoutingPestSummaryRecord[];
  followUpQueue: ScoutingFollowUpRecord[];
  summary: {
    totalLogs: number;
    actionRequired: number;
    highPressure: number;
    thisWeek: number;
    blocksNeedingFollowUp: number;
    staleBlocks: number;
  };
};

export type ScoutingBlockInsightRecord = {
  blockId: string;
  blockName: string;
  cropType: string;
  variety: string;
  isOrganic: boolean;
  totalLogs: number;
  recentLogs: number;
  recentHighOrActionLogs: number;
  latestScoutedAt: string | null;
  latestPestName: string | null;
  latestRating: ScoutingRating | null;
  highestRecentRating: ScoutingRating | null;
  needsFollowUp: boolean;
  needsFreshScout: boolean;
  topPests: Array<{
    label: string;
    count: number;
  }>;
};

export type ScoutingPestSummaryRecord = {
  key: string;
  label: string;
  speciesId: string | null;
  category: PestCategory | null;
  totalLogs: number;
  recentLogs: number;
  actionCount: number;
  highCount: number;
  latestScoutedAt: string;
  latestRating: ScoutingRating | null;
  affectedBlocks: number;
};

export type ScoutingFollowUpRecord = {
  logId: string;
  blockId: string;
  blockName: string;
  pestDisplayName: string;
  rating: ScoutingRating | null;
  scoutedAt: string;
  scoutedByName: string | null;
  observationNotes: string | null;
  countPerSample: string | null;
  sampleCount: number | null;
};

export type ScoutingLogFormValues = {
  blockId: string;
  scoutedAt: string;
  pestSpeciesId: string;
  pestNameCustom: string;
  rating: ScoutingRating;
  countPerSample: string;
  sampleCount: string;
  observationNotes: string;
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

function normalizeDateTimeInput(value: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function defaultScoutingLogFormValues(blockId = ''): ScoutingLogFormValues {
  return {
    blockId,
    scoutedAt: normalizeDateTimeInput(new Date().toISOString()),
    pestSpeciesId: '',
    pestNameCustom: '',
    rating: 'moderate',
    countPerSample: '',
    sampleCount: '',
    observationNotes: '',
  };
}

export function scoutingLogToFormValues(log: ScoutingLogRecord): ScoutingLogFormValues {
  return {
    blockId: log.blockId,
    scoutedAt: normalizeDateTimeInput(log.scoutedAt),
    pestSpeciesId: log.pestSpeciesId ?? '',
    pestNameCustom: log.pestNameCustom ?? '',
    rating: log.rating ?? 'moderate',
    countPerSample: log.countPerSample ?? '',
    sampleCount: log.sampleCount?.toString() ?? '',
    observationNotes: log.observationNotes ?? '',
  };
}

export async function fetchScoutingDashboard(ranchId?: string) {
  const query = ranchId ? `?ranch_id=${encodeURIComponent(ranchId)}` : '';
  return request<ScoutingDashboardPayload>(`/api/v1/scouting${query}`, {
    method: 'GET',
  });
}

export async function createScoutingLog(values: ScoutingLogFormValues) {
  return request<ScoutingLogRecord>('/api/v1/scouting/logs', {
    method: 'POST',
    body: JSON.stringify({
      blockId: values.blockId,
      scoutedAt: values.scoutedAt,
      pestSpeciesId: nullableString(values.pestSpeciesId),
      pestNameCustom: nullableString(values.pestNameCustom),
      rating: values.rating,
      countPerSample: nullableString(values.countPerSample),
      sampleCount: nullableString(values.sampleCount),
      observationNotes: nullableString(values.observationNotes),
    }),
  });
}

export async function updateScoutingLog(id: string, values: ScoutingLogFormValues) {
  return request<ScoutingLogRecord>(`/api/v1/scouting/logs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      blockId: values.blockId,
      scoutedAt: values.scoutedAt,
      pestSpeciesId: nullableString(values.pestSpeciesId),
      pestNameCustom: nullableString(values.pestNameCustom),
      rating: values.rating,
      countPerSample: nullableString(values.countPerSample),
      sampleCount: nullableString(values.sampleCount),
      observationNotes: nullableString(values.observationNotes),
    }),
  });
}

export async function deleteScoutingLog(id: string) {
  return request<{ success: true }>(`/api/v1/scouting/logs/${id}`, {
    method: 'DELETE',
  });
}

export function formatScoutingRatingLabel(value: ScoutingRating | null | undefined) {
  return scoutingRatingOptions.find((option) => option.value === value)?.label ?? 'Unrated';
}

export function formatPestCategoryLabel(value: PestCategory | null | undefined) {
  return pestCategoryOptions.find((option) => option.value === value)?.label ?? 'Custom';
}

export function formatScoutedAt(value: string) {
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
