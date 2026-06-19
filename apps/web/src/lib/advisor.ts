export const advisorScopeOptions = [
  { value: 'advisor:read', label: 'Advisor read' },
] as const;

export type AdvisorScope = (typeof advisorScopeOptions)[number]['value'];

export type AdvisorKeyRecord = {
  id: string;
  name: string;
  scopes: AdvisorScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
};

export type AdvisorKeysPayload = {
  availableScopes: AdvisorScope[];
  keys: AdvisorKeyRecord[];
};

export type AdvisorSnapshotPayload = {
  generatedAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    locale: string;
    primaryCrop: string | null;
  };
  ranches: Array<{
    id: string;
    name: string;
    county: string | null;
  }>;
  summary: {
    ranches: number;
    totalBlocks: number;
    activeBlocks: number;
    openTasks: number;
    inProgressTasks: number;
    overdueTasks: number;
    dueTodayTasks: number;
    completedTasks: number;
    scoutingThisWeek: number;
    irrigationNext7Days: number;
    activeRecommendations: number;
    urgentRecommendations: number;
    unreadNotifications: number;
  };
  recentTasks: Array<{
    id: string;
    title: string;
    dueDate: string;
    status: string;
    priority: string;
    createdAt: string | null;
  }>;
  recentScouting: Array<{
    id: string;
    scoutedAt: string;
    rating: string | null;
    blockName: string;
    pestLabel: string;
  }>;
  urgentRecommendations: Array<{
    id: string;
    blockId: string;
    blockName: string;
    recommendationType: string;
    titleEn: string;
    urgency: string | null;
    createdAt: string | null;
  }>;
};

export type CreateAdvisorKeyValues = {
  name: string;
  expiresAt: string;
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

export async function fetchAdvisorKeys() {
  return request<AdvisorKeysPayload>('/api/v1/advisor/keys', {
    method: 'GET',
  });
}

export async function createAdvisorKey(values: CreateAdvisorKeyValues) {
  return request<{ key: AdvisorKeyRecord; token: string }>('/api/v1/advisor/keys', {
    method: 'POST',
    body: JSON.stringify({
      name: values.name.trim(),
      expiresAt: values.expiresAt.trim() || null,
      scopes: ['advisor:read'],
    }),
  });
}

export async function revokeAdvisorKey(id: string) {
  return request<AdvisorKeyRecord>(`/api/v1/advisor/keys/${id}/revoke`, {
    method: 'PATCH',
  });
}

export async function fetchAdvisorPreview() {
  return request<AdvisorSnapshotPayload>('/api/v1/advisor/preview', {
    method: 'GET',
  });
}

export function formatAdvisorDate(value: string | null) {
  if (!value) {
    return 'Never';
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

export function formatAdvisorScopeLabel(scope: AdvisorScope) {
  return advisorScopeOptions.find((option) => option.value === scope)?.label ?? scope;
}

export function formatAdvisorDateOnly(value: string) {
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
