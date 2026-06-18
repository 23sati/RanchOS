export type AgworldFieldMapping = {
  ranchosBlockId: string;
  agworldPaddockId: string;
};

export type AgworldSettings = {
  fieldMappings: AgworldFieldMapping[];
  autoPushSprayRecords: boolean;
  autoPullRecommendations: boolean;
};

export type AgworldSprayPayloadSource = {
  workspaceId: string;
  paddockId: string;
  ranchosRecordId: string;
  appliedDate: string;
  appliedStartTime: string | null;
  appliedEndTime: string | null;
  applicatorName: string;
  applicatorLicense: string | null;
  blockName: string;
  ranchName: string | null;
  productName: string;
  epaRegNumber: string | null;
  acresTreated: string;
  ratePerAcre: string | null;
  rateUnit: string | null;
  totalProductUsed: string | null;
  totalProductUnit: string | null;
  waterVolumeGpa: string | null;
  targetPest: string | null;
  notes: string | null;
  verifiedAt: Date | null;
  reiExpiry: Date | null;
  windSpeedMph: string | null;
  windDirection: string | null;
  tempF: string | null;
  isOrganicBlock: boolean;
  omriConfirmed: boolean | null;
  certifierNotified: boolean | null;
};

export type AgworldSprayPayload = {
  source: string;
  workspaceId: string;
  paddockId: string;
  ranchosRecordId: string;
  sprayDate: string;
  sprayWindow: {
    startTime: string | null;
    endTime: string | null;
  };
  applicator: {
    name: string;
    license: string | null;
  };
  site: {
    ranchName: string | null;
    blockName: string;
    acresTreated: string;
    organicBlock: boolean;
  };
  product: {
    name: string;
    epaRegNumber: string | null;
    ratePerAcre: string | null;
    rateUnit: string | null;
    totalProductUsed: string | null;
    totalProductUnit: string | null;
    waterVolumeGpa: string | null;
  };
  weather: {
    windSpeedMph: string | null;
    windDirection: string | null;
    tempF: string | null;
  };
  targetPest: string | null;
  notes: string | null;
  verification: {
    verifiedAt: string | null;
    reiExpiry: string | null;
    omriConfirmed: boolean;
    certifierNotified: boolean;
  };
};

export type AgworldComparisonStatus = 'matched' | 'mismatch' | 'missing_remote' | 'missing_local';

export type AgworldFieldComparison = {
  path: string;
  label: string;
  status: AgworldComparisonStatus;
  localValue: string | null;
  remoteValue: string | null;
};

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}

export function parseAgworldSettings(value: unknown): AgworldSettings {
  const settings =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const fieldMappings = Array.isArray(settings.field_mappings)
    ? Array.from(
        new Map(
          settings.field_mappings
            .map((entry) => {
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return null;
              }

              const row = entry as Record<string, unknown>;
              const ranchosBlockId = normalizeText(row.ranchos_block_id);
              const agworldPaddockId = normalizeText(row.agworld_paddock_id);
              if (!ranchosBlockId || !agworldPaddockId) {
                return null;
              }

              return {
                ranchosBlockId,
                agworldPaddockId,
              } satisfies AgworldFieldMapping;
            })
            .filter((entry): entry is AgworldFieldMapping => Boolean(entry))
            .map((entry) => [entry.ranchosBlockId, entry] as const),
        ).values(),
      )
    : [];

  return {
    fieldMappings,
    autoPushSprayRecords: normalizeBoolean(settings.auto_push_spray_records, false),
    autoPullRecommendations: normalizeBoolean(settings.auto_pull_recommendations, false),
  };
}

export function serializeAgworldSettings(settings: AgworldSettings) {
  return {
    field_mappings: settings.fieldMappings.map((entry) => ({
      ranchos_block_id: entry.ranchosBlockId,
      agworld_paddock_id: entry.agworldPaddockId,
    })),
    auto_push_spray_records: settings.autoPushSprayRecords,
    auto_pull_recommendations: settings.autoPullRecommendations,
  };
}

