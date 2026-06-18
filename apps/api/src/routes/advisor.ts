import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  aiRecommendations,
  apiKeys,
  blocks,
  notifications,
  organizations,
  pestSpecies,
  ranches,
  scoutingLogs,
  tasks,
  irrigationEvents,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';

const app = new Hono<{ Variables: { orgId: string; profileId: string; userRole: string } }>();

const advisorScopeOptions = ['advisor:read'] as const;
type AdvisorScope = (typeof advisorScopeOptions)[number];

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeScopes(value: unknown) {
  if (value === undefined) {
    return [...advisorScopeOptions];
  }

  if (!Array.isArray(value)) {
    throw new Error('Scopes must be an array.');
  }

  const normalized = Array.from(
    new Set(
      value
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is AdvisorScope => Boolean(entry) && advisorScopeOptions.includes(entry as AdvisorScope)),
    ),
  );

  if (normalized.length === 0) {
    throw new Error('At least one valid scope is required.');
  }

  return normalized;
}

function normalizeExpiryDate(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('Expiration date must be a valid YYYY-MM-DD date.');
  }

  const parsed = new Date(`${normalized}T23:59:59.999Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Expiration date must be valid.');
  }

  return parsed;
}

function hashApiKey(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function generateApiKeyToken() {
  return `ranchos_adv_${randomBytes(24).toString('hex')}`;
}

function getTodayInTimeZone(timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';

  return `${year}-${month}-${day}`;
}

function addDaysToDateString(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function resolveEffectiveTaskStatus(task: { status: string; dueDate: string }, today: string) {
  if (task.status === 'completed') {
    return 'completed';
  }

  return task.dueDate < today ? 'overdue' : task.status;
}

function getApiKeyTokenFromHeaders(headers: Headers) {
  const directHeader = normalizeText(headers.get('x-api-key'));
  if (directHeader) {
    return directHeader;
  }

  const authorization = normalizeText(headers.get('authorization'));
  if (!authorization) {
    return null;
  }

  const bearerPrefix = 'Bearer ';
  if (!authorization.startsWith(bearerPrefix)) {
    return null;
  }

  return normalizeText(authorization.slice(bearerPrefix.length));
}

function requireManagerAccess(userRole: string) {
  if (userRole === 'owner' || userRole === 'manager') {
    return null;
  }

  return { error: 'Manager or owner access is required.' } as const;
}

async function requireActiveAdvisorKey(headers: Headers, requiredScope: AdvisorScope) {
  const token = getApiKeyTokenFromHeaders(headers);
  if (!token) {
    return { error: 'API key required.' } as const;
  }

  const keyHash = hashApiKey(token);
  const record = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, keyHash),
  });

  if (!record) {
    return { error: 'Invalid API key.' } as const;
  }

  if (record.revokedAt) {
    return { error: 'API key has been revoked.' } as const;
  }

  if (record.expiresAt && record.expiresAt <= new Date()) {
    return { error: 'API key has expired.' } as const;
  }

  if (!record.scopes.includes(requiredScope)) {
    return { error: 'API key scope does not allow this action.' } as const;
  }

  await db
    .update(apiKeys)
    .set({
      lastUsedAt: new Date(),
    })
    .where(eq(apiKeys.id, record.id));

  return { record } as const;
}

async function buildAdvisorSnapshot(orgId: string) {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!organization) {
    throw new Error('Organization not found.');
  }

  const today = getTodayInTimeZone(organization.timezone ?? 'America/Los_Angeles');
  const next7Days = addDaysToDateString(today, 7);
  const scoutingWindowStart = new Date();
  scoutingWindowStart.setDate(scoutingWindowStart.getDate() - 7);

  const [
    ranchRows,
    blockRows,
    taskRows,
    recentTaskRows,
    recentScoutingRows,
    scoutingWindowRows,
    irrigationWindowRows,
    activeRecommendationRows,
    unreadNotificationRows,
  ] = await Promise.all([
    db
      .select({
        id: ranches.id,
        name: ranches.name,
        county: ranches.county,
      })
      .from(ranches)
      .where(eq(ranches.orgId, orgId))
      .orderBy(ranches.name),
    db
      .select({
        id: blocks.id,
        active: blocks.active,
      })
      .from(blocks)
      .where(eq(blocks.orgId, orgId)),
    db
      .select({
        id: tasks.id,
        status: tasks.status,
        dueDate: tasks.dueDate,
      })
      .from(tasks)
      .where(eq(tasks.orgId, orgId)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(eq(tasks.orgId, orgId))
      .orderBy(tasks.dueDate, desc(tasks.createdAt))
      .limit(6),
    db
      .select({
        id: scoutingLogs.id,
        scoutedAt: scoutingLogs.scoutedAt,
        rating: scoutingLogs.rating,
        blockName: blocks.name,
        pestNameCustom: scoutingLogs.pestNameCustom,
        pestNameEn: pestSpecies.nameEn,
      })
      .from(scoutingLogs)
      .innerJoin(blocks, eq(scoutingLogs.blockId, blocks.id))
      .leftJoin(pestSpecies, eq(scoutingLogs.pestSpeciesId, pestSpecies.id))
      .where(eq(scoutingLogs.orgId, orgId))
      .orderBy(desc(scoutingLogs.scoutedAt))
      .limit(6),
    db
      .select({
        id: scoutingLogs.id,
      })
      .from(scoutingLogs)
      .where(and(eq(scoutingLogs.orgId, orgId), gte(scoutingLogs.scoutedAt, scoutingWindowStart))),
    db
      .select({
        id: irrigationEvents.id,
        status: irrigationEvents.status,
      })
      .from(irrigationEvents)
      .where(
        and(
          eq(irrigationEvents.orgId, orgId),
          gte(irrigationEvents.scheduledDate, today),
          lte(irrigationEvents.scheduledDate, next7Days),
        ),
      ),
    db
      .select({
        id: aiRecommendations.id,
        blockId: aiRecommendations.blockId,
        blockName: blocks.name,
        recommendationType: aiRecommendations.recommendationType,
        titleEn: aiRecommendations.titleEn,
        urgency: aiRecommendations.urgency,
        createdAt: aiRecommendations.createdAt,
      })
      .from(aiRecommendations)
      .innerJoin(blocks, eq(aiRecommendations.blockId, blocks.id))
      .where(
        and(eq(aiRecommendations.orgId, orgId), isNull(aiRecommendations.dismissedAt), isNull(aiRecommendations.actedOnAt)),
      )
      .orderBy(desc(aiRecommendations.createdAt)),
    db
      .select({
        id: notifications.id,
      })
      .from(notifications)
      .where(and(eq(notifications.orgId, orgId), isNull(notifications.readAt), isNull(notifications.archivedAt))),
  ]);

  const taskSummary = {
    open: 0,
    inProgress: 0,
    overdue: 0,
    dueToday: 0,
    completed: 0,
    total: taskRows.length,
  };

  for (const task of taskRows) {
    const effectiveStatus = resolveEffectiveTaskStatus(task, today);
    if (effectiveStatus === 'pending') {
      taskSummary.open += 1;
    } else if (effectiveStatus === 'in_progress') {
      taskSummary.inProgress += 1;
    } else if (effectiveStatus === 'overdue') {
      taskSummary.overdue += 1;
    } else if (effectiveStatus === 'completed') {
      taskSummary.completed += 1;
    }

    if (task.status !== 'completed' && task.dueDate === today) {
      taskSummary.dueToday += 1;
    }
  }

  const recentScouting = recentScoutingRows.map((log) => ({
    id: log.id,
    scoutedAt: log.scoutedAt.toISOString(),
    rating: log.rating ?? null,
    blockName: log.blockName,
    pestLabel: log.pestNameCustom ?? log.pestNameEn ?? 'General observation',
  }));

  const urgentRecommendations = activeRecommendationRows
    .filter((recommendation) => recommendation.urgency === 'urgent' || recommendation.urgency === 'warning')
    .slice(0, 6)
    .map((recommendation) => ({
      id: recommendation.id,
      blockId: recommendation.blockId,
      blockName: recommendation.blockName,
      recommendationType: recommendation.recommendationType,
      titleEn: recommendation.titleEn,
      urgency: recommendation.urgency,
      createdAt: recommendation.createdAt?.toISOString() ?? null,
    }));

  return {
    generatedAt: new Date().toISOString(),
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      timezone: organization.timezone,
      locale: organization.locale,
      primaryCrop: organization.primaryCrop,
    },
    ranches: ranchRows,
    summary: {
      ranches: ranchRows.length,
      totalBlocks: blockRows.length,
      activeBlocks: blockRows.filter((block) => block.active !== false).length,
      openTasks: taskSummary.open,
      inProgressTasks: taskSummary.inProgress,
      overdueTasks: taskSummary.overdue,
      dueTodayTasks: taskSummary.dueToday,
      completedTasks: taskSummary.completed,
      scoutingThisWeek: scoutingWindowRows.length,
      irrigationNext7Days: irrigationWindowRows.filter(
        (event) => event.status === 'scheduled' || event.status === 'running' || event.status === 'problem',
      ).length,
      activeRecommendations: activeRecommendationRows.length,
      urgentRecommendations: activeRecommendationRows.filter((recommendation) => recommendation.urgency === 'urgent').length,
      unreadNotifications: unreadNotificationRows.length,
    },
    recentTasks: recentTaskRows.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      status: resolveEffectiveTaskStatus(task, today),
      priority: task.priority,
      createdAt: task.createdAt?.toISOString() ?? null,
    })),
    recentScouting,
    urgentRecommendations,
  };
}

app.use('/keys', orgScopeMiddleware);
app.use('/keys/*', orgScopeMiddleware);
app.use('/preview', orgScopeMiddleware);

app.get('/keys', async (c) => {
  const userRole = c.get('userRole');
  const unauthorized = requireManagerAccess(userRole);
  if (unauthorized) {
    return c.json(unauthorized, 403);
  }

  const orgId = c.get('orgId');
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.orgId, orgId))
    .orderBy(desc(apiKeys.createdAt));

  return c.json({
    availableScopes: advisorScopeOptions,
    keys: rows.map((row) => ({
      ...row,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt?.toISOString() ?? null,
    })),
  });
});

app.post('/keys', async (c) => {
  const userRole = c.get('userRole');
  const unauthorized = requireManagerAccess(userRole);
  if (unauthorized) {
    return c.json(unauthorized, 403);
  }

  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const name = normalizeText(body.name);
    const scopes = normalizeScopes(body.scopes);
    const expiresAt = normalizeExpiryDate(body.expiresAt);

    if (!name) {
      throw new Error('API key name is required.');
    }

    const token = generateApiKeyToken();
    const [createdKey] = await db
      .insert(apiKeys)
      .values({
        orgId,
        keyHash: hashApiKey(token),
        name,
        scopes,
        expiresAt,
        createdBy: profileId,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      });

    return c.json(
      {
        key: {
          ...createdKey,
          lastUsedAt: createdKey.lastUsedAt?.toISOString() ?? null,
          expiresAt: createdKey.expiresAt?.toISOString() ?? null,
          revokedAt: createdKey.revokedAt?.toISOString() ?? null,
          createdAt: createdKey.createdAt?.toISOString() ?? null,
        },
        token,
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create advisor API key.';
    return c.json({ error: message }, 400);
  }
});

app.patch('/keys/:id/revoke', async (c) => {
  const userRole = c.get('userRole');
  const unauthorized = requireManagerAccess(userRole);
  if (unauthorized) {
    return c.json(unauthorized, 403);
  }

  const orgId = c.get('orgId');
  const id = c.req.param('id');

  const [revokedKey] = await db
    .update(apiKeys)
    .set({
      revokedAt: new Date(),
    })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, orgId)))
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    });

  if (!revokedKey) {
    return c.json({ error: 'API key not found.' }, 404);
  }

  return c.json({
    ...revokedKey,
    lastUsedAt: revokedKey.lastUsedAt?.toISOString() ?? null,
    expiresAt: revokedKey.expiresAt?.toISOString() ?? null,
    revokedAt: revokedKey.revokedAt?.toISOString() ?? null,
    createdAt: revokedKey.createdAt?.toISOString() ?? null,
  });
});

app.get('/preview', async (c) => {
  const userRole = c.get('userRole');
  const unauthorized = requireManagerAccess(userRole);
  if (unauthorized) {
    return c.json(unauthorized, 403);
  }

  const orgId = c.get('orgId');

  try {
    return c.json(await buildAdvisorSnapshot(orgId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load advisor preview.';
    return c.json({ error: message }, 400);
  }
});

app.get('/snapshot', async (c) => {
  const authResult = await requireActiveAdvisorKey(c.req.raw.headers, 'advisor:read');
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, 401);
  }

  try {
    return c.json(await buildAdvisorSnapshot(authResult.record.orgId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load advisor snapshot.';
    return c.json({ error: message }, 400);
  }
});

export default app;
