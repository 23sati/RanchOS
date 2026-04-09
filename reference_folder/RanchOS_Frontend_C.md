# RanchOS — Frontend Implementation Plan
## Part C: Tasks Module (Kanban Board)

> **Prerequisite:** Parts A & B  
> **Continued in:** `RanchOS_Frontend_D.md`

---

## 1. Tasks Page (`app/(dashboard)/tasks/page.tsx`)

```tsx
import { PageHeader } from '@/components/layout/PageHeader';
import { TasksView } from '@/components/tasks/TasksView';
import { Button } from '@/components/ui/Button';
import { PlusIcon } from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: 'Tasks' };

export default function TasksPage() {
  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in">
      <PageHeader
        title="Tasks"
        subtitle="Manage and track all field operations."
        actions={
          <Link href="/tasks/new">
            <Button id="create-task-btn" icon={<PlusIcon className="w-4 h-4" />}>
              New Task
            </Button>
          </Link>
        }
      />
      <TasksView />
    </div>
  );
}
```

---

## 2. TasksView — Kanban + List Toggle

```tsx
// components/tasks/TasksView.tsx
'use client';
import { useState } from 'react';
import { TaskKanban } from './TaskKanban';
import { TaskFilters } from './TaskFilters';
import { ViewToggle } from './ViewToggle'; // reused from blocks

type TaskView = 'kanban' | 'list';

export function TasksView() {
  const [view, setView] = useState<TaskView>('kanban');
  const [filters, setFilters] = useState({
    ranch: 'all', block: 'all', assignee: 'all',
    taskType: 'all', organicOnly: false,
  });

  return (
    <div className="flex flex-col flex-1 gap-4 min-h-0">
      <div className="flex items-center justify-between gap-4">
        <TaskFilters filters={filters} onChange={setFilters} />
        <ViewToggle mode={view} onChange={setView} options={['kanban', 'list']} />
      </div>
      {view === 'kanban'
        ? <TaskKanban filters={filters} />
        : <TaskList filters={filters} />
      }
    </div>
  );
}
```

---

## 3. TaskKanban Component

