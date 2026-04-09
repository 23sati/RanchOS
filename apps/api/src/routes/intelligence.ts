import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import { aiRecommendations, blocks, ranches } from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import {
  buildRecommendationSummary,
  loadRecommendationHistory,
  sortRecommendations,
  sourceCategoryFromRecommendation,
} from '../lib/intelligenceRecommendations';
import { syncForecastNotifications } from '../lib/notifications';
import { publishIntelligenceUpdated } from '../lib/orgEvents';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeAction(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (normalized !== 'dismiss' && normalized !== 'act') {
    throw new Error('Action is invalid.');
  }

  return normalized;
}

async function requireOwnedRanch(orgId: string, ranchId: string) {
  const ranch = await db.query.ranches.findFirst({
    where: and(eq(ranches.id, ranchId), eq(ranches.orgId, orgId)),
  });

  if (!ranch) {
    throw new Error('Ranch not found for this organization.');
  }

  return ranch;
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');
  const ranchId = c.req.query('ranch_id');

  try {
    if (!ranchId) {
      return c.json({ error: 'ranch_id is required.' }, 400);
    }

    await requireOwnedRanch(orgId, ranchId);

    const blockRows = await db
      .select({
        id: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        isOrganic: blocks.isOrganic,
        active: blocks.active,
      })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true)))
      .orderBy(asc(blocks.name));

    const blockIds = blockRows.map((block) => block.id);
    if (blockIds.length === 0) {
      return c.json({
        generatedAt: new Date().toISOString(),
        blocks: blockRows,
        recommendations: [],
        summary: buildRecommendationSummary([]),
      });
    }

    const recommendationHistoryRows = await loadRecommendationHistory(orgId, blockIds);
    const liveRecommendations = sortRecommendations(
      recommendationHistoryRows.filter((recommendation) => !recommendation.dismissedAt && !recommendation.actedOnAt),
    );
    const blocksById = new Map(blockRows.map((block) => [block.id, block]));

    return c.json({
      generatedAt: new Date().toISOString(),
      blocks: blockRows,
      recommendations: liveRecommendations.map((recommendation) => ({
        ...recommendation,
        sourceCategory: sourceCategoryFromRecommendation(recommendation),
        block: blocksById.get(recommendation.blockId) ?? null,
      })),
      summary: buildRecommendationSummary(liveRecommendations),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load intelligence workspace.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.patch('/:id', async (c) => {
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const action = normalizeAction(body.action);
    if (!action) {
      return c.json({ error: 'Action is required.' }, 400);
    }

    const [updatedRecommendation] = await db
      .update(aiRecommendations)
      .set(action === 'dismiss' ? { dismissedAt: new Date() } : { actedOnAt: new Date() })
      .where(and(eq(aiRecommendations.id, id), eq(aiRecommendations.orgId, orgId)))
      .returning();

    if (!updatedRecommendation) {
      return c.json({ error: 'Recommendation not found.' }, 404);
    }

    await publishIntelligenceUpdated(orgId, {
      reason: action === 'dismiss' ? 'recommendation_dismissed' : 'recommendation_acted',
      recommendationId: updatedRecommendation.id,
    });
    await syncForecastNotifications(orgId);

    return c.json({
      id: updatedRecommendation.id,
      action,
      dismissedAt: updatedRecommendation.dismissedAt,
      actedOnAt: updatedRecommendation.actedOnAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update recommendation.';
    return c.json({ error: message }, 400);
  }
});

export default app;
