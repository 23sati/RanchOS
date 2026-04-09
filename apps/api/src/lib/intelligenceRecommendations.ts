import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import { aiRecommendations } from '@ranchos/db/src/schema';

export type RecommendationInsert = typeof aiRecommendations.$inferInsert;
export type RecommendationRecord = typeof aiRecommendations.$inferSelect;
export type RecommendationType = NonNullable<RecommendationInsert['recommendationType']>;
export type RecommendationUrgency = Exclude<NonNullable<RecommendationInsert['urgency']>, undefined>;
export type SourceCategory = 'tasks' | 'pest' | 'irrigation' | 'compliance' | 'seasonal';

export type CandidateRecommendation = {
  key: string;
  blockId: string;
  recommendationType: RecommendationType;
  titleEn: string;
  titleEs: string;
  bodyEn: string;
  bodyEs: string;
  urgency: RecommendationUrgency;
  dataInputs: Record<string, unknown>;
};

export function recommendationKey(blockId: string, recommendationType: RecommendationType, titleEn: string) {
  return `${blockId}:${recommendationType}:${titleEn}`;
}

export function formatDateLabel(value: string) {
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

export function parseTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function addDays(dateValue: string, amount: number) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function pushCandidate(
  candidates: CandidateRecommendation[],
  values: Omit<CandidateRecommendation, 'key'>,
) {
  candidates.push({
    ...values,
    key: recommendationKey(values.blockId, values.recommendationType, values.titleEn),
  });
}

export function sourceCategoryFromRecommendation(
  recommendation: Pick<RecommendationRecord, 'recommendationType' | 'dataInputs'>,
) {
  const dataInputs =
    recommendation.dataInputs && typeof recommendation.dataInputs === 'object'
      ? (recommendation.dataInputs as Record<string, unknown>)
      : null;
  const sourceCategory = dataInputs?.sourceCategory;

  if (
    sourceCategory === 'tasks' ||
    sourceCategory === 'pest' ||
    sourceCategory === 'irrigation' ||
    sourceCategory === 'compliance' ||
    sourceCategory === 'seasonal'
  ) {
    return sourceCategory;
  }

  if (recommendation.recommendationType === 'pest_action') {
    return 'pest';
  }

  if (recommendation.recommendationType === 'irrigation') {
    return 'irrigation';
  }

  return 'tasks';
}

export function sortRecommendations(recommendations: RecommendationRecord[]) {
  const urgencyOrder = { urgent: 0, warning: 1, suggestion: 2, info: 3 } as const;

  return [...recommendations].sort((left, right) => {
    const leftUrgency = left.urgency ?? 'info';
    const rightUrgency = right.urgency ?? 'info';
    const urgencyDiff = urgencyOrder[leftUrgency] - urgencyOrder[rightUrgency];
    if (urgencyDiff !== 0) {
      return urgencyDiff;
    }

    return (right.createdAt?.getTime?.() ?? 0) - (left.createdAt?.getTime?.() ?? 0);
  });
}

export function buildRecommendationSummary(recommendations: RecommendationRecord[]) {
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

    const sourceCategory = sourceCategoryFromRecommendation(recommendation);
    if (sourceCategory === 'tasks') summary.taskAlerts += 1;
    if (sourceCategory === 'pest') summary.pestAlerts += 1;
    if (sourceCategory === 'irrigation') summary.irrigationAlerts += 1;
    if (sourceCategory === 'compliance') summary.complianceAlerts += 1;
    if (sourceCategory === 'seasonal') summary.seasonalAlerts += 1;
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

export async function loadRecommendationHistory(orgId: string, blockIds: string[]) {
  if (blockIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(aiRecommendations)
    .where(and(eq(aiRecommendations.orgId, orgId), inArray(aiRecommendations.blockId, blockIds)))
    .orderBy(desc(aiRecommendations.createdAt));
}

export async function syncGeneratedRecommendations(input: {
  candidates: CandidateRecommendation[];
  recommendationHistoryRows: RecommendationRecord[];
  blockOrgById: Map<string, string>;
  sourceCategories: SourceCategory[];
}) {
  const relevantHistory = input.recommendationHistoryRows.filter((recommendation) =>
    input.sourceCategories.includes(sourceCategoryFromRecommendation(recommendation)),
  );
  const latestHistoryByKey = new Map<string, RecommendationRecord>();

  for (const recommendation of relevantHistory) {
    const key = recommendationKey(
      recommendation.blockId,
      recommendation.recommendationType,
      recommendation.titleEn,
    );
    if (!latestHistoryByKey.has(key)) {
      latestHistoryByKey.set(key, recommendation);
    }
  }

  const candidateKeys = new Set(input.candidates.map((candidate) => candidate.key));
  const staleActiveIds = relevantHistory
    .filter((recommendation) => !recommendation.dismissedAt && !recommendation.actedOnAt)
    .filter((recommendation) => {
      const key = recommendationKey(
        recommendation.blockId,
        recommendation.recommendationType,
        recommendation.titleEn,
      );
      return !candidateKeys.has(key);
    })
    .map((recommendation) => recommendation.id);

  const inserts: RecommendationInsert[] = [];
  const updates: Array<{ id: string; values: Partial<RecommendationInsert> }> = [];

  for (const candidate of input.candidates) {
    const existing = latestHistoryByKey.get(candidate.key);

    if (existing && !existing.dismissedAt && !existing.actedOnAt) {
      const nextValues: Partial<RecommendationInsert> = {
        titleEn: candidate.titleEn,
        titleEs: candidate.titleEs,
        bodyEn: candidate.bodyEn,
        bodyEs: candidate.bodyEs,
        urgency: candidate.urgency,
        dataInputs: candidate.dataInputs,
      };

      const needsUpdate =
        existing.titleEs !== candidate.titleEs ||
        existing.bodyEn !== candidate.bodyEn ||
        existing.bodyEs !== candidate.bodyEs ||
        existing.urgency !== candidate.urgency ||
        JSON.stringify(existing.dataInputs ?? null) !== JSON.stringify(candidate.dataInputs);

      if (needsUpdate) {
        updates.push({ id: existing.id, values: nextValues });
      }

      continue;
    }

    inserts.push({
      orgId: input.blockOrgById.get(candidate.blockId)!,
      blockId: candidate.blockId,
      recommendationType: candidate.recommendationType,
      titleEn: candidate.titleEn,
      titleEs: candidate.titleEs,
      bodyEn: candidate.bodyEn,
      bodyEs: candidate.bodyEs,
      urgency: candidate.urgency,
      dataInputs: candidate.dataInputs,
    });
  }

  if (staleActiveIds.length > 0) {
    await db.delete(aiRecommendations).where(inArray(aiRecommendations.id, staleActiveIds));
  }

  if (inserts.length > 0) {
    await db.insert(aiRecommendations).values(inserts);
  }

  for (const update of updates) {
    await db
      .update(aiRecommendations)
      .set(update.values)
      .where(eq(aiRecommendations.id, update.id));
  }

  return {
    candidates: input.candidates.length,
    inserted: inserts.length,
    updated: updates.length,
    deleted: staleActiveIds.length,
  };
}
