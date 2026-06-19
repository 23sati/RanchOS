export type FrostRiskLevel = 'clear' | 'warning' | 'danger' | 'needs_station' | 'no_forecast';

export type FrostSettings = {
  id: string | null;
  orgId: string;
  enabled: boolean;
  warningTempF: number;
  dangerTempF: number;
  monitorStartHour: number;
  monitorEndHour: number;
  notifyProfiles: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type FrostProfileRecord = {
  id: string;
  fullName: string;
  role: string;
  preferredLocale: string;
  phone: string | null;
  hasPushToken: boolean;
  selectedForAlerts: boolean;
};

export type FrostBlockRecord = {
  id: string;
  name: string;
  cropType: string;
  variety: string;
  acreage: string | null;
  cimisStationId: number | null;
  stationName: string | null;
  stationCounty: string | null;
  riskLevel: FrostRiskLevel;
  forecastDate: string | null;
  forecastMinTempF: number | null;
  forecastMaxTempF: number | null;
  forecastWindSpeedMph: number | null;
  hasActiveAlert: boolean;
  forecastWindow: Array<{
    forecastDate: string;
    minTempF: number | null;
    maxTempF: number | null;
    windSpeedMph: number | null;
  }>;
};

export type FrostRecentAlertRecord = {
  id: string;
  titleEn: string;
  urgency: string | null;
  frostKind: 'forecast' | 'test';
  alertLevel: 'warning' | 'danger' | null;
  blockId: string | null;
  blockName: string | null;
  forecastDate: string | null;
  forecastMinTempF: number | null;
  targetProfileCount: number;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string | null;
};

export type FrostWorkspacePayload = {
  organization: {
    id: string;
    name: string;
    timezone: string;
  };
  settings: FrostSettings;
  summary: {
    totalCitrusBlocks: number;
    linkedBlocks: number;
    forecastCoverageBlocks: number;
    warningBlocks: number;
    dangerBlocks: number;
    activeAlertBlocks: number;
    selectedProfiles: number;
    pushReadyProfiles: number;
    withinMonitorWindow: boolean;
    monitoringTimeZone: string;
  };
  profiles: FrostProfileRecord[];
  blocks: FrostBlockRecord[];
  recentAlerts: FrostRecentAlertRecord[];
};

export type FrostWorkspaceMutationPayload = FrostWorkspacePayload & {
  sync: {
    inserted?: number;
    updated?: number;
    archived?: number;
    deliveryInserted: number;
    deliveryUpdated: number;
    deliveryCanceled: number;
  };
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

export async function fetchFrostWorkspace() {
  return request<FrostWorkspacePayload>('/api/v1/frost', {
    method: 'GET',
  });
}

export async function updateFrostSettings(input: {
  enabled: boolean;
  warningTempF: number;
  dangerTempF: number;
  monitorStartHour: number;
  monitorEndHour: number;
  notifyProfiles: string[];
}) {
  return request<FrostWorkspaceMutationPayload>('/api/v1/frost', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function sendFrostTestAlert() {
  return request<FrostWorkspaceMutationPayload>('/api/v1/frost/test-alert', {
    method: 'POST',
  });
}

export function formatFrostTemperature(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }

  return `${value.toFixed(1)}F`;
}

export function formatFrostDate(value: string | null) {
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
  }).format(date);
}

export function formatFrostDateTime(value: string | null) {
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

export function formatMonitorHour(hour: number) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
  }).format(new Date(2026, 0, 1, hour, 0, 0));
}
