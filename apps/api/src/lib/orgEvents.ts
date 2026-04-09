import { isRedisOnline, redis } from './redis';

type OrgEvent = {
  type: string;
} & Record<string, unknown>;

export async function publishOrgEvent(orgId: string, event: OrgEvent) {
  if (!(await isRedisOnline())) {
    return false;
  }

  try {
    await redis.publish(
      `org:${orgId}`,
      JSON.stringify({
        ...event,
        orgId,
        publishedAt: new Date().toISOString(),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function publishIntelligenceUpdated(
  orgId: string,
  event: Record<string, unknown> = {},
) {
  return publishOrgEvent(orgId, {
    type: 'intelligence_updated',
    ...event,
  });
}

export async function publishNotificationsUpdated(
  orgId: string,
  event: Record<string, unknown> = {},
) {
  return publishOrgEvent(orgId, {
    type: 'notifications_updated',
    ...event,
  });
}
