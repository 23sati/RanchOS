import { eq } from 'drizzle-orm';
import { db } from './index';
import { organizations, profiles, ranches, subscriptions } from './schema';

export const onboardingCropOptions = ['almond', 'citrus', 'both'] as const;
export const onboardingCountyOptions = ['Fresno', 'Tulare', 'Kings', 'Kern', 'Madera', 'Merced', 'San Joaquin', 'San Bernardino', 'Riverside', 'Ventura'] as const;
export const onboardingLocaleOptions = ['en', 'es'] as const;

export type OnboardingCrop = (typeof onboardingCropOptions)[number];
export type OnboardingCounty = (typeof onboardingCountyOptions)[number];
export type OnboardingLocale = (typeof onboardingLocaleOptions)[number];

type QueryExecutor = Pick<typeof db, 'query'>;

export type OnboardingStatus = {
  onboardingComplete: boolean;
  profile: typeof profiles.$inferSelect | null;
  organization: typeof organizations.$inferSelect | null;
  ranch: typeof ranches.$inferSelect | null;
  subscription: typeof subscriptions.$inferSelect | null;
};

export type CompleteOnboardingInput = {
  userId: string;
  organizationName: string;
  primaryCrop: OnboardingCrop;
  ranchName: string;
  county?: OnboardingCounty | null;
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
  fullName: string;
  preferredLocale?: OnboardingLocale;
  timezone?: string;
  phone?: string | null;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeNullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNullableDecimal(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Approximate acreage must be a valid positive number.');
  }

  return parsed.toFixed(2);
}

function normalizeNullableCoordinate(
  value: string | null | undefined,
  options: { min: number; max: number; fieldName: string },
) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) {
    throw new Error(`${options.fieldName} must be between ${options.min} and ${options.max}.`);
  }

  return parsed.toFixed(8);
}

function normalizeViewportNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMapViewport(
  value: CompleteOnboardingInput['mapViewport'],
) {
  if (!value) {
    return null;
  }

  const centerLng = normalizeViewportNumber(value.center?.[0]);
  const centerLat = normalizeViewportNumber(value.center?.[1]);
  const zoom = normalizeViewportNumber(value.zoom);
  const minLng = normalizeViewportNumber(value.bounds?.[0]?.[0]);
  const minLat = normalizeViewportNumber(value.bounds?.[0]?.[1]);
  const maxLng = normalizeViewportNumber(value.bounds?.[1]?.[0]);
  const maxLat = normalizeViewportNumber(value.bounds?.[1]?.[1]);

  if (
    centerLng === null || centerLat === null || zoom === null ||
    minLng === null || minLat === null || maxLng === null || maxLat === null
  ) {
    throw new Error('Map viewport is invalid.');
  }

  return {
    center: [Number(centerLng.toFixed(8)), Number(centerLat.toFixed(8))] as [number, number],
    zoom: Number(zoom.toFixed(4)),
    bounds: [
      [Number(minLng.toFixed(8)), Number(minLat.toFixed(8))],
      [Number(maxLng.toFixed(8)), Number(maxLat.toFixed(8))],
    ] as [[number, number], [number, number]],
  };
}

function normalizeBoundary(value: CompleteOnboardingInput['boundary']) {
  if (!value) {
    return null;
  }

  if (
    value.type !== 'Feature' ||
    !value.geometry ||
    (value.geometry.type !== 'Polygon' && value.geometry.type !== 'MultiPolygon') ||
    !Array.isArray(value.geometry.coordinates)
  ) {
    throw new Error('Ranch boundary is invalid.');
  }

  return {
    type: 'Feature' as const,
    geometry: {
      type: value.geometry.type,
      coordinates: value.geometry.coordinates,
    },
    properties: value.properties ?? {},
  };
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'ranchos';
}