export function buildAgworldFieldMappingMap(fieldMappings: AgworldFieldMapping[]) {
  return new Map(fieldMappings.map((entry) => [entry.ranchosBlockId, entry.agworldPaddockId]));
}

export function buildAgworldSprayPayload(source: AgworldSprayPayloadSource): AgworldSprayPayload {
  return {
    source: 'ranchos',
    workspaceId: source.workspaceId,
    paddockId: source.paddockId,
    ranchosRecordId: source.ranchosRecordId,
    sprayDate: source.appliedDate,
    sprayWindow: {
      startTime: source.appliedStartTime,
      endTime: source.appliedEndTime,
    },
    applicator: {
      name: source.applicatorName,
      license: source.applicatorLicense,
    },
    site: {
      ranchName: source.ranchName,
      blockName: source.blockName,
      acresTreated: source.acresTreated,
      organicBlock: source.isOrganicBlock,
    },
    product: {
      name: source.productName,
      epaRegNumber: source.epaRegNumber,
      ratePerAcre: source.ratePerAcre,
      rateUnit: source.rateUnit,
      totalProductUsed: source.totalProductUsed,
      totalProductUnit: source.totalProductUnit,
      waterVolumeGpa: source.waterVolumeGpa,
    },
    weather: {
      windSpeedMph: source.windSpeedMph,
      windDirection: source.windDirection,
      tempF: source.tempF,
    },
    targetPest: source.targetPest,
    notes: source.notes,
    verification: {
      verifiedAt: source.verifiedAt?.toISOString() ?? null,
      reiExpiry: source.reiExpiry?.toISOString() ?? null,
      omriConfirmed: source.omriConfirmed ?? false,
      certifierNotified: source.certifierNotified ?? false,
    },
  };
}

function extractComparableRoot(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (
    row.data &&
    typeof row.data === 'object' &&
    !Array.isArray(row.data) &&
    ('workspaceId' in (row.data as Record<string, unknown>) ||
      'sprayDate' in (row.data as Record<string, unknown>) ||
      'paddockId' in (row.data as Record<string, unknown>))
  ) {
    return row.data as Record<string, unknown>;
  }

  return row;
}

function getNestedValue(value: unknown, path: string[]) {
  let current: unknown = value;

  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !(key in (current as Record<string, unknown>))) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function formatComparableValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

export function compareAgworldSprayPayloads(localPayload: AgworldSprayPayload, remotePayload: unknown) {
  const remoteRoot = extractComparableRoot(remotePayload);
  const fields = [
    { path: ['workspaceId'], label: 'Workspace id' },
    { path: ['paddockId'], label: 'Paddock id' },
    { path: ['ranchosRecordId'], label: 'RanchOS record id' },
    { path: ['sprayDate'], label: 'Spray date' },
    { path: ['sprayWindow', 'startTime'], label: 'Spray window start' },
    { path: ['sprayWindow', 'endTime'], label: 'Spray window end' },
    { path: ['applicator', 'name'], label: 'Applicator name' },
    { path: ['applicator', 'license'], label: 'Applicator license' },
    { path: ['site', 'ranchName'], label: 'Ranch name' },
    { path: ['site', 'blockName'], label: 'Block name' },
    { path: ['site', 'acresTreated'], label: 'Acres treated' },
    { path: ['site', 'organicBlock'], label: 'Organic block' },
    { path: ['product', 'name'], label: 'Product name' },
    { path: ['product', 'epaRegNumber'], label: 'EPA registration number' },
    { path: ['product', 'ratePerAcre'], label: 'Rate per acre' },
    { path: ['product', 'rateUnit'], label: 'Rate unit' },
    { path: ['product', 'totalProductUsed'], label: 'Total product used' },
    { path: ['product', 'totalProductUnit'], label: 'Total product unit' },
    { path: ['product', 'waterVolumeGpa'], label: 'Water volume GPA' },
    { path: ['weather', 'windSpeedMph'], label: 'Wind speed MPH' },
    { path: ['weather', 'windDirection'], label: 'Wind direction' },
    { path: ['weather', 'tempF'], label: 'Temperature F' },
    { path: ['targetPest'], label: 'Target pest' },
    { path: ['notes'], label: 'Notes' },
    { path: ['verification', 'verifiedAt'], label: 'Verified at' },
    { path: ['verification', 'reiExpiry'], label: 'REI expiry' },
    { path: ['verification', 'omriConfirmed'], label: 'OMRI confirmed' },
    { path: ['verification', 'certifierNotified'], label: 'Certifier notified' },
  ] as const;

  const comparisons = fields.map((field) => {
    const localValue = formatComparableValue(getNestedValue(localPayload, [...field.path]));
    const remoteValue = formatComparableValue(getNestedValue(remoteRoot, [...field.path]));

    let status: AgworldComparisonStatus;
    if (localValue === remoteValue) {
      status = 'matched';
    } else if (remoteValue === null) {
      status = 'missing_remote';
    } else if (localValue === null) {
      status = 'missing_local';
    } else {
      status = 'mismatch';
    }

    return {
      path: field.path.join('.'),
      label: field.label,
      status,
      localValue,
      remoteValue,
    } satisfies AgworldFieldComparison;
  });

  return {
    fields: comparisons,
    summary: {
      matched: comparisons.filter((entry) => entry.status === 'matched').length,
      mismatched: comparisons.filter((entry) => entry.status === 'mismatch').length,
      missingRemote: comparisons.filter((entry) => entry.status === 'missing_remote').length,
      missingLocal: comparisons.filter((entry) => entry.status === 'missing_local').length,
    },
  };
}

