export const taskStatusOptions = [
  { value: 'pending', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
] as const;

export const taskPriorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const;

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TaskTypeRecord = {
  id: string;
  nameEn: string;
  nameEs: string;
  color: string;
  icon: string | null;
  isSystem: boolean | null;
};

export type TaskBlockSummary = {
  taskId: string;
  blockId: string;
  name: string;
  ranchId: string;
  cropType: string;
  variety: string;
  acreage: string | null;
  active: boolean | null;
};

export type TaskAssigneeSummary = {
  taskId: string;
  profileId: string;
  fullName: string;
  role: string;
};

export type TaskRecord = {
  id: string;
  orgId: string;
  taskTypeId: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy: string;
  completedAt: string | null;
  completedBy: string | null;
  completionNotes: string | null;
  completionPhotoUrls: string[] | null;
  completionGpsLat: string | null;
  completionGpsLng: string | null;
  lastSyncAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  effectiveStatus: TaskStatus;
  taskType: TaskTypeRecord | null;
  blocks: TaskBlockSummary[];
  assignees: TaskAssigneeSummary[];
};

export type TaskSummary = {
  open: number;
  inProgress: number;
  overdue: number;
  dueToday: number;
  completed: number;
  total: number;
};

export type TaskFormValues = {
  title: string;
  taskTypeId: string;
  description: string;
  dueDate: string;
  status: Extract<TaskStatus, 'pending' | 'in_progress' | 'completed'>;
  priority: TaskPriority;
  blockIds: string[];
};

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
    ...init,
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Request failed.');
  }

  return payload as T;
}

function nullableString(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

export function taskToFormValues(task: TaskRecord): TaskFormValues {
  return {
    title: task.title,
    taskTypeId: task.taskTypeId,
    description: task.description ?? '',
    dueDate: task.dueDate,
    status: task.status === 'overdue' ? 'pending' : task.status,
    priority: task.priority,
    blockIds: task.blocks.map((block) => block.blockId),
  };
}

export function buildTaskPayload(values: TaskFormValues) {
  return {
    title: values.title.trim(),
    taskTypeId: values.taskTypeId,
    description: nullableString(values.description),
    dueDate: values.dueDate,
    status: values.status,
    priority: values.priority,
    blockIds: values.blockIds,
  };
}

export async function fetchTaskTypes() {
  return request<TaskTypeRecord[]>('/api/v1/tasks/task-types', {
    method: 'GET',
  });
}

export async function fetchTaskSummary(ranchId?: string) {
  const params = new URLSearchParams();
  if (ranchId) {
    params.set('ranchId', ranchId);
  }

  const query = params.toString();
  return request<TaskSummary>(`/api/v1/tasks/summary${query ? `?${query}` : ''}`, {
    method: 'GET',
  });
}

export async function fetchTasks(status?: TaskStatus, ranchId?: string) {
  const params = new URLSearchParams();
  if (status) {
    params.set('status', status);
  }
  if (ranchId) {
    params.set('ranchId', ranchId);
  }

  const query = params.toString();
  return request<TaskRecord[]>(`/api/v1/tasks${query ? `?${query}` : ''}`, {
    method: 'GET',
  });
}

export async function fetchTask(id: string) {
  return request<TaskRecord>(`/api/v1/tasks/${id}`, {
    method: 'GET',
  });
}

export async function createTask(values: TaskFormValues) {
  return request<TaskRecord>('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify(buildTaskPayload(values)),
  });
}

export async function updateTask(id: string, values: TaskFormValues) {
  return request<TaskRecord>(`/api/v1/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(buildTaskPayload(values)),
  });
}

export async function deleteTask(id: string) {
  return request<{ success: true }>(`/api/v1/tasks/${id}`, {
    method: 'DELETE',
  });
}

export function formatTaskStatusLabel(status: TaskStatus) {
  if (status === 'in_progress') {
    return 'In progress';
  }

  if (status === 'overdue') {
    return 'Overdue';
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatTaskPriorityLabel(priority: TaskPriority) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function formatTaskDueDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
