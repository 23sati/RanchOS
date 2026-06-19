export type IntelligenceUrgency = 'info' | 'suggestion' | 'warning' | 'urgent';
export type IntelligenceRecommendationType =
  | 'irrigation'
  | 'pest_action'
  | 'harvest_timing'
  | 'hull_split'
  | 'general';
export type IntelligenceSourceCategory = 'tasks' | 'pest' | 'irrigation' | 'compliance' | 'seasonal';
export type IntelligenceAction = 'dismiss' | 'act';
export { subscribeToOrgEvents } from './org-events';

export type IntelligenceBlockRecord = {
  id: string;
  name: string;
  ranchId: string;
  cropType: string;
  variety: string;
  acreage: string | null;
  isOrganic: boolean;
  active: boolean | null;
};

export type IntelligenceRecommendationRecord = {
  id: string;
  orgId: string;
  blockId: string;
  recommendationType: IntelligenceRecommendationType;
  titleEn: string;
  titleEs: string;
  bodyEn: string;
  bodyEs: string;
  urgency: IntelligenceUrgency | null;
  dataInputs: Record<string, unknown> | null;
  dismissedAt: string | null;
  actedOnAt: string | null;
  createdAt: string | null;
  sourceCategory: IntelligenceSourceCategory;
  block: IntelligenceBlockRecord | null;
};

export type IntelligenceDashboardPayload = {
  generatedAt: string;
  blocks: IntelligenceBlockRecord[];
  recommendations: IntelligenceRecommendationRecord[];
  summary: {
    total: number;
    urgent: number;
    warning: number;
    suggestion: number;
    info: number;
    blocksFlagged: number;
    taskAlerts: number;
    pestAlerts: number;
    irrigationAlerts: number;
    complianceAlerts: number;
    seasonalAlerts: number;
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

export async function fetchIntelligenceDashboard(ranchId: string) {
  return request<IntelligenceDashboardPayload>(
    `/api/v1/intelligence?ranch_id=${encodeURIComponent(ranchId)}`,
    {
      method: 'GET',
    },
  );
}

export async function updateRecommendationStatus(id: string, action: IntelligenceAction) {
  return request<{ id: string; action: IntelligenceAction; dismissedAt: string | null; actedOnAt: string | null }>(
    `/api/v1/intelligence/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    },
  );
}

export function buildIntelligenceSummary(recommendations: IntelligenceRecommendationRecord[]) {
  const summary = {
    total: recommendations.length,
    urgent: 0,
    warning: 0,
    suggestion: 0,
    info: 0,
    blocksFlagged: new Set<string>(),
    taskAlerts: 0,
    pestAlerts: 0,
    irrigationAlerts: 0,
    complianceAlerts: 0,
    seasonalAlerts: 0,
  };

  for (const recommendation of recommendations) {
    if (recommendation.urgency === 'urgent') summary.urgent += 1;
    if (recommendation.urgency === 'warning') summary.warning += 1;
    if (recommendation.urgency === 'suggestion') summary.suggestion += 1;
    if (recommendation.urgency === 'info') summary.info += 1;
    summary.blocksFlagged.add(recommendation.blockId);

    if (recommendation.sourceCategory === 'tasks') summary.taskAlerts += 1;
    if (recommendation.sourceCategory === 'pest') summary.pestAlerts += 1;
    if (recommendation.sourceCategory === 'irrigation') summary.irrigationAlerts += 1;
    if (recommendation.sourceCategory === 'compliance') summary.complianceAlerts += 1;
    if (recommendation.sourceCategory === 'seasonal') summary.seasonalAlerts += 1;
  }

  return {
    total: summary.total,
    urgent: summary.urgent,
    warning: summary.warning,
    suggestion: summary.suggestion,
    info: summary.info,
    blocksFlagged: summary.blocksFlagged.size,
    taskAlerts: summary.taskAlerts,
    pestAlerts: summary.pestAlerts,
    irrigationAlerts: summary.irrigationAlerts,
    complianceAlerts: summary.complianceAlerts,
    seasonalAlerts: summary.seasonalAlerts,
  };
}

export function formatRecommendationDate(value: string | null) {
  if (!value) {
    return 'Unknown';
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

export function formatRecommendationUrgencyLabel(value: IntelligenceUrgency | null) {
  if (!value) {
    return 'Info';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatRecommendationTypeLabel(value: IntelligenceRecommendationType) {
  if (value === 'pest_action') {
    return 'Pest action';
  }

  if (value === 'harvest_timing') {
    return 'Harvest timing';
  }

  if (value === 'hull_split') {
    return 'Hull split';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
