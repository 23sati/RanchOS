'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, ClipboardPenLine, Clock3, MapPinned, Plus, TriangleAlert } from 'lucide-react';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { fetchRanches, RanchRecord } from '@/lib/ranches';
import {
  TaskRecord,
  TaskStatus,
  TaskSummary,
  fetchTasks,
  fetchTaskSummary,
  formatTaskDueDate,
  formatTaskPriorityLabel,
  formatTaskStatusLabel,
} from '@/lib/tasks';

const ALL_RANCHES_VALUE = 'all';

const filters: { value: 'all' | TaskStatus; label: string }[] = [
  { value: 'all', label: 'All tasks' },
  { value: 'pending', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
];

const emptySummary: TaskSummary = {
  open: 0,
  inProgress: 0,
  overdue: 0,
  dueToday: 0,
  completed: 0,
  total: 0,
};

type TaskRanchOperationalRollup = {
  ranchId: string;
  ranchName: string;
  total: number;
  overdue: number;
  inProgress: number;
  dueToday: number;
  urgent: number;
};

function statusClasses(status: TaskStatus) {
  if (status === 'completed') {
    return 'bg-emerald-100 text-emerald-800';
  }

  if (status === 'in_progress') {
    return 'bg-sky-100 text-sky-800';
  }

  if (status === 'overdue') {
    return 'bg-red-100 text-red-800';
  }

  return 'bg-amber-100 text-amber-800';
}

function priorityClasses(priority: TaskRecord['priority']) {
  if (priority === 'urgent') {
    return 'text-red-700';
  }

  if (priority === 'high') {
    return 'text-amber-700';
  }

  return 'text-gray-600';
}

function uniqueRanchNames(task: TaskRecord, ranchesById: Map<string, RanchRecord>) {
  return Array.from(
    new Set(task.blocks.map((block) => ranchesById.get(block.ranchId)?.name ?? 'Unknown ranch')),
  ).sort((left, right) => left.localeCompare(right));
}

function taskOperationalScore(task: TaskRecord) {
  return (task.effectiveStatus === 'overdue' ? 100 : 0)
    + (task.priority === 'urgent' ? 20 : task.priority === 'high' ? 10 : 0)
    + (task.effectiveStatus === 'in_progress' ? 5 : 0);
}

function buildTaskHandoffSummary(tasks: TaskRecord[], ranchesById: Map<string, RanchRecord>) {
  return [
    'Task operational handoff',
    ...(tasks.length === 0
      ? ['- No tasks in the current scope.']
      : tasks.slice(0, 8).map((task) => {
          const ranchNames = uniqueRanchNames(task, ranchesById);
          return `- ${task.title}: ${formatTaskStatusLabel(task.effectiveStatus)} / ${formatTaskPriorityLabel(task.priority)} / due ${formatTaskDueDate(task.dueDate)}${ranchNames.length > 0 ? ` / ${ranchNames.join(', ')}` : ''}`;
        })),
  ].join('\n');
}

export default function TasksPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [summary, setSummary] = useState<TaskSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | TaskStatus>('all');
  const [selectedRanchId, setSelectedRanchId] = useState<string>(ALL_RANCHES_VALUE);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const loadScopedTasks = async (ranchScope: string) => {
    const ranchId = ranchScope === ALL_RANCHES_VALUE ? undefined : ranchScope;
    const [taskRows, taskSummary] = await Promise.all([
      fetchTasks(undefined, ranchId),
      fetchTaskSummary(ranchId),
    ]);

    setTasks(taskRows);
    setSummary(taskSummary);
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [onboardingStatus, ranchRows] = await Promise.all([
          fetchOnboardingStatus(),
          fetchRanches(),
        ]);

        const nextSelectedRanchId =
          ranchRows.length > 1
            ? ALL_RANCHES_VALUE
            : onboardingStatus.ranch?.id ?? ranchRows[0]?.id ?? ALL_RANCHES_VALUE;
        const ranchId = nextSelectedRanchId === ALL_RANCHES_VALUE ? undefined : nextSelectedRanchId;
        const [taskRows, taskSummary] = await Promise.all([
          fetchTasks(undefined, ranchId),
          fetchTaskSummary(ranchId),
        ]);

        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);
        setRanches(ranchRows);
        setTasks(taskRows);
        setSummary(taskSummary);
        setSelectedRanchId(nextSelectedRanchId);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load tasks.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRanchScopeChange = async (nextRanchId: string) => {
    setSelectedRanchId(nextRanchId);
    setScopeLoading(true);
    setErrorMessage('');

    try {
      await loadScopedTasks(nextRanchId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load tasks for this ranch.');
    } finally {
      setScopeLoading(false);
    }
  };

  const filteredTasks = useMemo(
    () => (activeFilter === 'all' ? tasks : tasks.filter((task) => task.effectiveStatus === activeFilter)),
    [activeFilter, tasks],
  );

  const ranchesById = useMemo(
    () => new Map(ranches.map((ranch) => [ranch.id, ranch])),
    [ranches],
  );

  const selectedRanch = useMemo(
    () => ranches.find((ranch) => ranch.id === selectedRanchId) ?? null,
    [ranches, selectedRanchId],
  );
  const selectedTask = useMemo(
    () => filteredTasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? null,
    [filteredTasks, selectedTaskId],
  );
  const taskRanchRollups = useMemo<TaskRanchOperationalRollup[]>(() => {
    const rollups = new Map<string, TaskRanchOperationalRollup>();

    for (const task of tasks) {
      const ranchIds = Array.from(new Set(task.blocks.map((block) => block.ranchId)));
      for (const ranchId of ranchIds) {
        const existing = rollups.get(ranchId) ?? {
          ranchId,
          ranchName: ranchesById.get(ranchId)?.name ?? 'Unknown ranch',
          total: 0,
          overdue: 0,
          inProgress: 0,
          dueToday: 0,
          urgent: 0,
        };

        existing.total += 1;
        if (task.effectiveStatus === 'overdue') existing.overdue += 1;
        if (task.effectiveStatus === 'in_progress') existing.inProgress += 1;
        if (task.priority === 'urgent') existing.urgent += 1;
        if (task.status !== 'completed' && task.dueDate === new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date())) {
          existing.dueToday += 1;
        }

        rollups.set(ranchId, existing);
      }
    }

    return Array.from(rollups.values()).sort((left, right) => {
      const leftPressure = left.overdue * 10 + left.urgent * 3 + left.inProgress;
      const rightPressure = right.overdue * 10 + right.urgent * 3 + right.inProgress;
      if (rightPressure !== leftPressure) {
        return rightPressure - leftPressure;
      }

      return left.ranchName.localeCompare(right.ranchName);
    });
  }, [ranchesById, tasks]);
  const operationalQueue = useMemo(
    () => [...filteredTasks].sort((left, right) => {
      const scoreDiff = taskOperationalScore(right) - taskOperationalScore(left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return left.dueDate.localeCompare(right.dueDate);
    }).slice(0, 8),
    [filteredTasks],
  );

  useEffect(() => {
    if (!selectedTaskId || !filteredTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(filteredTasks[0]?.id ?? null);
    }
  }, [filteredTasks, selectedTaskId]);

  const handleCopyTaskHandoff = async () => {
    try {
      await navigator.clipboard.writeText(buildTaskHandoffSummary(operationalQueue, ranchesById));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to copy task handoff summary.');
    }
  };

  const taskStats = [
    { label: 'Open', value: summary.open, tone: 'bg-amber-50 text-amber-800' },
    { label: 'In progress', value: summary.inProgress, tone: 'bg-sky-50 text-sky-800' },
    { label: 'Overdue', value: summary.overdue, tone: 'bg-red-50 text-red-800' },
    { label: 'Due today', value: summary.dueToday, tone: 'bg-emerald-50 text-emerald-800' },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Tasks</p>
          <h1 className="text-3xl font-bold text-gray-900">
            {status?.organization?.name ? `${status.organization.name} tasks` : 'Operational tasks'}
          </h1>
          <p className="text-sm text-gray-600">
            {selectedRanch
              ? `${summary.total} live tasks across ${selectedRanch.name}.`
              : ranches.length > 1
                ? `${summary.total} live tasks across all ranches.`
                : status?.ranch
                  ? `${summary.total} live tasks across ${status.ranch.name}.`
                  : 'Create and track ranch work from one place.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {ranches.length > 1 ? (
            <label className="min-w-[220px] rounded-xl border bg-white px-4 py-3 text-sm text-gray-700">
              <span className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                <MapPinned className="h-3.5 w-3.5" />
                Ranch scope
              </span>
              <select
                value={selectedRanchId}
                onChange={(event) => void handleRanchScopeChange(event.target.value)}
                className="w-full bg-transparent font-semibold text-gray-900 outline-none"
              >
                <option value={ALL_RANCHES_VALUE}>All ranches</option>
                {ranches.map((ranch) => (
                  <option key={ranch.id} value={ranch.id}>
                    {ranch.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{summary.total}</div>
            <div>Total tasks</div>
          </div>
          <Link href="/tasks/new" className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700">
            <Plus className="h-4 w-4" />
            New Task
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {taskStats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{stat.label}</p>
            <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${stat.tone}`}>
              Live
            </div>
            <p className="mt-3 text-3xl font-bold text-gray-900">{loading ? '...' : stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-ranch-border bg-gray-50 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Operational workbench</h2>
            <p className="mt-1 text-sm text-gray-500">
              Deeper task triage for the current scope using the same persisted task list.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyTaskHandoff()}
            className="inline-flex items-center gap-2 rounded-xl border border-ranch-border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <ClipboardPenLine className="h-4 w-4" />
            Copy handoff
          </button>
        </div>

        <div className="grid gap-4 p-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-3">
            {operationalQueue.length === 0 ? (
              <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-4 text-sm text-gray-600">
                No operational task pressure in this scope yet.
              </div>
            ) : (
              operationalQueue.map((task) => {
                const ranchNames = uniqueRanchNames(task, ranchesById);
                const isSelected = selectedTask?.id === task.id;

                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                      isSelected ? 'border-green-300 bg-green-50/40' : 'border-ranch-border bg-gray-50 hover:bg-gray-100/70'
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900">{task.title}</p>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(task.effectiveStatus)}`}>
                            {formatTaskStatusLabel(task.effectiveStatus)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                          <span>{formatTaskPriorityLabel(task.priority)}</span>
                          <span>Due {formatTaskDueDate(task.dueDate)}</span>
                          {ranchNames.length > 0 ? <span>{ranchNames.join(', ')}</span> : null}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {task.assignees.length > 0 ? task.assignees.map((assignee) => assignee.fullName).join(', ') : 'Unassigned'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Selected task</p>
              {selectedTask ? (
                <div className="mt-3 space-y-3 text-sm text-gray-600">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{selectedTask.title}</p>
                    <p className="mt-1">
                      {formatTaskStatusLabel(selectedTask.effectiveStatus)} / {formatTaskPriorityLabel(selectedTask.priority)} / due {formatTaskDueDate(selectedTask.dueDate)}
                    </p>
                  </div>
                  {selectedTask.description ? <p>{selectedTask.description}</p> : null}
                  <p>
                    Assignees: <span className="font-semibold text-gray-900">{selectedTask.assignees.length > 0 ? selectedTask.assignees.map((assignee) => assignee.fullName).join(', ') : 'Unassigned'}</span>
                  </p>
                  <p>
                    Blocks: <span className="font-semibold text-gray-900">{selectedTask.blocks.length > 0 ? selectedTask.blocks.map((block) => block.name).join(', ') : 'No blocks assigned'}</span>
                  </p>
                  <Link href={`/tasks/${selectedTask.id}`} className="inline-flex items-center gap-2 rounded-lg border border-ranch-border bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50">
                    Open task
                  </Link>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-600">Select a task from the queue to review its current operating context.</p>
              )}
            </div>

            {!selectedRanch && ranches.length > 1 ? (
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Ranch pressure</p>
                <div className="mt-3 space-y-3 text-sm text-gray-600">
                  {taskRanchRollups.length === 0 ? (
                    <p>No ranch task pressure yet.</p>
                  ) : (
                    taskRanchRollups.slice(0, 6).map((row) => (
                      <button
                        key={row.ranchId}
                        type="button"
                        onClick={() => void handleRanchScopeChange(row.ranchId)}
                        className="w-full rounded-lg border border-white/80 bg-white px-3 py-3 text-left shadow-sm hover:bg-gray-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-gray-900">{row.ranchName}</p>
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                            {row.total} tasks
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3">
                          <span>Overdue {row.overdue}</span>
                          <span>Urgent {row.urgent}</span>
                          <span>In progress {row.inProgress}</span>
                          <span>Due today {row.dueToday}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-ranch-border bg-gray-50 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Live task list</h2>
            {scopeLoading ? (
              <span className="text-sm text-gray-500">Refreshing scope...</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  activeFilter === filter.value
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y">
          {loading ? (
            <div className="px-6 py-8 text-sm text-gray-600">Loading tasks...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="space-y-3 px-6 py-8 text-sm text-gray-600">
              <p>No tasks match this view yet.</p>
              <Link href="/tasks/new" className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700">
                <Plus className="h-4 w-4" />
                Create first task
              </Link>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="block px-6 py-5 transition hover:bg-gray-50"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(task.effectiveStatus)}`}>
                        {formatTaskStatusLabel(task.effectiveStatus)}
                      </span>
                      <span className={`text-sm font-medium ${priorityClasses(task.priority)}`}>
                        {formatTaskPriorityLabel(task.priority)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {task.taskType?.nameEn ?? 'General'}
                      {' · '}
                      Due {formatTaskDueDate(task.dueDate)}
                    </p>
                      {task.description ? (
                        <p className="max-w-3xl text-sm text-gray-600">{task.description}</p>
                      ) : null}
                      {uniqueRanchNames(task, ranchesById).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {uniqueRanchNames(task, ranchesById).map((ranchName) => (
                            <span key={`${task.id}-${ranchName}`} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
                              {ranchName}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {task.blocks.length === 0 ? (
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                          No blocks assigned
                        </span>
                      ) : (
                        task.blocks.map((block) => (
                          <span key={block.blockId} className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-800">
                            {block.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    {task.effectiveStatus === 'overdue' ? (
                      <>
                        <TriangleAlert className="h-4 w-4 text-red-600" />
                        Overdue
                      </>
                    ) : (
                      <>
                        <Clock3 className="h-4 w-4" />
                        Updated {task.updatedAt ? formatTaskDueDate(task.updatedAt.slice(0, 10)) : formatTaskDueDate(task.dueDate)}
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
