export const soilTypeOptions = [
  { value: 'sandy', label: 'Sandy' },
  { value: 'sandy_loam', label: 'Sandy loam' },
  { value: 'loam', label: 'Loam' },
  { value: 'clay_loam', label: 'Clay loam' },
  { value: 'clay', label: 'Clay' },
] as const;

export const irrigationEventStatusOptions = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'problem', label: 'Problem' },
] as const;

export type SoilType = (typeof soilTypeOptions)[number]['value'];
export type IrrigationEventStatus = (typeof irrigationEventStatusOptions)[number]['value'];

export type CimisStationRecord = {
  id: number;
  name: string;
  county: string | null;
  lat: string | null;
  lng: string | null;
  isActive: boolean | null;
};

export type BlockIrrigationConfigRecord = {
  id: string;
  blockId: string;
  cimisStationId: number | null;
  soilType: SoilType | null;
  emitterFlowGph: string | null;
  emittersPerTree: number | null;
  treeSpacingFt: string | null;
  rowSpacingFt: string | null;
  deficitTriggerInches: string | null;
  updatedAt: string | null;
  cimisStation: CimisStationRecord | null;
};

export type IrrigationBlockRecord = {
  id: string;
  name: string;
  ranchId: string;
  cropType: string;
  variety: string;
  acreage: string | null;
  treeCount: number | null;
  irrigationType: string | null;
  isOrganic: boolean;
  active: boolean | null;
  config: BlockIrrigationConfigRecord | null;
};