```tsx
// components/tasks/TaskKanban.tsx
'use client';
import { useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useTasks } from '@/lib/hooks/useTasks';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { TaskCard } from './TaskCard';
import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '@ranchos/shared';

const COLUMNS: { id: TaskStatus; labelKey: string; color: string }[] = [
  { id: 'pending',     labelKey: 'tasks.status.pending',     color: 'bg-stone-400' },
  { id: 'in_progress', labelKey: 'tasks.status.in_progress', color: 'bg-sky' },
  { id: 'completed',   labelKey: 'tasks.status.completed',   color: 'bg-leaf' },
  { id: 'overdue',     labelKey: 'tasks.status.overdue',     color: 'bg-red-500' },
];

export function TaskKanban({ filters }: { filters: Record<string, unknown> }) {
  const { t } = useTranslation();
  const { data: tasks = [], mutate } = useTasks(filters);

  const byStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = tasks.filter(t => t.status === col.id);
    return acc;
  }, {} as Record<TaskStatus, typeof tasks>);

  const onDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return;
    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId as TaskStatus;

    // Optimistic update
    mutate(prev => prev?.map(t => t.id === taskId ? { ...t, status: newStatus } : t), false);

    try {
      await apiClient.patch(`/tasks/${taskId}`, { status: newStatus });
      toast.success(t('tasks.status_updated'));
    } catch {
      mutate(); // revert
      toast.error(t('errors.save_failed'));
    }
  }, [mutate, t]);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0">
        {COLUMNS.map(col => (
          <div key={col.id} className="flex flex-col min-h-0">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {t(col.labelKey)}
              </h3>
              <span className="ml-auto text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-2 py-0.5 rounded-full">
                {byStatus[col.id].length}
              </span>
            </div>

            {/* Droppable column */}
            <Droppable droppableId={col.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex-1 overflow-y-auto rounded-xl p-2 space-y-2 transition-colors min-h-32 ${
                    snapshot.isDraggingOver
                      ? 'bg-[var(--color-bg-secondary)] ring-2 ring-sky/30'
                      : 'bg-[var(--color-bg-secondary)]/50'
                  }`}
                >
                  {byStatus[col.id].map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={snapshot.isDragging ? 'opacity-80 rotate-1 scale-105' : ''}
                        >
                          <TaskCard task={task} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {byStatus[col.id].length === 0 && (
                    <p className="text-xs text-[var(--color-text-muted)] text-center py-4">
                      {t('tasks.no_tasks_in_column')}
                    </p>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
```

---

## 4. TaskCard Component

```tsx
// components/tasks/TaskCard.tsx
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CalendarIcon, MapPinIcon, UserIcon, LeafIcon } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { cn } from '@/lib/utils/cn';
import { useTranslation } from 'react-i18next';
import type { Task } from '@ranchos/shared';

const PRIORITY_BADGE: Record<string, 'gray' | 'blue' | 'amber' | 'red'> = {
  low: 'gray', normal: 'blue', high: 'amber', urgent: 'red',
};

interface TaskCardProps { task: Task; }

export function TaskCard({ task }: TaskCardProps) {
  const { t } = useTranslation();
  const due = new Date(task.dueDate);
  const isOverdue = isPast(due) && task.status !== 'completed';
  const isDueToday = isToday(due);

  return (
    <Link href={`/tasks/${task.id}`}>
      <Card hover className="group">
        <CardContent className="p-3 space-y-2">
          {/* Type indicator + priority */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: task.taskTypeColor }}
              />
              <span className="text-xs font-semibold text-[var(--color-text-muted)] truncate">
                {task.taskTypeName}
              </span>
            </div>
            {task.priority !== 'normal' && (
              <Badge color={PRIORITY_BADGE[task.priority]}>
                {t(`tasks.priority.${task.priority}`)}
              </Badge>
            )}
          </div>

          {/* Title */}
          <p className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug line-clamp-2 group-hover:text-[var(--color-ranch-sky)] transition-colors">
            {task.title}
          </p>

          {/* Blocks */}
          {task.blocks?.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{task.blocks.map(b => b.name).join(', ')}</span>
              {task.blocks.some(b => b.isOrganic) && (
                <LeafIcon className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              )}
            </div>
          )}

          {/* Footer: due date + assignees */}
          <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]">
            <span className={cn(
              'text-xs font-medium flex items-center gap-1',
              isOverdue ? 'text-red-500' : isDueToday ? 'text-amber-600' : 'text-[var(--color-text-muted)]'
            )}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {isOverdue ? t('tasks.overdue') : isDueToday ? t('tasks.due_today') : format(due, 'MMM d')}
            </span>
            {/* Assignee avatars */}
            <div className="flex -space-x-1.5">
              {task.assignees?.slice(0, 3).map(a => (
                <div
                  key={a.id}
                  title={a.fullName}
                  className="w-6 h-6 rounded-full bg-[var(--color-ranch-leaf)] border-2 border-white flex items-center justify-center text-white text-xs font-bold uppercase"
                >
                  {a.fullName[0]}
                </div>
              ))}
              {(task.assignees?.length ?? 0) > 3 && (
                <div className="w-6 h-6 rounded-full bg-[var(--color-bg-secondary)] border-2 border-white flex items-center justify-center text-xs text-[var(--color-text-muted)] font-medium">
                  +{task.assignees.length - 3}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

---

## 5. TaskStatusBadge

```tsx
// components/tasks/TaskStatusBadge.tsx
import { Badge } from '@/components/ui/Badge';
import { useTranslation } from 'react-i18next';
import type { TaskStatus } from '@ranchos/shared';

const STATUS_COLOR: Record<TaskStatus, 'gray' | 'blue' | 'green' | 'red'> = {
  pending: 'gray', in_progress: 'blue', completed: 'green', overdue: 'red',
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useTranslation();
  return (
    <Badge color={STATUS_COLOR[status]} dot>
      {t(`tasks.status.${status}`)}
    </Badge>
  );
}
```

---

## 6. Create Task Form (`/tasks/new/page.tsx`)

```tsx
// app/(dashboard)/tasks/new/page.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { apiClient } from '@/lib/api/client';
import { useBlocks } from '@/lib/hooks/useBlocks';
import { useTeamMembers } from '@/lib/hooks/useTeamMembers';
import { useTaskTypes } from '@/lib/hooks/useTaskTypes';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface TaskFormValues {
  title: string;
  taskTypeId: string;
  description?: string;
  dueDate: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  blockIds: string[];
  assigneeIds: string[];
}

export default function NewTaskPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { register, handleSubmit, control, watch, formState: { isSubmitting, errors } } = useForm<TaskFormValues>({
    defaultValues: { priority: 'normal', blockIds: [], assigneeIds: [] },
  });

  const { data: blocks = [] } = useBlocks();
  const { data: members = [] } = useTeamMembers();
  const { data: taskTypes = [] } = useTaskTypes();

  const onSubmit = async (data: TaskFormValues) => {
    try {
      await apiClient.post('/tasks', data);
      toast.success(t('tasks.created_success'));
      router.push('/tasks');
    } catch {
      toast.error(t('errors.save_failed'));
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-card)] focus:ring-2 focus:ring-sky/30 focus:border-sky focus:outline-none transition-all';

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <PageHeader
        title={t('tasks.new_task')}
        breadcrumb={[{ label: t('nav.tasks'), href: '/tasks' }, { label: t('tasks.new_task') }]}
      />
      <Card>
        <CardContent className="p-6">
          <form id="task-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Task type */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                {t('tasks.type')} *
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {taskTypes.map(type => (
                  <label
                    key={type.id}
                    className="relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 cursor-pointer transition-all hover:border-sky/50"
                    style={{ borderColor: watch('taskTypeId') === type.id ? type.color : 'var(--color-border)' }}
                  >
                    <input
                      type="radio"
                      value={type.id}
                      {...register('taskTypeId', { required: true })}
                      className="sr-only"
                    />
                    <span className="w-3 h-3 rounded-full" style={{ background: type.color }} />
                    <span className="text-xs font-medium text-center leading-tight">{type.nameEn}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                {t('tasks.title')} *
              </label>
              <input id="task-title" {...register('title', { required: true })} className={inputCls} placeholder={t('tasks.title_placeholder')} />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                {t('tasks.description')}
              </label>
              <textarea id="task-description" {...register('description')} rows={3} className={inputCls} />
            </div>

            {/* Due date + Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                  {t('tasks.due_date')} *
                </label>
                <input id="task-due-date" type="date" {...register('dueDate', { required: true })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                  {t('tasks.priority')}
                </label>
                <select id="task-priority" {...register('priority')} className={inputCls}>
                  {['low', 'normal', 'high', 'urgent'].map(p => (
                    <option key={p} value={p}>{t(`tasks.priority.${p}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Blocks multi-select */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                {t('tasks.blocks')}
              </label>
              <Controller
                name="blockIds"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-secondary)] max-h-36 overflow-y-auto">
                    {blocks.map(b => {
                      const selected = field.value.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => field.onChange(selected ? field.value.filter(id => id !== b.id) : [...field.value, b.id])}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                            selected
                              ? 'bg-[var(--color-ranch-leaf)] text-white border-transparent'
                              : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-leaf'
                          }`}
                        >
                          {b.name} {b.isOrganic && '🌿'}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>

            {/* Crew assignees */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
                {t('tasks.assign_to')}
              </label>
              <Controller
                name="assigneeIds"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-secondary)] max-h-36 overflow-y-auto">
                    {members.map(m => {
                      const selected = field.value.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => field.onChange(selected ? field.value.filter(id => id !== m.id) : [...field.value, m.id])}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            selected
                              ? 'bg-[var(--color-ranch-sky)] text-white border-transparent'
                              : 'bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-sky'
                          }`}
                        >
                          <span className="w-4 h-4 rounded-full bg-[var(--color-ranch-leaf)] text-white flex items-center justify-center text-[10px] font-bold">
                            {m.fullName[0]}
                          </span>
                          {m.fullName}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={isSubmitting} id="task-form-submit">
                {t('tasks.create_task')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 7. `useTasks` Hook

```typescript
// lib/hooks/useTasks.ts
import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';
import type { Task } from '@ranchos/shared';

export function useTasks(filters?: Record<string, unknown>) {
  const params = new URLSearchParams();
  Object.entries(filters ?? {}).forEach(([k, v]) => {
    if (v && v !== 'all' && v !== false) params.set(k, String(v));
  });
  return useSWR<Task[]>(`/tasks?${params}`, apiClient.get, { refreshInterval: 30_000 });
}
```

---

## 8. Task Detail Page (`/tasks/[id]/page.tsx`)

Key sections only — full implementation mirrors block detail pattern:

```tsx
// Sections to render in order:
// 1. PageHeader — task title + TaskStatusBadge + Edit button
// 2. Info grid (4 cards): Task type, Due date, Priority, Created by
// 3. Block assignments — list of BlockCard (compact, read-only)
// 4. Assignee list — crew member avatars + names + mobile sync status
// 5. Completion section (if completed):
//    - Photo gallery (R2 URLs in a responsive grid)
//    - GPS location map (small static Mapbox map)
//    - Completion notes
//    - Completed by + timestamp
// 6. Activity log — who changed what, when (updated_by + updated_at trail)
```

```tsx
// Inline status update controls (owner/manager only):
<div className="flex gap-2">
  {(['pending', 'in_progress', 'completed'] as TaskStatus[]).map(s => (
    <Button
      key={s}
      size="sm"
      variant={task.status === s ? 'primary' : 'secondary'}
      onClick={() => updateStatus(s)}
    >
      {t(`tasks.status.${s}`)}
    </Button>
  ))}
</div>
```

---

*Continued in `RanchOS_Frontend_D.md` — Auth pages, Onboarding wizard, and Settings/Billing.*
