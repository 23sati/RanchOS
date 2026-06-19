'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TaskForm from '@/components/tasks/TaskForm';
import { BlockRecord, fetchBlocks } from '@/lib/blocks';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { fetchRanches, RanchRecord } from '@/lib/ranches';
import { TaskFormValues, TaskTypeRecord, createTask, fetchTaskTypes } from '@/lib/tasks';

function todayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, '0');
  const day = `${today.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function NewTaskPage() {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskTypeRecord[]>([]);
  const [initialValues, setInitialValues] = useState<TaskFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [initialRanchScopeId, setInitialRanchScopeId] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [onboardingStatus, availableTaskTypes, ranchRows, workspaceBlocks] = await Promise.all([
          fetchOnboardingStatus(),
          fetchTaskTypes(),
          fetchRanches(),
          fetchBlocks(),
        ]);

        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);
        setTaskTypes(availableTaskTypes);
        setRanches(ranchRows);
        setBlocks(workspaceBlocks);
        setInitialRanchScopeId(onboardingStatus.ranch?.id ?? ranchRows[0]?.id ?? 'all');

        setInitialValues({
          title: '',
          taskTypeId: availableTaskTypes[0]?.id ?? '',
          description: '',
          dueDate: todayDateValue(),
          status: 'pending',
          priority: 'normal',
          blockIds: [],
        });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load task setup.');
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

  const handleSubmit = async (values: TaskFormValues) => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const createdTask = await createTask(values);
      router.push(`/tasks/${createdTask.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || !initialValues) {
    return <div className="p-6 text-sm text-gray-600">Loading task workspace...</div>;
  }

  if (!status?.ranch) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">No ranch available yet</h1>
          <p className="mt-2 text-sm text-gray-600">Finish onboarding before creating tasks for a ranch.</p>
          <Link href="/onboarding" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            Return to onboarding
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
        title="Create a new task"
        description={`This task will be tracked inside ${status.organization?.name ?? 'your workspace'}, with ranch-aware block filtering so you can stay scoped or work across ranches.`}
        submitLabel="Create task"
        taskTypes={taskTypes}
        blocks={blocks}
        ranches={ranches}
        initialRanchScopeId={initialRanchScopeId}
        initialValues={initialValues}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
