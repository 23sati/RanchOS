import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { getMobileApiHeaders, MOBILE_API_URL } from './tasks';

function resolveExpoProjectId() {
  const expoConfigProjectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const easConfigProjectId =
    (Constants.easConfig as { projectId?: string } | null | undefined)?.projectId;

  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    expoConfigProjectId ||
    easConfigProjectId ||
    null
  );
}

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function registerDevicePushToken() {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    let status = permissions.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') {
      return { ok: false, skipped: true, reason: 'permission_denied' as const };
    }

    const projectId = resolveExpoProjectId();
    if (!projectId) {
      return { ok: false, skipped: true, reason: 'missing_project_id' as const };
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data;

    if (!expoPushToken) {
      return { ok: false, skipped: true, reason: 'missing_push_token' as const };
    }

    const response = await fetch(`${MOBILE_API_URL}/api/v1/notifications/device-token`, {
      method: 'PUT',
      headers: getMobileApiHeaders(),
      body: JSON.stringify({ expoPushToken }),
    });

    const payload = await parseJsonSafely(response);
    if (!response.ok) {
      throw new Error(payload?.error ?? `Unable to register device token (${response.status}).`);
    }

    return {
      ok: true,
      skipped: false,
      expoPushToken,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: error instanceof Error ? error.message : 'registration_failed',
    };
  }
}

export async function clearDevicePushToken() {
  const response = await fetch(`${MOBILE_API_URL}/api/v1/notifications/device-token`, {
    method: 'DELETE',
    headers: getMobileApiHeaders(),
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Unable to clear device token (${response.status}).`);
  }

  return payload;
}