function extractAgworldId(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const row = payload as Record<string, unknown>;
  const directId = normalizeText(row.id);
  if (directId) {
    return directId;
  }

  const sprayRecordId = normalizeText(row.sprayRecordId);
  if (sprayRecordId) {
    return sprayRecordId;
  }

  const dataId =
    row.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? normalizeText((row.data as Record<string, unknown>).id)
      : null;

  return dataId;
}

export async function pushAgworldSprayRecord(input: {
  accessToken: string;
  payload: ReturnType<typeof buildAgworldSprayPayload>;
}) {
  const baseUrl = (process.env.AGWORLD_API_BASE_URL ?? 'https://api.agworld.com.au').replace(/\/+$/, '');
  const endpointPath = process.env.AGWORLD_SPRAY_PUSH_PATH ?? '/v1/spray-records';
  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input.payload),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && !Array.isArray(payload) && typeof (payload as Record<string, unknown>).error === 'string'
        ? ((payload as Record<string, unknown>).error as string)
        : null;
    const message = errorMessage ?? `AgWorld sync failed with status ${response.status}.`;
    throw new Error(message);
  }

  return {
    agworldId: extractAgworldId(payload),
    response: payload,
  };
}

export async function fetchAgworldSprayRecord(input: {
  accessToken: string;
  agworldId: string;
}) {
  const baseUrl = (process.env.AGWORLD_API_BASE_URL ?? 'https://api.agworld.com.au').replace(/\/+$/, '');
  const pathTemplate = process.env.AGWORLD_SPRAY_READ_PATH ?? '/v1/spray-records/{id}';
  const endpointPath = pathTemplate.includes('{id}')
    ? pathTemplate.replace('{id}', encodeURIComponent(input.agworldId))
    : pathTemplate.includes(':id')
      ? pathTemplate.replace(':id', encodeURIComponent(input.agworldId))
      : `${pathTemplate.replace(/\/+$/, '')}/${encodeURIComponent(input.agworldId)}`;
  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      accept: 'application/json',
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage =
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      typeof (payload as Record<string, unknown>).error === 'string'
        ? ((payload as Record<string, unknown>).error as string)
        : null;
    const message = errorMessage ?? `AgWorld readback failed with status ${response.status}.`;
    throw new Error(message);
  }

  return {
    agworldId: extractAgworldId(payload) ?? input.agworldId,
    response: payload,
  };
}
