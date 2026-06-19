'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ClipboardList, Layers3, MapPinned, Save, Trash2 } from 'lucide-react';
import { BlockRecord, formatBlockCropLabel } from '@/lib/blocks';
import { RanchRecord } from '@/lib/ranches';
import {
  TaskFormValues,
  TaskTypeRecord,
  formatTaskPriorityLabel,
  formatTaskStatusLabel,
  taskPriorityOptions,
  taskStatusOptions,
} from '@/lib/tasks';

const ALL_RANCHES_VALUE = 'all';

type TaskFormProps = {
  title: string;
  description: string;
  submitLabel: string;
  taskTypes: TaskTypeRecord[];
  blocks: BlockRecord[];
  ranches?: RanchRecord[];
  initialRanchScopeId?: string;
  initialValues: TaskFormValues;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  errorMessage?: string;
  onSubmit: (values: TaskFormValues) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
};

function checkboxToggle(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export default function TaskForm({
  title,
  description,
  submitLabel,
  taskTypes,
  blocks,
  ranches = [],
  initialRanchScopeId = ALL_RANCHES_VALUE,
  initialValues,
  isSubmitting = false,
  isDeleting = false,
  errorMessage = '',
  onSubmit,
  onDelete,
}: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>(initialValues);
  const [selectedRanchScopeId, setSelectedRanchScopeId] = useState(initialRanchScopeId);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    setSelectedRanchScopeId(initialRanchScopeId);
  }, [initialRanchScopeId]);

  const ranchesById = useMemo(
    () => new Map(ranches.map((ranch) => [ranch.id, ranch])),
    [ranches],
  );

  const scopedBlocks = useMemo(() => {
    if (selectedRanchScopeId === ALL_RANCHES_VALUE) {
      return blocks;
    }

    return blocks.filter((block) => block.ranchId === selectedRanchScopeId);
  }, [blocks, selectedRanchScopeId]);

  const visibleBlocks = useMemo(() => {
    const merged = new Map<string, BlockRecord>();

    for (const block of scopedBlocks) {
      merged.set(block.id, block);
    }

    for (const block of blocks) {
      if (values.blockIds.includes(block.id)) {
        merged.set(block.id, block);
      }
    }

    return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [blocks, scopedBlocks, values.blockIds]);

  const selectedBlocks = useMemo(
    () => blocks.filter((block) => values.blockIds.includes(block.id)),
    [blocks, values.blockIds],
  );

  const selectedTaskType = useMemo(
    () => taskTypes.find((taskType) => taskType.id === values.taskTypeId) ?? null,
    [taskTypes, values.taskTypeId],
  );

  const selectedRanchNames = useMemo(
    () =>
      Array.from(
        new Set(selectedBlocks.map((block) => ranchesById.get(block.ranchId)?.name ?? 'Unknown ranch')),
      ).sort((left, right) => left.localeCompare(right)),
    [ranchesById, selectedBlocks],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-green-50 p-3 text-green-700">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              <p className="mt-1 text-sm text-gray-600">{description}</p>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Task title</span>
              <input
                type="text"
                value={values.title}
                onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
                placeholder="Irrigate south orchard edge"
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Task type</span>
              <select
                value={values.taskTypeId}
                onChange={(event) => setValues((current) => ({ ...current, taskTypeId: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                required
              >
                {taskTypes.map((taskType) => (
                  <option key={taskType.id} value={taskType.id}>
                    {taskType.nameEn}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Due date</span>
              <input
                type="date"
                value={values.dueDate}
                onChange={(event) => setValues((current) => ({ ...current, dueDate: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Status</span>
              <select
                value={values.status}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    status: event.target.value as TaskFormValues['status'],
                  }))
                }
                className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              >
                {taskStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Priority</span>
              <select
                value={values.priority}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    priority: event.target.value as TaskFormValues['priority'],
                  }))
                }
                className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              >
                {taskPriorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Description</span>
              <textarea
                value={values.description}
                onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
                rows={5}
                placeholder="Add the work details, notes for the crew, or completion context."
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-ranch-border bg-gray-50 px-6 py-4">
            <div className="flex items-center gap-2">
              <Layers3 className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Block assignment</h2>
            </div>
            <span className="text-sm text-gray-500">
              {selectedBlocks.length} selected
            </span>
          </div>
          {ranches.length > 1 ? (
            <div className="border-b border-ranch-border bg-white px-6 py-4">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  <MapPinned className="h-3.5 w-3.5" />
                  Ranch scope
                </span>
                <select
                  value={selectedRanchScopeId}
                  onChange={(event) => setSelectedRanchScopeId(event.target.value)}
                  className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                >
                  <option value={ALL_RANCHES_VALUE}>All ranches</option>
                  {ranches.map((ranch) => (
                    <option key={ranch.id} value={ranch.id}>
                      {ranch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {blocks.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-600">
              Create blocks first before assigning work to the ranch.
            </div>
          ) : (
            <div className="grid gap-3 p-6">
              {visibleBlocks.map((block) => {
                const checked = values.blockIds.includes(block.id);
                return (
                  <label
                    key={block.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                      checked
                        ? 'border-green-300 bg-green-50/60'
                        : 'border-ranch-border hover:border-green-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setValues((current) => ({
                          ...current,
                          blockIds: checkboxToggle(current.blockIds, block.id),
                        }))
                      }
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">{block.name}</div>
                      <div className="text-sm text-gray-600">
                        {formatBlockCropLabel(block.cropType)} · {block.variety}
                        {block.acreage ? ` · ${block.acreage} acres` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        {ranchesById.get(block.ranchId)?.name ?? 'Unknown ranch'}
                        {' • '}
                        {block.irrigationType ? `${block.irrigationType.replace(/_/g, ' ')} irrigation` : 'Irrigation not set'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Task snapshot</h2>
          <div className="mt-4 space-y-4 text-sm text-gray-600">
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Type</div>
              <div className="mt-2 text-base font-semibold text-gray-900">
                {selectedTaskType?.nameEn ?? 'Choose a type'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Due
                </div>
                <div className="mt-2 text-base font-semibold text-gray-900">
                  {values.dueDate || 'Set date'}
                </div>
              </div>
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Priority</div>
                <div className="mt-2 text-base font-semibold text-gray-900">
                  {formatTaskPriorityLabel(values.priority)}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Status</div>
              <div className="mt-2 text-base font-semibold text-gray-900">
                {formatTaskStatusLabel(values.status)}
              </div>
            </div>
            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Assigned blocks</div>
              {selectedBlocks.length === 0 ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  No blocks selected yet
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedBlocks.map((block) => (
                    <span key={block.id} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
                      {block.name}
                    </span>
                  ))}
                </div>
              )}
              {selectedRanchNames.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedRanchNames.map((ranchName) => (
                    <span key={ranchName} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
                      {ranchName}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Saving...' : submitLabel}
            </button>
            {onDelete ? (
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={isDeleting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete task'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}
