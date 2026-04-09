import { Hono } from 'hono';
import { completeOnboarding, getOnboardingStatus } from '@ranchos/db/src/onboarding';
import { sessionMiddleware } from '../middleware/auth';

type SessionUser = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
};

type CompleteOnboardingBody = {
  organizationName?: string;
  primaryCrop?: 'almond' | 'citrus' | 'both';
  ranchName?: string;
  county?: 'Fresno' | 'Tulare' | 'Kings' | 'Kern' | 'Madera' | 'Merced' | 'San Joaquin' | 'San Bernardino' | 'Riverside' | 'Ventura' | null;
  gpsLat?: string | null;
  gpsLng?: string | null;
  mapViewport?: {
    center: [number, number];
    zoom: number;
    bounds: [[number, number], [number, number]];
  } | null;
  boundary?: {
    type: 'Feature';
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: unknown[];
    };
    properties?: Record<string, unknown>;
  } | null;
  totalAcres?: string | null;
  fullName?: string;
  preferredLocale?: 'en' | 'es';
  timezone?: string;
  phone?: string | null;
};

const app = new Hono<{
  Variables: {
    userId: string;
    sessionUser: SessionUser;
  }
}>();

app.use('*', sessionMiddleware);

app.get('/status', async (c) => {
  const userId = c.get('userId');
  const sessionUser = c.get('sessionUser');
  const status = await getOnboardingStatus(userId);

  return c.json({
    user: sessionUser,
    ...status,
  });
});

app.post('/complete', async (c) => {
  let body: CompleteOnboardingBody;

  try {
    body = await c.req.json<CompleteOnboardingBody>();
  } catch {
    return c.json({ error: 'Invalid onboarding payload.' }, 400);
  }

  const userId = c.get('userId');
  const sessionUser = c.get('sessionUser');

  try {
    const status = await completeOnboarding({
      userId,
      organizationName: body.organizationName ?? '',
      primaryCrop: body.primaryCrop ?? 'almond',
      ranchName: body.ranchName ?? '',
      county: body.county ?? null,
      gpsLat: body.gpsLat ?? null,
      gpsLng: body.gpsLng ?? null,
      mapViewport: body.mapViewport ?? null,
      boundary: body.boundary ?? null,
      totalAcres: body.totalAcres ?? null,
      fullName: body.fullName ?? sessionUser.name ?? '',
      preferredLocale: body.preferredLocale ?? 'en',
      timezone: body.timezone,
      phone: body.phone ?? null,
    });

    return c.json({
      user: sessionUser,
      ...status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete onboarding.';
    return c.json({ error: message }, 400);
  }
});

export default app;
