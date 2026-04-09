export const MOBILE_API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
export const MOBILE_DEV_USER_ID =
  process.env.EXPO_PUBLIC_DEV_USER_ID || 'dd1a7f72-6679-4e7b-9ba0-ed5350b6333f';

export type MobileTaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
export type MobileTaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type MobileTaskRecord = {
  id: string;
  server_id: string;
  org_id: string;
  title: string;
  description?: string | null;
  status: MobileTaskStatus;
  priority: MobileTaskPriority;
  due_date: number | null;
  updated_at: number;
  completed_at: number | null;
  completion_notes?: string | null;
  completion_photo_urls: string;
  completion_gps_lat?: number | null;
  completion_gps_lng?: number | null;
  task_type_color?: string | null;
  task_type_name_es?: string | null;
  block_names_es: string;
  has_organic_block?: boolean;
};

export function getMobileApiHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer dev:${MOBILE_DEV_USER_ID}`,
  };
}

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeTasks(input: unknown): MobileTaskRecord[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter((task): task is MobileTaskRecord => Boolean(task && typeof task === 'object'));
}

export async function fetchMobileTasks() {
  const response = await fetch(`${MOBILE_API_URL}/api/v1/sync/pull`, {
    method: 'POST',
    headers: getMobileApiHeaders(),
    body: JSON.stringify({ last_pulled_at: 0 }),
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Unable to load tasks (${response.status}).`);
  }

  return normalizeTasks(payload?.changes?.tasks?.updated);
}

export async function completeMobileTask(task: MobileTaskRecord, input: {
  completionNotes?: string | null;
  photoUri?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
}) {
  const existingPhotos = parsePhotoList(task.completion_photo_urls);
  const nextPhotos = input.photoUri ? [...new Set([...existingPhotos, input.photoUri])] : existingPhotos;

  const response = await fetch(`${MOBILE_API_URL}/api/v1/sync/push`, {
    method: 'POST',
    headers: getMobileApiHeaders(),
    body: JSON.stringify({
      changes: {
        tasks: {
          updated: [
            {
              server_id: task.server_id,
              status: 'completed',
              completion_notes: input.completionNotes ?? task.completion_notes ?? null,
              completion_photo_urls: JSON.stringify(nextPhotos),
              completion_gps_lat: input.gpsLat ?? task.completion_gps_lat ?? null,
              completion_gps_lng: input.gpsLng ?? task.completion_gps_lng ?? null,
            },
          ],
        },
      },
    }),
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Unable to complete task (${response.status}).`);
  }

  return {
    ...task,
    status: 'completed' as const,
    completion_notes: input.completionNotes ?? task.completion_notes ?? null,
    completion_photo_urls: JSON.stringify(nextPhotos),
    completion_gps_lat: input.gpsLat ?? task.completion_gps_lat ?? null,
    completion_gps_lng: input.gpsLng ?? task.completion_gps_lng ?? null,
    completed_at: Date.now(),
  };
}

export function parseBlockNames(blockNamesJson: string | null | undefined) {
  if (!blockNamesJson) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(blockNamesJson);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export function parsePhotoList(photoJson: string | null | undefined) {
  if (!photoJson) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(photoJson);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export function formatDueDate(timestamp: number | null) {
  if (!timestamp) {
    return 'No due date';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'No due date';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatTaskStatusLabel(status: MobileTaskStatus) {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'overdue') return 'Overdue';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
