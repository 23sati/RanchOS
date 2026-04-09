import { Hono } from 'hono';
import { db } from '@ranchos/db/src';
import { blocks, taskAssignments, taskBlocks, taskTypes, tasks } from '@ranchos/db/src/schema';
import { eq, and, gt, inArray } from 'drizzle-orm';
import { orgScopeMiddleware } from '../middleware/auth';
import { redis } from '../lib/redis';
const app = new Hono<{ Variables: { orgId: string, profileId: string } }>();

app.use('*', orgScopeMiddleware);

app.post('/pull', async (c) => {
  const { last_pulled_at } = await c.req.json();
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  const since = last_pulled_at ? new Date(last_pulled_at) : new Date(0);

  const myTasks = await db.select({
      id: tasks.id,
      server_id: tasks.id,
      org_id: tasks.orgId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      due_date: tasks.dueDate,
      updated_at: tasks.updatedAt,
      completed_at: tasks.completedAt,
      completion_notes: tasks.completionNotes,
      completion_photo_urls: tasks.completionPhotoUrls,
      completion_gps_lat: tasks.completionGpsLat,
      completion_gps_lng: tasks.completionGpsLng,
      task_type_color: taskTypes.color,
      task_type_name_es: taskTypes.nameEs,
  }).from(tasks)
    .innerJoin(taskAssignments, eq(taskAssignments.taskId, tasks.id))
    .innerJoin(taskTypes, eq(taskTypes.id, tasks.taskTypeId))
    .where(and(
      eq(tasks.orgId, orgId), 
      eq(taskAssignments.profileId, profileId), 
      gt(tasks.updatedAt, since)
    ));

  const taskIds = myTasks.map((task) => task.id);
  const blockRows = taskIds.length === 0
    ? []
    : await db
        .select({
          task_id: taskBlocks.taskId,
          block_name: blocks.name,
          is_organic: blocks.isOrganic,
        })
        .from(taskBlocks)
        .innerJoin(blocks, eq(taskBlocks.blockId, blocks.id))
        .where(and(eq(blocks.orgId, orgId), inArray(taskBlocks.taskId, taskIds)));

  const blockMetaByTaskId = new Map<string, { names: string[]; hasOrganic: boolean }>();
  for (const row of blockRows) {
    const existing = blockMetaByTaskId.get(row.task_id) ?? { names: [], hasOrganic: false };
    existing.names.push(row.block_name);
    existing.hasOrganic = existing.hasOrganic || Boolean(row.is_organic);
    blockMetaByTaskId.set(row.task_id, existing);
  }

  const normalizedTasks = myTasks.map((task) => {
    const blockMeta = blockMetaByTaskId.get(task.id);
    const dueDate = new Date(`${task.due_date}T00:00:00.000Z`);

    return {
      ...task,
      due_date: Number.isNaN(dueDate.getTime()) ? null : dueDate.getTime(),
      updated_at: task.updated_at ? new Date(task.updated_at).getTime() : Date.now(),
      completed_at: task.completed_at ? new Date(task.completed_at).getTime() : null,
      completion_photo_urls: JSON.stringify(task.completion_photo_urls ?? []),
      block_names_es: JSON.stringify(blockMeta?.names ?? []),
      has_organic_block: blockMeta?.hasOrganic ?? false,
    };
  });

  return c.json({ 
    changes: { 
      tasks: { created: [], updated: normalizedTasks, deleted: [] } 
    }, 
    timestamp: Date.now() 
  });
});

app.post('/push', async (c) => {
  const { changes } = await c.req.json();
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  if (changes.tasks?.updated) {
    for (const localTask of changes.tasks.updated) {
      const serverTask = await db.query.tasks.findFirst({ 
        where: and(eq(tasks.id, localTask.server_id), eq(tasks.orgId, orgId)) 
      });
      if (!serverTask) continue;

      const STATUS_ORDER: Record<string, number> = { pending: 0, in_progress: 1, completed: 2, overdue: 3 };
      const newStatus = STATUS_ORDER[localTask.status] >= STATUS_ORDER[serverTask.status]
        ? localTask.status : serverTask.status;

      const userPhotos = localTask.completion_photo_urls ? JSON.parse(localTask.completion_photo_urls) : [];
      const mergedPhotos = [...new Set([...(serverTask.completionPhotoUrls || []), ...userPhotos])];

      await db.update(tasks).set({
        status: newStatus,
        completionNotes: localTask.completion_notes || serverTask.completionNotes,
        completionPhotoUrls: mergedPhotos,
        completionGpsLat: localTask.completion_gps_lat ?? serverTask.completionGpsLat,
        completionGpsLng: localTask.completion_gps_lng ?? serverTask.completionGpsLng,
        completedAt: newStatus === 'completed' && serverTask.status !== 'completed' ? new Date() : serverTask.completedAt,
        completedBy: newStatus === 'completed' ? (serverTask.completedBy ?? profileId) : serverTask.completedBy,
        updatedBy: profileId,
        updatedAt: new Date(),
        lastSyncAt: new Date()
      }).where(and(eq(tasks.id, localTask.server_id), eq(tasks.orgId, orgId)));

      await redis.publish(`org:${orgId}`, JSON.stringify({ type: 'task_synced', id: localTask.server_id }));
    }
  }
  return c.json({ success: true });
});

export default app;