async function getDomainStatus(executor: QueryExecutor, userId: string): Promise<OnboardingStatus> {
  const profile = await executor.query.profiles.findFirst({
    where: eq(profiles.id, userId),
  });

  if (!profile) {
    return {
      onboardingComplete: false,
      profile: null,
      organization: null,
      ranch: null,
      subscription: null,
    };
  }

  const organization = await executor.query.organizations.findFirst({
    where: eq(organizations.id, profile.orgId),
  });
  const ranch = await executor.query.ranches.findFirst({
    where: eq(ranches.orgId, profile.orgId),
  });
  const subscription = await executor.query.subscriptions.findFirst({
    where: eq(subscriptions.orgId, profile.orgId),
  });

  return {
    onboardingComplete: Boolean(profile && organization && ranch && subscription),
    profile,
    organization: organization ?? null,
    ranch: ranch ?? null,
    subscription: subscription ?? null,
  };
}

async function createUniqueOrganizationSlug(name: string) {
  const baseSlug = slugify(name);

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const existingOrganization = await db.query.organizations.findFirst({
      where: eq(organizations.slug, candidate),
    });

    if (!existingOrganization) {
      return candidate;
    }
  }

  throw new Error('Unable to generate a unique organization slug.');
}

export async function getOnboardingStatus(userId: string) {
  return getDomainStatus(db, userId);
}

export async function completeOnboarding(input: CompleteOnboardingInput) {
  const organizationName = normalizeText(input.organizationName);
  const ranchName = normalizeText(input.ranchName);
  const fullName = normalizeText(input.fullName);

  if (!organizationName) {
    throw new Error('Organization name is required.');
  }

  if (!ranchName) {
    throw new Error('Ranch name is required.');
  }

  if (!fullName) {
    throw new Error('Full name is required.');
  }

  if (!onboardingCropOptions.includes(input.primaryCrop)) {
    throw new Error('Primary crop is required.');
  }

  if (input.county && !onboardingCountyOptions.includes(input.county)) {
    throw new Error('County selection is invalid.');
  }

  const organizationSlug = await createUniqueOrganizationSlug(organizationName);
  const totalAcres = normalizeNullableDecimal(input.totalAcres);
  const gpsLat = normalizeNullableCoordinate(input.gpsLat, { min: -90, max: 90, fieldName: 'Ranch latitude' });
  const gpsLng = normalizeNullableCoordinate(input.gpsLng, { min: -180, max: 180, fieldName: 'Ranch longitude' });
  const mapViewport = normalizeMapViewport(input.mapViewport);
  const boundary = normalizeBoundary(input.boundary);
  const preferredLocale = input.preferredLocale && onboardingLocaleOptions.includes(input.preferredLocale)
    ? input.preferredLocale
    : 'en';
  const timezone = normalizeNullableText(input.timezone) ?? 'America/Los_Angeles';
  const phone = normalizeNullableText(input.phone);

  if ((gpsLat && !gpsLng) || (!gpsLat && gpsLng)) {
    throw new Error('Add both ranch latitude and longitude, or leave both blank.');
  }

  return db.transaction(async (tx) => {
    const existingStatus = await getDomainStatus(tx, input.userId);
    if (existingStatus.onboardingComplete) {
      return existingStatus;
    }

    const [organization] = await tx.insert(organizations).values({
      name: organizationName,
      slug: organizationSlug,
      timezone,
      locale: preferredLocale,
      primaryCrop: input.primaryCrop,
    }).returning();

    const [profile] = await tx.insert(profiles).values({
      id: input.userId,
      orgId: organization.id,
      fullName,
      role: 'owner',
      preferredLocale,
      phone,
    }).returning();

    const [ranch] = await tx.insert(ranches).values({
      orgId: organization.id,
      name: ranchName,
      county: input.county ?? null,
      gpsLat,
      gpsLng,
      mapViewport,
      boundary,
    }).returning();

    const [subscription] = await tx.insert(subscriptions).values({
      orgId: organization.id,
      plan: 'starter',
      status: 'trialing',
      totalAcres,
    }).returning();

    return {
      onboardingComplete: true,
      profile,
      organization,
      ranch,
      subscription,
    } satisfies OnboardingStatus;
  });
}
