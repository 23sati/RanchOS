import { Hono } from 'hono';
import { db } from '@ranchos/db/src';
import {
  blocks,
  organizations,
  profiles,
  taskAssignments,
  taskBlocks,
  taskTypes,
  tasks,
} from '@ranchos/db/src/schema';
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { orgScopeMiddleware } from '../middleware/auth';
import { publishOrgEvent } from '../lib/orgEvents';
import { enqueueRecommendationRefresh } from '../lib/refreshRecommendations';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

type TaskInsert = typeof tasks.$inferInsert;
type TaskTypeInsert = typeof taskTypes.$inferInsert;
type TaskStatus = NonNullable<TaskInsert['status']>;
type TaskPriority = NonNullable<TaskInsert['priority']>;

const taskStatusOptions: TaskStatus[] = ['pending', 'in_progress', 'completed', 'overdue'];
const taskPriorityOptions: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

const defaultTaskTypes: Pick<TaskTypeInsert, 'nameEn' | 'nameEs' | 'color' | 'icon'>[] = [
  { nameEn: 'General', nameEs: 'General', color: '#6B7280', icon: 'clipboard-list' },
  { nameEn: 'Irrigation', nameEs: 'Riego', color: '#0284C7', icon: 'droplets' },
  { nameEn: 'Spray', nameEs: 'Aplicacion', color: '#F97316', icon: 'spray-can' },
  { nameEn: 'Fertilize', nameEs: 'Fertilizacion', color: '#65A30D', icon: 'flask-conical' },
  { nameEn: 'Scout', nameEs: 'Monitoreo', color: '#8B5CF6', icon: 'binoculars' },
  { nameEn: 'Harvest', nameEs: 'Cosecha', color: '#CA8A04', icon: 'tractor' },
];

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeEnum<T extends string>(value: unknown, options: readonly T[], fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!options.includes(normalized as T)) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return normalized as T;
}

function normalizeDate(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must be a valid YYYY-MM-DD date.`);
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return normalized;
}

function normalizeStringArray(value: unknown, fieldName: string) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be a list.`);
  }

  const normalized = Array.from(
    new Set(
      value
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );

  return normalized;
}

function sanitizeTaskInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const title = normalizeText(body.title);
  const taskTypeId = normalizeText(body.taskTypeId);
  const dueDate = normalizeDate(body.dueDate, 'Due date');
  const status = normalizeEnum(body.status, taskStatusOptions, 'Status');
  const priority = normalizeEnum(body.priority, taskPriorityOptions, 'Priority');
  const description = 'description' in body ? normalizeText(body.description) : undefined;
  const blockIds = 'blockIds' in body ? normalizeStringArray(body.blockIds, 'Block assignments') : undefined;
  const assignedProfileIds =
    'assignedProfileIds' in body ? normalizeStringArray(body.assignedProfileIds, 'Assigned profiles') : undefined;

  if (!isPartial) {
    if (!title) {
      throw new Error('Task title is required.');
    }

    if (!taskTypeId) {
      throw new Error('Task type is required.');
    }

    if (!dueDate) {
      throw new Error('Due date is required.');
    }
  }

  return {
    title,
    taskTypeId,
    dueDate,
    status,
    priority,
    description,
    blockIds,
    assignedProfileIds,
  };
}

async function ensureDefaultTaskTypes() {
  const existing = await db
    .select({
      id: taskTypes.id,
      nameEn: taskTypes.nameEn,
    })
    .from(taskTypes)
    .where(and(eq(taskTypes.isSystem, true), isNull(taskTypes.orgId)));

  const existingNames = new Set(existing.map((taskType) => taskType.nameEn));
  const missing = defaultTaskTypes.filter((taskType) => !existingNames.has(taskType.nameEn));

  if (missing.length > 0) {
    await db.insert(taskTypes).values(
      missing.map((taskType) => ({
        ...taskType,
        isSystem: true,
        orgId: null,
      })),
    );
  }
}

