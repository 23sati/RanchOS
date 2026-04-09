import { Job, Queue } from 'bullmq';
import { refreshEnvironmentalRecommendations } from './environmentalRecommendations';
import { publishNotificationSnapshot, syncForecastNotifications } from './notifications';
import { publishIntelligenceUpdated } from './orgEvents';
import { isRedisOnline, redis } from './redis';
import { refreshOperationalRecommendations } from './operationalRecommendations';

export const recommendationRefreshQueueName = 'recommendation-refresh';

export type RecommendationRefreshJobData = {
  orgId: string;
  includeEnvironmental: boolean;
  reason: string;
  requestedAt: string;
};

let recommendationRefreshQueue: Queue<RecommendationRefreshJobData> | null = null;

function getRecommendationRefreshQueue() {
  if (!recommendationRefreshQueue) {
    recommendationRefreshQueue = new Queue<RecommendationRefreshJobData>(
      recommendationRefreshQueueName,
      { connection: redis },
    );
  }

  return recommendationRefreshQueue;
}

export async function enqueueRecommendationRefresh(options: {
  orgId: string;
  includeEnvironmental?: boolean;
  reason: string;
}) {
  const { orgId, includeEnvironmental = false, reason } = options;

  try {
    if (!(await isRedisOnline())) {
      console.warn(
        `[Intelligence] Recommendation refresh queue is offline; skipped enqueue for org ${orgId}.`,
      );
      return { enqueued: false, queueOnline: false };
    }

    const jobId = `recommendation-refresh:${orgId}:${includeEnvironmental ? 'environmental' : 'operational'}`;
    await getRecommendationRefreshQueue().add(
      'refresh',
      {
        orgId,
        includeEnvironmental,
        reason,
        requestedAt: new Date().toISOString(),
      },
      {
        jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 60 * 60,
          count: 500,
        },
        removeOnFail: {
          age: 24 * 60 * 60,
          count: 500,
        },
      },
    );

    return { enqueued: true, queueOnline: true, jobId };
  } catch (error) {
    console.warn(
      '[Intelligence] Failed to enqueue recommendation refresh:',
      error instanceof Error ? error.message : error,
    );
    return { enqueued: false, queueOnline: true };
  }
}

export async function runRecommendationRefresh(
  data: RecommendationRefreshJobData,
  options: { jobId?: string } = {},
) {
  const operational = await refreshOperationalRecommendations({ orgId: data.orgId });
  const environmental = data.includeEnvironmental
    ? await refreshEnvironmentalRecommendations({ orgIds: [data.orgId] })
    : null;

  const result = {
    operational,
    environmental,
  };

  const notifications = await syncForecastNotifications(data.orgId, { publishEvent: false });
  await publishNotificationSnapshot(data.orgId, {
    reason: 'recommendation_refresh_sync',
    inserted: notifications.inserted,
    updated: notifications.updated,
    archived: notifications.archived,
  });

  console.log(
    `[Intelligence] Refreshed recommendations from queue: ${JSON.stringify({
      orgId: data.orgId,
      includeEnvironmental: data.includeEnvironmental,
      reason: data.reason,
      jobId: options.jobId ?? null,
      result,
      notifications,
    })}`,
  );

  await publishIntelligenceUpdated(data.orgId, {
    reason: data.reason,
    includeEnvironmental: data.includeEnvironmental,
    jobId: options.jobId ?? null,
    result,
    notifications,
  });

  return result;
}

export async function processRecommendationRefreshJob(
  job: Job<RecommendationRefreshJobData>,
) {
  return runRecommendationRefresh(job.data, { jobId: job.id ?? undefined });
}
