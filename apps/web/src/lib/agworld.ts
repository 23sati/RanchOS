export type AgworldFieldMapping = {
  ranchosBlockId: string;
  agworldPaddockId: string;
};

export type AgworldIntegrationState = {
  enabled: boolean;
  connected: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  workspaceId: string | null;
  autoPushSprayRecords: boolean;
  autoPullRecommendations: boolean;
  fieldMappings: AgworldFieldMapping[];
  createdAt: string | null;
};

export type AgworldBlockRecord = {
  id: string;
  name: string;
  ranchName: string;
  active: boolean | null;
  paddockId: string | null;
};

export type AgworldSyncSnapshot = {
  status: string | null;
  syncedAt: string | null;
  errorMessage: string | null;
  agworldId: string | null;
};

export type AgworldSyncLogEntry = {
  id: string;
  syncType: 'spray_record' | 'scout_log' | 'block' | 'recommendation';
  direction: 'push' | 'pull' | null;
  status: 'success' | 'failed' | 'conflict' | null;
  agworldId: string | null;
  ranchosId: string | null;
  errorMessage: string | null;
  syncedAt: string | null;
};

export type AgworldSprayRecordPreview = {
  id: string;
  blockId: string;
  appliedDate: string;
  verifiedAt: string | null;
  acresTreated: string | null;
  targetPest: string | null;
  blockName: string;
  ranchName: string;
  productName: string;
  paddockId: string | null;
  lastSync: AgworldSyncSnapshot | null;
  lastPushSync: AgworldSyncSnapshot | null;
  lastPullSync: AgworldSyncSnapshot | null;
};

export type AgworldRecentSync = AgworldSyncLogEntry & {
  blockName: string | null;
  appliedDate: string | null;
  productName: string | null;
};

export type AgworldRecordReconciliationHistoryEntry = AgworldSyncLogEntry;

export type AgworldRecordReconciliationPayload = {
  integration: {
    enabled: boolean;
    connected: boolean;
    hasAccessToken: boolean;
    workspaceId: string | null;
  };
  record: AgworldSprayRecordPreview;
  summary: {
    attempts: number;
    successful: number;
    failed: number;
    conflicts: number;
    latestErrorMessage: string | null;
    latestAgworldId: string | null;
  };
  history: AgworldRecordReconciliationHistoryEntry[];
};

export type AgworldReadbackPayload = {
  recordId?: string;
  agworldId: string | null;
  syncedAt: string | null;
  status: 'success' | 'failed' | 'conflict' | null;
  errorMessage: string | null;
  outboundPayload: unknown;
  remoteRecord: unknown;
  comparison: {
    fields: Array<{
      path: string;
      label: string;
      status: 'matched' | 'mismatch' | 'missing_remote' | 'missing_local';
      localValue: string | null;
      remoteValue: string | null;
    }>;
    summary: {
      matched: number;
      mismatched: number;
      missingRemote: number;
      missingLocal: number;
    };
  } | null;
  reconciliation: AgworldRecordReconciliationPayload;
  workspace: AgworldWorkspacePayload;
};

export type AgworldBatchReadbackResponse = {
  summary: {
    attempted: number;
    successful: number;
    failed: number;
    conflicts: number;
  };
  results: Array<AgworldReadbackPayload & { recordId: string }>;
  workspace: AgworldWorkspacePayload;
};

export type AgworldWorkspacePayload = {
  organization: {
    id: string;
    name: string;
  };
  integration: AgworldIntegrationState;
  summary: {
    totalBlocks: number;
    mappedBlocks: number;
    exportableSprayRecords: number;
    readbackEligibleRecords: number;
    successfulSpraySyncs: number;
    failedSpraySyncs: number;
    conflictSpraySyncs: number;
    successfulPushSyncs: number;
    failedPushSyncs: number;
    conflictPushSyncs: number;
    successfulPullSyncs: number;
    failedPullSyncs: number;
    conflictPullSyncs: number;
    openPushBlockers: number;
    openPullBlockers: number;
  };
  blocks: AgworldBlockRecord[];
  exportableSprayRecords: AgworldSprayRecordPreview[];
  recentSyncs: AgworldRecentSync[];
};

export type UpdateAgworldWorkspaceInput = {
  enabled: boolean;
  workspaceId: string;
  accessToken?: string;
  refreshToken?: string;
  autoPushSprayRecords: boolean;
  autoPullRecommendations: boolean;
  fieldMappings: AgworldFieldMapping[];
};

export type AgworldSyncResponse = {
  summary: {
    attempted: number;
    successful: number;
    failed: number;
    conflicts: number;
  };
  results: Array<{
    recordId: string;
    blockName: string;
    status: 'success' | 'failed' | 'conflict';
    agworldId: string | null;
    message: string;
  }>;
  workspace: AgworldWorkspacePayload;
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

export async function fetchAgworldWorkspace() {
  return request<AgworldWorkspacePayload>('/api/v1/agworld', {
    method: 'GET',
  });
}

export async function updateAgworldWorkspace(input: UpdateAgworldWorkspaceInput) {
  return request<AgworldWorkspacePayload>('/api/v1/agworld', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function syncAgworldSprayRecords(recordIds?: string[]) {
  return request<AgworldSyncResponse>('/api/v1/agworld/sync/spray-records', {
    method: 'POST',
    body: JSON.stringify(recordIds?.length ? { recordIds } : {}),
  });
}

export async function fetchAgworldRecordReconciliation(recordId: string) {
  return request<AgworldRecordReconciliationPayload>(
    `/api/v1/agworld/spray-records/${encodeURIComponent(recordId)}/reconciliation`,
    {
      method: 'GET',
    },
  );
}

export async function readbackAgworldSprayRecord(recordId: string) {
  return request<AgworldReadbackPayload>(
    `/api/v1/agworld/spray-records/${encodeURIComponent(recordId)}/readback`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export async function readbackAgworldSprayRecords(recordIds: string[]) {
  return request<AgworldBatchReadbackResponse>('/api/v1/agworld/readback/spray-records', {
    method: 'POST',
    body: JSON.stringify({ recordIds }),
  });
}

export function formatAgworldDate(value: string | null) {
  if (!value) {
    return 'Not yet';
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

export function formatAgworldDateOnly(value: string | null) {
  if (!value) {
    return 'Not scheduled';
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatAgworldSyncStatus(value: string | null) {
  if (!value) {
    return 'Not synced';
  }

  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