async function getOrgTimezone(orgId: string) {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  return organization?.timezone ?? 'America/Los_Angeles';
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

function resolveEffectiveStatus(task: Pick<typeof tasks.$inferSelect, 'status' | 'dueDate'>, today: string) {
  if (task.status === 'completed') {
    return 'completed' as const;
  }

  return task.dueDate < today ? ('overdue' as const) : task.status;
}

async function requireTaskType(orgId: string, taskTypeId: string) {
  const taskType = await db.query.taskTypes.findFirst({
    where: and(eq(taskTypes.id, taskTypeId), or(eq(taskTypes.orgId, orgId), isNull(taskTypes.orgId))),
  });

  if (!taskType) {
    throw new Error('Task type not found for this organization.');
  }

  return taskType;
}

async function requireBlocks(orgId: string, blockIds: string[]) {
  if (blockIds.length === 0) {
    return [];
  }

  const blockRows = await db
    .select({
      id: blocks.id,
    })
    .from(blocks)
    .where(and(eq(blocks.orgId, orgId), eq(blocks.active, true), inArray(blocks.id, blockIds)));

  if (blockRows.length !== blockIds.length) {
    throw new Error('One or more block assignments are invalid.');
  }

  return blockRows;
}

async function requireProfiles(orgId: string, profileIds: string[]) {
  if (profileIds.length === 0) {
    return [];
  }

  const profileRows = await db
    .select({
      id: profiles.id,
    })
    .from(profiles)
    .where(and(eq(profiles.orgId, orgId), inArray(profiles.id, profileIds)));

  if (profileRows.length !== profileIds.length) {
    throw new Error('One or more assignees are invalid.');
  }

  return profileRows;
}

async function buildTaskPayloads(orgId: string, taskRows: (typeof tasks.$inferSelect)[]) {
  if (taskRows.length === 0) {
    return [];
  }

  const today = getTodayInTimeZone(await getOrgTimezone(orgId));
  const taskIds = taskRows.map((task) => task.id);
  const taskTypeIds = Array.from(new Set(taskRows.map((task) => task.taskTypeId)));

  const [taskTypeRows, taskBlockRows, taskAssignmentRows] = await Promise.all([
    db
      .select({
        id: taskTypes.id,
        nameEn: taskTypes.nameEn,
        nameEs: taskTypes.nameEs,
        color: taskTypes.color,
        icon: taskTypes.icon,
        isSystem: taskTypes.isSystem,
      })
      .from(taskTypes)
      .where(inArray(taskTypes.id, taskTypeIds)),
    db
      .select({
        taskId: taskBlocks.taskId,
        blockId: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        active: blocks.active,
      })
      .from(taskBlocks)
      .innerJoin(blocks, eq(taskBlocks.blockId, blocks.id))
      .where(inArray(taskBlocks.taskId, taskIds)),
    db
      .select({
        taskId: taskAssignments.taskId,
        profileId: profiles.id,
        fullName: profiles.fullName,
        role: profiles.role,
      })
      .from(taskAssignments)
      .innerJoin(profiles, eq(taskAssignments.profileId, profiles.id))
      .where(inArray(taskAssignments.taskId, taskIds)),
  ]);

  const taskTypesById = new Map(taskTypeRows.map((taskType) => [taskType.id, taskType]));
  const blocksByTaskId = new Map<string, typeof taskBlockRows>();
  const assignmentsByTaskId = new Map<string, typeof taskAssignmentRows>();

  for (const blockRow of taskBlockRows) {
    const existing = blocksByTaskId.get(blockRow.taskId) ?? [];
    existing.push(blockRow);
    blocksByTaskId.set(blockRow.taskId, existing);
  }

  for (const assignmentRow of taskAssignmentRows) {
    const existing = assignmentsByTaskId.get(assignmentRow.taskId) ?? [];
    existing.push(assignmentRow);
    assignmentsByTaskId.set(assignmentRow.taskId, existing);
  }

  return taskRows.map((task) => ({
    ...task,
    effectiveStatus: resolveEffectiveStatus(task, today),
    taskType: taskTypesById.get(task.taskTypeId) ?? null,
    blocks: (blocksByTaskId.get(task.id) ?? []).sort((left, right) => left.name.localeCompare(right.name)),
    assignees: (assignmentsByTaskId.get(task.id) ?? []).sort((left, right) => left.fullName.localeCompare(right.fullName)),
  }));
}

async function getTaskById(orgId: string, taskId: string) {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)),
  });

  if (!task) {
    return null;
  }

  const [payload] = await buildTaskPayloads(orgId, [task]);
  return payload ?? null;
}

