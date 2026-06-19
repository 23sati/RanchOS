import {
  normalizeRanchBoundary,
  normalizeRanchMapViewport,
  type RanchBoundary,
  type RanchMapViewport,
} from '@/lib/ranches';

export type OnboardingStatus = {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  };
  onboardingComplete: boolean;
  profile: {
    id: string;
    orgId: string;
    fullName: string;
    role: string;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    primaryCrop: string | null;
  } | null;
  ranch: {
    id: string;
    name: string;
    county: string | null;
    gpsLat: string | null;
    gpsLng: string | null;
    mapViewport: RanchMapViewport | null;
    boundary: RanchBoundary | null;
  } | null;
  subscription: {
    id: string;
    plan: string;
    status: string;
  } | null;
};

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchOnboardingStatus() {
  const response = await fetch('/api/v1/onboarding/status', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Unable to load onboarding status.');
  }

  return {
    ...payload,
    ranch: payload?.ranch
        ? {
            ...payload.ranch,
            mapViewport: normalizeRanchMapViewport(payload.ranch.mapViewport),
            boundary: normalizeRanchBoundary(payload.ranch.boundary),
          }
      : null,
  } as OnboardingStatus;
}

export async function completeOnboarding(payload: {
  organizationName: string;
  primaryCrop: 'almond' | 'citrus' | 'both';
  ranchName: string;
  county: 'Fresno' | 'Tulare' | 'Kings' | 'Kern' | 'Madera' | 'Merced' | 'San Joaquin' | 'San Bernardino' | 'Riverside' | 'Ventura' | '';
  gpsLat: string;
  gpsLng: string;
  mapViewport: RanchMapViewport | null;
  boundary: RanchBoundary | null;
  totalAcres: string;
  fullName: string;
  preferredLocale: 'en' | 'es';
  timezone: string;
  phone: string;
}) {
  const response = await fetch('/api/v1/onboarding/complete', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      county: payload.county || null,
      gpsLat: payload.gpsLat || null,
      gpsLng: payload.gpsLng || null,
      mapViewport: payload.mapViewport,
      boundary: payload.boundary,
      totalAcres: payload.totalAcres || null,
      phone: payload.phone || null,
    }),
  });

  const data = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(data?.error ?? 'Unable to complete onboarding.');
  }

  return {
    ...data,
    ranch: data?.ranch
        ? {
            ...data.ranch,
            mapViewport: normalizeRanchMapViewport(data.ranch.mapViewport),
            boundary: normalizeRanchBoundary(data.ranch.boundary),
          }
      : null,
  } as OnboardingStatus;
}

export function resolvePostAuthRedirect(status: Pick<OnboardingStatus, 'onboardingComplete'>) {
  return status.onboardingComplete ? '/' : '/onboarding';
}

export function getRanchCenter(ranch: OnboardingStatus['ranch'] | null | undefined) {
  if (!ranch?.gpsLat || !ranch.gpsLng) {
    return null;
  }

  const lat = Number(ranch.gpsLat);
  const lng = Number(ranch.gpsLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return [lng, lat] as [number, number];
}

export function getRanchViewport(ranch: OnboardingStatus['ranch'] | null | undefined) {
  return ranch?.mapViewport ?? null;
}

export function getRanchBoundary(ranch: OnboardingStatus['ranch'] | null | undefined) {
  return ranch?.boundary ?? null;
}