export type IrrigationEventRecord = {
  id: string;
  orgId: string;
  blockId: string;
  blockName: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  plannedRuntimeHours: string;
  plannedFlowRateGpm: string | null;
  actualRuntimeHours: string | null;
  actualFlowRateGpm: string | null;
  waterAppliedAcreInches: string | null;
  status: IrrigationEventStatus;
  etDeficitInches: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type IrrigationDashboardPayload = {
  blocks: IrrigationBlockRecord[];
  stations: CimisStationRecord[];
  events: IrrigationEventRecord[];
  blockInsights: IrrigationBlockInsightRecord[];
  stationSnapshots: IrrigationStationSnapshotRecord[];
  summary: {
    configuredBlocks: number;
    blocksOverTrigger: number;
    forecastCrossings: number;
    staleStations: number;
    missingDataBlocks: number;
  };
};

export type IrrigationBlockInsightRecord = {
  blockId: string;
  latestEtDate: string | null;
  latestEtInches: number | null;
  baselineDate: string;
  currentEtDeficitInches: number | null;
  deficitTriggerInches: number;
  kc: number;
  forecastEtInches: number;
  projectedEtDeficitInches: number | null;
  triggerCrossingDate: string | null;
  hottestForecastDate: string | null;
  hottestForecastTempF: number | null;
  rainChanceMaxPct: number;
  upcomingEvent: {
    id: string;
    scheduledDate: string;
    status: IrrigationEventStatus;
    plannedRuntimeHours: string;
  } | null;
  runtimeRecommendation: {
    recommendedRuntimeHours: number;
    appRateInchesPerHour: number;
    grossWaterNeededInches: number;
    estimatedGallonsPerAcre: number;
  } | null;
  forecastWindow: Array<{
    forecastDate: string;
    etoInches: number | null;
    maxTempF: number | null;
    minTempF: number | null;
    precipitationProbabilityPct: number | null;
  }>;
  pressureStatus:
    | 'unconfigured'
    | 'missing_station'
    | 'missing_et'
    | 'stale_et'
    | 'under_trigger'
    | 'forecast_crossing'
    | 'near_trigger'
    | 'over_trigger';
};

export type IrrigationStationSnapshotRecord = {
  stationId: number;
  stationName: string;
  county: string | null;
  latestEtDate: string | null;
  latestEtInches: number | null;
  threeDayForecastEtInches: number;
  hottestForecastTempF: number | null;
  linkedBlockCount: number;
};

export type IrrigationConfigFormValues = {
  cimisStationId: string;
  soilType: '' | SoilType;
  emitterFlowGph: string;
  emittersPerTree: string;
  treeSpacingFt: string;
  rowSpacingFt: string;
  deficitTriggerInches: string;
};

export type IrrigationEventFormValues = {
  blockId: string;
  scheduledDate: string;
  scheduledStartTime: string;
  plannedRuntimeHours: string;
  plannedFlowRateGpm: string;
  etDeficitInches: string;
  status: IrrigationEventStatus;
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

export function configToFormValues(config: BlockIrrigationConfigRecord | null): IrrigationConfigFormValues {
  return {
    cimisStationId: config?.cimisStationId?.toString() ?? '',
    soilType: config?.soilType ?? '',
    emitterFlowGph: config?.emitterFlowGph ?? '',
    emittersPerTree: config?.emittersPerTree?.toString() ?? '',
    treeSpacingFt: config?.treeSpacingFt ?? '',
    rowSpacingFt: config?.rowSpacingFt ?? '',
    deficitTriggerInches: config?.deficitTriggerInches ?? '1.50',
  };
}

export function defaultEventFormValues(blockId = ''): IrrigationEventFormValues {
  return {
    blockId,
    scheduledDate: '',
    scheduledStartTime: '',
    plannedRuntimeHours: '',
    plannedFlowRateGpm: '',
    etDeficitInches: '',
    status: 'scheduled',
    notes: '',
  };
}

export async function fetchIrrigationDashboard(ranchId?: string) {
  const query = ranchId ? `?ranch_id=${encodeURIComponent(ranchId)}` : '';

  return request<IrrigationDashboardPayload>(`/api/v1/irrigation${query}`, {
    method: 'GET',
  });
}

export async function saveIrrigationConfig(blockId: string, values: IrrigationConfigFormValues) {
  return request<BlockIrrigationConfigRecord>(`/api/v1/irrigation/configs/${blockId}`, {
    method: 'PUT',
    body: JSON.stringify({
      cimisStationId: nullableString(values.cimisStationId),
      soilType: nullableString(values.soilType),
      emitterFlowGph: nullableString(values.emitterFlowGph),
      emittersPerTree: nullableString(values.emittersPerTree),
      treeSpacingFt: nullableString(values.treeSpacingFt),
      rowSpacingFt: nullableString(values.rowSpacingFt),
      deficitTriggerInches: nullableString(values.deficitTriggerInches),
    }),
  });
}

export async function createIrrigationEvent(values: IrrigationEventFormValues) {
  return request<IrrigationEventRecord>('/api/v1/irrigation/events', {
    method: 'POST',
    body: JSON.stringify({
      blockId: values.blockId,
      scheduledDate: values.scheduledDate,
      scheduledStartTime: nullableString(values.scheduledStartTime),
      plannedRuntimeHours: values.plannedRuntimeHours,
      plannedFlowRateGpm: nullableString(values.plannedFlowRateGpm),
      etDeficitInches: nullableString(values.etDeficitInches),
      status: values.status,
      notes: nullableString(values.notes),
    }),
  });
}

export async function updateIrrigationEvent(
  id: string,
  values: Partial<IrrigationEventFormValues> & {
    actualRuntimeHours?: string;
    actualFlowRateGpm?: string;
    waterAppliedAcreInches?: string;
  },
) {
  return request<IrrigationEventRecord>(`/api/v1/irrigation/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      blockId: values.blockId,
      scheduledDate: values.scheduledDate,
      scheduledStartTime: values.scheduledStartTime !== undefined ? nullableString(values.scheduledStartTime) : undefined,
      plannedRuntimeHours: values.plannedRuntimeHours,
      plannedFlowRateGpm: values.plannedFlowRateGpm !== undefined ? nullableString(values.plannedFlowRateGpm) : undefined,
      etDeficitInches: values.etDeficitInches !== undefined ? nullableString(values.etDeficitInches) : undefined,
      status: values.status,
      notes: values.notes !== undefined ? nullableString(values.notes) : undefined,
      actualRuntimeHours:
        values.actualRuntimeHours !== undefined ? nullableString(values.actualRuntimeHours) : undefined,
      actualFlowRateGpm:
        values.actualFlowRateGpm !== undefined ? nullableString(values.actualFlowRateGpm) : undefined,
      waterAppliedAcreInches:
        values.waterAppliedAcreInches !== undefined ? nullableString(values.waterAppliedAcreInches) : undefined,
    }),
  });
}

export function formatSoilTypeLabel(value: string | null | undefined) {
  return soilTypeOptions.find((option) => option.value === value)?.label ?? (value ? value.replace(/_/g, ' ') : 'Not set');
}

export function formatIrrigationStatusLabel(value: IrrigationEventStatus) {
  return irrigationEventStatusOptions.find((option) => option.value === value)?.label ?? value;
}

export function formatIrrigationDate(value: string) {
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

export function formatRuntimeHours(value: string | null | undefined) {
  if (!value) {
    return 'Not set';
  }

  const hours = Number(value);
  if (!Number.isFinite(hours)) {
    return value;
  }

  if (hours >= 1) {
    return `${hours.toFixed(2)} h`;
  }

  return `${Math.round(hours * 60)} min`;
}

export function formatInches(value: number | string | null | undefined, digits = 2) {
  if (value === null || value === undefined || value === '') {
    return 'Not set';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return `${numeric.toFixed(digits)} in`;
}

export function formatTemperatureF(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'Not set';
  }

  return `${Math.round(value)}F`;
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'Not set';
  }

  return `${Math.round(value)}%`;
}

export function formatPressureStatusLabel(value: IrrigationBlockInsightRecord['pressureStatus']) {
  switch (value) {
    case 'unconfigured':
      return 'Needs config';
    case 'missing_station':
      return 'Missing station';
    case 'missing_et':
      return 'Missing ET';
    case 'stale_et':
      return 'ET stale';
    case 'forecast_crossing':
      return 'Forecast crossing';
    case 'near_trigger':
      return 'Near trigger';
    case 'over_trigger':
      return 'Over trigger';
    default:
      return 'Under trigger';
  }
}