async function publishTaskEvent(orgId: string, event: Record<string, unknown>) {
  await publishOrgEvent(orgId, event as Record<string, unknown> & { type: string });
}

app.get('/task-types', async (c) => {
  const orgId = c.get('orgId');
  await ensureDefaultTaskTypes();

  const availableTaskTypes = await db
    .select({
      id: taskTypes.id,
      nameEn: taskTypes.nameEn,
      nameEs: taskTypes.nameEs,
      color: taskTypes.color,
      icon: taskTypes.icon,
      isSystem: taskTypes.isSystem,
    })
    .from(taskTypes)
    .where(or(eq(taskTypes.orgId, orgId), isNull(taskTypes.orgId)));

  availableTaskTypes.sort((left, right) => left.nameEn.localeCompare(right.nameEn));
  return c.json(availableTaskTypes);
});

app.get('/summary', async (c) => {
  const orgId = c.get('orgId');
  const today = getTodayInTimeZone(await getOrgTimezone(orgId));

  const taskRows = await db
    .select({
      id: tasks.id,
      status: tasks.status,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .where(eq(tasks.orgId, orgId));

  const summary = {
    open: 0,
    inProgress: 0,
    overdue: 0,
    dueToday: 0,
    completed: 0,
    total: taskRows.length,
  };

  for (const task of taskRows) {
    const effectiveStatus = resolveEffectiveStatus(task, today);
    if (effectiveStatus === 'pending') {
      summary.open += 1;
    } else if (effectiveStatus === 'in_progress') {
      summary.inProgress += 1;
    } else if (effectiveStatus === 'overdue') {
      summary.overdue += 1;
    } else if (effectiveStatus === 'completed') {
      summary.completed += 1;
    }

    if (task.status !== 'completed' && task.dueDate === today) {
      summary.dueToday += 1;
    }
  }

  return c.json(summary);
});

app.get('/', async (c) => {
  const orgId = c.get('orgId');
  const statusFilter = c.req.query('status') as TaskStatus | undefined;

  await ensureDefaultTaskTypes();

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.orgId, orgId))
    .orderBy(asc(tasks.dueDate), desc(tasks.createdAt));

  const payload = await buildTaskPayloads(orgId, taskRows);
  const filtered = statusFilter ? payload.filter((task) => task.effectiveStatus === statusFilter) : payload;

  return c.json(filtered);
});

app.post('/', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    await ensureDefaultTaskTypes();
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeTaskInput(body);
    const blockIds = values.blockIds ?? [];
    const assignedProfileIds = values.assignedProfileIds ?? [];

    await Promise.all([
      requireTaskType(orgId, String(values.taskTypeId)),
      requireBlocks(orgId, blockIds),
      requireProfiles(orgId, assignedProfileIds),
    ]);

    const [createdTask] = await db.transaction(async (tx) => {
      const [newTask] = await tx
        .insert(tasks)
        .values({
          orgId,
          taskTypeId: values.taskTypeId!,
          title: values.title!,
          description: values.description ?? null,
          dueDate: values.dueDate!,
          status: values.status ?? 'pending',
          priority: values.priority ?? 'normal',
          createdBy: profileId,
          completedAt: values.status === 'completed' ? new Date() : null,
          completedBy: values.status === 'completed' ? profileId : null,
          updatedBy: profileId,
        })
        .returning();

      if (blockIds.length > 0) {
        await tx.insert(taskBlocks).values(blockIds.map((blockId) => ({ taskId: newTask.id, blockId })));
      }

      if (assignedProfileIds.length > 0) {
        await tx
          .insert(taskAssignments)
          .values(assignedProfileIds.map((assignedId) => ({ taskId: newTask.id, profileId: assignedId })));
      }

      return [newTask];
    });

    const payload = await getTaskById(orgId, createdTask.id);
    await publishTaskEvent(orgId, { type: 'task_created', taskId: createdTask.id });
    await enqueueRecommendationRefresh({ orgId, reason: 'task_created' });

    return c.json(payload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid task payload.';
    return c.json({ error: message }, 400);
  }
});

