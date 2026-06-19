'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import TaskForm from '@/components/tasks/TaskForm';
import { BlockRecord, fetchBlocks } from '@/lib/blocks';
import { fetchRanches, RanchRecord } from '@/lib/ranches';
import {
  TaskFormValues,
  TaskRecord,
  TaskTypeRecord,
  deleteTask,
  fetchTask,
  fetchTaskTypes,
  taskToFormValues,
  updateTask,
} from '@/lib/tasks';

function mergeBlocks(activeBlocks: BlockRecord[], task: TaskRecord | null) {
  const merged = new Map<string, BlockRecord>();

  for (const block of activeBlocks) {
    merged.set(block.id, block);
  }

  for (const block of task?.blocks ?? []) {
    if (!merged.has(block.blockId)) {
      merged.set(block.blockId, {
        id: block.blockId,
        orgId: task?.orgId ?? '',
        ranchId: block.ranchId,
        name: block.name,
        cropType: block.cropType,
        variety: block.variety,
        acreage: block.acreage,
        treeCount: null,
        yearPlanted: null,
        rootstock: null,
        irrigationType: null,
        geometry: null,
        isOrganic: false,
        organicSince: null,
        apn: null,
        waterDistrict: null,
        gsaName: null,
        notes: null,
        active: block.active,
        createdAt: null,
        updatedAt: null,
      });
    }
  }

  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [taskTypes, setTaskTypes] = useState<TaskTypeRecord[]>([]);
  const [activeBlocks, setActiveBlocks] = useState<BlockRecord[]>([]);
  const [initialValues, setInitialValues] = useState<TaskFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [initialRanchScopeId, setInitialRanchScopeId] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [taskRow, availableTaskTypes, ranchRows, workspaceBlocks] = await Promise.all([
          fetchTask(params.id),
          fetchTaskTypes(),
          fetchRanches(),
          fetchBlocks(),
        ]);

        if (cancelled) {
          return;
        }

        setTask(taskRow);
        setTaskTypes(availableTaskTypes);
        setRanches(ranchRows);
        setInitialValues(taskToFormValues(taskRow));
        setActiveBlocks(workspaceBlocks);
        const taskRanchIds = Array.from(new Set(taskRow.blocks.map((block) => block.ranchId)));
        setInitialRanchScopeId(taskRanchIds.length === 1 ? taskRanchIds[0] : 'all');
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load task.');
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
  }, [params.id]);

  const blockOptions = useMemo(
    () => mergeBlocks(activeBlocks, task),
    [activeBlocks, task],
  );

  const handleSubmit = async (values: TaskFormValues) => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const updatedTask = await updateTask(params.id, values);
      setTask(updatedTask);
      setInitialValues(taskToFormValues(updatedTask));
      router.push('/tasks');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage('');

    try {
      await deleteTask(params.id);
      router.push('/tasks');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete task.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading || !initialValues) {
    return <div className="p-6 text-sm text-gray-600">Loading task...</div>;
  }

  if (!task) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Task not available</h1>
          <p className="mt-2 text-sm text-gray-600">{errorMessage || 'This task could not be found for your current workspace.'}</p>
          <Link href="/tasks" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            Back to tasks
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <Link href="/tasks" className="text-sm font-medium text-green-700 hover:text-green-800">
          ← Back to tasks
        </Link>
      </div>
      <TaskForm
        title={`Edit ${task.title}`}
        description={`Update this ${task.taskType?.nameEn?.toLowerCase() ?? 'task'} across the workspace block list without losing cross-ranch assignments.`}
        submitLabel="Save changes"
        taskTypes={taskTypes}
        blocks={blockOptions}
        ranches={ranches}
        initialRanchScopeId={initialRanchScopeId}
        initialValues={initialValues}
        isSubmitting={isSubmitting}
        isDeleting={isDeleting}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </div>
  );
}