app.get('/:id', async (c) => {
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  await ensureDefaultTaskTypes();
  const task = await getTaskById(orgId, id);

  if (!task) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(task);
});

app.patch('/:id', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  const id = c.req.param('id');

  try {
    await ensureDefaultTaskTypes();
    const existingTask = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.orgId, orgId)),
    });

    if (!existingTask) {
      return c.json({ error: 'Not found' }, 404);
    }

    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeTaskInput(body, { partial: true });

    if (values.taskTypeId) {
      await requireTaskType(orgId, values.taskTypeId);
    }

    if (values.blockIds) {
      await requireBlocks(orgId, values.blockIds);
    }

    if (values.assignedProfileIds) {
      await requireProfiles(orgId, values.assignedProfileIds);
    }

    const updateValues: Partial<TaskInsert> = {
      updatedBy: profileId,
      updatedAt: new Date(),
    };

    if (values.title) updateValues.title = values.title;
    if (values.taskTypeId) updateValues.taskTypeId = values.taskTypeId;
    if (values.description !== undefined) updateValues.description = values.description ?? null;
    if (values.dueDate) updateValues.dueDate = values.dueDate;
    if (values.priority) updateValues.priority = values.priority;

    if (values.status) {
      updateValues.status = values.status;
      if (values.status === 'completed') {
        updateValues.completedAt = existingTask.completedAt ?? new Date();
        updateValues.completedBy = existingTask.completedBy ?? profileId;
      } else {
        updateValues.completedAt = null;
        updateValues.completedBy = null;
      }
    }

    const [updatedTask] = await db.transaction(async (tx) => {
      const [taskRow] = await tx
        .update(tasks)
        .set(updateValues)
        .where(and(eq(tasks.id, id), eq(tasks.orgId, orgId)))
        .returning();

      if (values.blockIds) {
        await tx.delete(taskBlocks).where(eq(taskBlocks.taskId, id));
        if (values.blockIds.length > 0) {
          await tx.insert(taskBlocks).values(values.blockIds.map((blockId) => ({ taskId: id, blockId })));
        }
      }

      if (values.assignedProfileIds) {
        await tx.delete(taskAssignments).where(eq(taskAssignments.taskId, id));
        if (values.assignedProfileIds.length > 0) {
          await tx
            .insert(taskAssignments)
            .values(values.assignedProfileIds.map((assignedId) => ({ taskId: id, profileId: assignedId })));
        }
      }

      return [taskRow];
    });

    const payload = updatedTask ? await getTaskById(orgId, updatedTask.id) : null;
    await publishTaskEvent(orgId, {
      type: values.status ? 'task_status_changed' : 'task_updated',
      taskId: id,
    });
    await enqueueRecommendationRefresh({
      orgId,
      reason: values.status ? 'task_status_changed' : 'task_updated',
    });

    return c.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid task payload.';
    return c.json({ error: message }, 400);
  }
});

app.delete('/:id', async (c) => {
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  const [deletedTask] = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.orgId, orgId)))
    .returning({ id: tasks.id });

  if (!deletedTask) {
    return c.json({ error: 'Not found' }, 404);
  }

  await publishTaskEvent(orgId, {
    type: 'task_deleted',
    taskId: id,
  });
  await enqueueRecommendationRefresh({ orgId, reason: 'task_deleted' });

  return c.json({ success: true });
});

export default app;
