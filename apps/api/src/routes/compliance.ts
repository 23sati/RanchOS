import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  applicationRecords,
  blocks,
  pestSpecies,
  products,
  profiles,
  ranches,
  scoutingLogs,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import { buildComplianceDprCsv } from '../utils/complianceExport';
import { enqueueRecommendationRefresh } from '../lib/refreshRecommendations';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

type ProductInsert = typeof products.$inferInsert;
type ApplicationInsert = typeof applicationRecords.$inferInsert;
type RecordType = NonNullable<ApplicationInsert['recordType']>;

const recordTypeOptions: RecordType[] = ['pesticide', 'fertilizer', 'soil_amendment'];

const defaultProducts: Pick<
  ProductInsert,
  | 'productName'
  | 'manufacturer'
  | 'epaRegNumber'
  | 'reiHours'
  | 'phiDays'
  | 'formulation'
  | 'applicableCrops'
  | 'targetPests'
  | 'restrictedUse'
  | 'isOmriListed'
  | 'isCdfaOrganic'
>[] = [
  {
    productName: 'Intrepid 2F',
    manufacturer: 'Corteva',
    epaRegNumber: '62719-442',
    reiHours: 4,
    phiDays: 14,
    formulation: 'Flowable',
    applicableCrops: ['almond'],
    targetPests: ['Navel Orangeworm'],
    restrictedUse: false,
    isOmriListed: false,
    isCdfaOrganic: false,
  },
  {
    productName: 'Entrust SC',
    manufacturer: 'Corteva',
    epaRegNumber: '62719-541',
    reiHours: 4,
    phiDays: 1,
    formulation: 'Suspension Concentrate',
    applicableCrops: ['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
    targetPests: ['Citrus Thrips', 'Aphids'],
    restrictedUse: false,
    isOmriListed: true,
    isCdfaOrganic: true,
  },
  {
    productName: 'Cinnerate',
    manufacturer: 'Brandt',
    epaRegNumber: '80824-1',
    reiHours: 4,
    phiDays: 0,
    formulation: 'Botanical',
    applicableCrops: ['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
    targetPests: ['Spider Mites', 'Aphids'],
    restrictedUse: false,
    isOmriListed: true,
    isCdfaOrganic: true,
  },
  {
    productName: 'Urea Ammonium Nitrate 32%',
    manufacturer: 'Generic',
    epaRegNumber: null,
    reiHours: null,
    phiDays: null,
    formulation: 'Liquid fertilizer',
    applicableCrops: ['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
    targetPests: [],
    restrictedUse: false,
    isOmriListed: false,
    isCdfaOrganic: false,
  },
];

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeEnum<T extends string>(value: unknown, options: readonly T[], fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!options.includes(normalized as T)) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return normalized as T;
}

function normalizeInteger(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number } = {},
) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  const min = options.min ?? 0;
  if (!Number.isFinite(parsed) || parsed < min || (options.max !== undefined && parsed > options.max)) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return parsed;
}

function normalizeDecimal(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; scale?: number } = {},
) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  const min = options.min ?? 0;
  if (!Number.isFinite(parsed) || parsed < min || (options.max !== undefined && parsed > options.max)) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return parsed.toFixed(options.scale ?? 2);
}

function normalizeDate(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must be a valid YYYY-MM-DD date.`);
  }

  return normalized;
}

function normalizeTime(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must use HH:MM 24-hour time.`);
  }

  return normalized;
}

function normalizeStringArray(value: unknown) {
  if (value === null || value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error('List value is invalid.');
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
}

function sanitizeProductInput(body: Record<string, unknown>) {
  const productName = normalizeText(body.productName);
  if (!productName) {
    throw new Error('Product name is required.');
  }

  return {
    productName,
    manufacturer: normalizeText(body.manufacturer),
    epaRegNumber: normalizeText(body.epaRegNumber),
    reiHours: normalizeInteger(body.reiHours, 'REI hours', { min: 0, max: 999 }),
    phiDays: normalizeInteger(body.phiDays, 'PHI days', { min: 0, max: 999 }),
    formulation: normalizeText(body.formulation),
    applicableCrops: normalizeStringArray(body.applicableCrops),
    targetPests: normalizeStringArray(body.targetPests),
    restrictedUse: Boolean(body.restrictedUse),
    isOmriListed: Boolean(body.isOmriListed),
    isCdfaOrganic: Boolean(body.isCdfaOrganic),
  };
}

function sanitizeApplicationInput(body: Record<string, unknown>) {
  const blockId = normalizeText(body.blockId);
  const recordType = normalizeEnum(body.recordType, recordTypeOptions, 'Record type');
  const applicatorName = normalizeText(body.applicatorName);
  const appliedDate = normalizeDate(body.appliedDate, 'Applied date');

  if (!blockId) {
    throw new Error('Block is required.');
  }

  if (!recordType) {
    throw new Error('Record type is required.');
  }

  if (!applicatorName) {
    throw new Error('Applicator name is required.');
  }

  if (!appliedDate) {
    throw new Error('Applied date is required.');
  }

  const acresTreated = normalizeDecimal(body.acresTreated, 'Acres treated', { min: 0.01, scale: 2 });
  if (!acresTreated) {
    throw new Error('Acres treated is required.');
  }

  return {
    blockId,
    recordType,
    applicatorName,
    applicatorLicense: normalizeText(body.applicatorLicense),
    productId: normalizeText(body.productId),
    productNameManual: normalizeText(body.productNameManual),
    ratePerAcre: normalizeDecimal(body.ratePerAcre, 'Rate per acre', { min: 0, scale: 4 }),
    rateUnit: normalizeText(body.rateUnit),
    totalProductUsed: normalizeDecimal(body.totalProductUsed, 'Total product used', { min: 0, scale: 4 }),
    totalProductUnit: normalizeText(body.totalProductUnit),
    waterVolumeGpa: normalizeDecimal(body.waterVolumeGpa, 'Water volume', { min: 0, scale: 2 }),
    appliedDate,
    appliedStartTime: normalizeTime(body.appliedStartTime, 'Applied start time'),
    appliedEndTime: normalizeTime(body.appliedEndTime, 'Applied end time'),
    windSpeedMph: normalizeDecimal(body.windSpeedMph, 'Wind speed', { min: 0, scale: 2 }),
    windDirection: normalizeText(body.windDirection),
    tempF: normalizeDecimal(body.tempF, 'Temperature', { min: -50, max: 180, scale: 2 }),
    targetPest: normalizeText(body.targetPest),
    targetPestScoutingLogId: normalizeText(body.targetPestScoutingLogId),
    acresTreated,
    equipmentUsed: normalizeText(body.equipmentUsed),
    notes: normalizeText(body.notes),
  };
}

function sanitizeApplicationUpdateInput(body: Record<string, unknown>) {
  const values = sanitizeApplicationInput(body);
  const certifierNotified =
    'certifierNotified' in body ? Boolean(body.certifierNotified) : undefined;
  const omriConfirmed = 'omriConfirmed' in body ? Boolean(body.omriConfirmed) : undefined;
  const verified = 'verified' in body ? Boolean(body.verified) : undefined;

  return {
    ...values,
    certifierNotified,
    omriConfirmed,
    verified,
  };
}

async function ensureDefaultProducts() {
  const existing = await db
    .select({
      id: products.id,
      productName: products.productName,
    })
    .from(products);

  const existingNames = new Set(existing.map((product) => product.productName));
  const missing = defaultProducts.filter((product) => !existingNames.has(product.productName));

  if (missing.length > 0) {
    await db.insert(products).values(missing);
  }
}

async function requireOwnedRanch(orgId: string, ranchId: string) {
  const ranch = await db.query.ranches.findFirst({
    where: and(eq(ranches.id, ranchId), eq(ranches.orgId, orgId)),
  });

  if (!ranch) {
    throw new Error('Ranch not found for this organization.');
  }

  return ranch;
}

async function requireOwnedBlock(orgId: string, blockId: string) {
  const block = await db.query.blocks.findFirst({
    where: and(eq(blocks.id, blockId), eq(blocks.orgId, orgId), eq(blocks.active, true)),
  });

  if (!block) {
    throw new Error('Block not found for this organization.');
  }

  return block;
}

async function requireApplicationRecord(orgId: string, applicationId: string) {
  const record = await db.query.applicationRecords.findFirst({
    where: and(eq(applicationRecords.id, applicationId), eq(applicationRecords.orgId, orgId)),
  });

  if (!record) {
    throw new Error('Application record not found for this organization.');
  }

  return record;
}

async function requireProduct(productId: string | null) {
  if (!productId) {
    return null;
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product) {
    throw new Error('Product not found.');
  }

  return product;
}

async function requireScoutingLog(orgId: string, logId: string | null) {
  if (!logId) {
    return null;
  }

  const log = await db.query.scoutingLogs.findFirst({
    where: and(eq(scoutingLogs.id, logId), eq(scoutingLogs.orgId, orgId)),
  });

  if (!log) {
    throw new Error('Target scouting log not found.');
  }

  return log;
}

function combineAppliedDateTime(dateValue: string, timeValue: string | null) {
  const base = new Date(`${dateValue}T${timeValue ?? '12:00'}:00`);
  return Number.isNaN(base.getTime()) ? null : base;
}

function addHours(date: Date | null, hours: number | null | undefined) {
  if (!date || hours === null || hours === undefined) {
    return null;
  }

  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(dateValue: string, days: number | null | undefined) {
  if (days === null || days === undefined) {
    return null;
  }

  const base = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    return null;
  }

  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

async function buildApplicationPayloads(recordRows: (typeof applicationRecords.$inferSelect)[]) {
  if (recordRows.length === 0) {
    return [];
  }

  const blockIds = Array.from(new Set(recordRows.map((record) => record.blockId)));
  const productIds = Array.from(
    new Set(recordRows.map((record) => record.productId).filter((value): value is string => Boolean(value))),
  );
  const targetLogIds = Array.from(
    new Set(recordRows.map((record) => record.targetPestScoutingLogId).filter((value): value is string => Boolean(value))),
  );
  const verifierIds = Array.from(
    new Set(recordRows.map((record) => record.verifiedBy).filter((value): value is string => Boolean(value))),
  );

  const [blockRows, productRows, scoutingRows, verifierRows] = await Promise.all([
    db
      .select({
        id: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        isOrganic: blocks.isOrganic,
      })
      .from(blocks)
      .where(inArray(blocks.id, blockIds)),
    productIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: products.id,
            productName: products.productName,
            manufacturer: products.manufacturer,
            epaRegNumber: products.epaRegNumber,
            cdfaRegNumber: products.cdfaRegNumber,
            dprProductId: products.dprProductId,
            reiHours: products.reiHours,
            phiDays: products.phiDays,
            formulation: products.formulation,
            applicableCrops: products.applicableCrops,
            targetPests: products.targetPests,
            restrictedUse: products.restrictedUse,
            isOmriListed: products.isOmriListed,
            isCdfaOrganic: products.isCdfaOrganic,
          })
          .from(products)
          .where(inArray(products.id, productIds)),
    targetLogIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: scoutingLogs.id,
            pestNameCustom: scoutingLogs.pestNameCustom,
            pestSpeciesId: scoutingLogs.pestSpeciesId,
            scoutedAt: scoutingLogs.scoutedAt,
            pestSpeciesName: pestSpecies.nameEn,
          })
          .from(scoutingLogs)
          .leftJoin(pestSpecies, eq(scoutingLogs.pestSpeciesId, pestSpecies.id))
          .where(inArray(scoutingLogs.id, targetLogIds)),
    verifierIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: profiles.id,
            fullName: profiles.fullName,
            role: profiles.role,
          })
          .from(profiles)
          .where(inArray(profiles.id, verifierIds)),
  ]);

  const blocksById = new Map(blockRows.map((block) => [block.id, block]));
  const productsById = new Map(productRows.map((product) => [product.id, product]));
  const scoutingById = new Map(
    scoutingRows.map((log) => [
      log.id,
      {
        ...log,
        pestDisplayName: log.pestSpeciesName ?? log.pestNameCustom ?? 'Observation',
      },
    ]),
  );
  const verifiersById = new Map(verifierRows.map((profile) => [profile.id, profile]));

  return recordRows.map((record) => ({
    ...record,
    block: blocksById.get(record.blockId) ?? null,
    product: record.productId ? productsById.get(record.productId) ?? null : null,
    targetScoutingLog: record.targetPestScoutingLogId
      ? scoutingById.get(record.targetPestScoutingLogId) ?? null
      : null,
    verifiedByProfile: record.verifiedBy ? verifiersById.get(record.verifiedBy) ?? null : null,
    productDisplayName:
      (record.productId ? productsById.get(record.productId)?.productName : null) ??
      record.productNameManual ??
      'Manual entry',
  }));
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');
  const ranchId = c.req.query('ranch_id');

  try {
    if (!ranchId) {
      return c.json({ error: 'ranch_id is required.' }, 400);
    }

    await ensureDefaultProducts();
    await requireOwnedRanch(orgId, ranchId);

    const blockRows = await db
      .select({
        id: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        treeCount: blocks.treeCount,
        isOrganic: blocks.isOrganic,
        active: blocks.active,
      })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true)))
      .orderBy(asc(blocks.name));

    const blockIds = blockRows.map((block) => block.id);

    const [productRows, scoutingRows, applicationRows] = await Promise.all([
      db
        .select({
          id: products.id,
          productName: products.productName,
          manufacturer: products.manufacturer,
          epaRegNumber: products.epaRegNumber,
          cdfaRegNumber: products.cdfaRegNumber,
          dprProductId: products.dprProductId,
          reiHours: products.reiHours,
          phiDays: products.phiDays,
          formulation: products.formulation,
          applicableCrops: products.applicableCrops,
          targetPests: products.targetPests,
          restrictedUse: products.restrictedUse,
          isOmriListed: products.isOmriListed,
          isCdfaOrganic: products.isCdfaOrganic,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .orderBy(asc(products.productName)),
      blockIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              id: scoutingLogs.id,
              blockId: scoutingLogs.blockId,
              scoutedAt: scoutingLogs.scoutedAt,
              pestNameCustom: scoutingLogs.pestNameCustom,
              pestSpeciesId: scoutingLogs.pestSpeciesId,
              rating: scoutingLogs.rating,
              pestSpeciesName: pestSpecies.nameEn,
              blockName: blocks.name,
            })
            .from(scoutingLogs)
            .leftJoin(pestSpecies, eq(scoutingLogs.pestSpeciesId, pestSpecies.id))
            .innerJoin(blocks, eq(scoutingLogs.blockId, blocks.id))
            .where(and(eq(scoutingLogs.orgId, orgId), inArray(scoutingLogs.blockId, blockIds)))
            .orderBy(desc(scoutingLogs.scoutedAt))
            .limit(25),
      blockIds.length === 0
        ? Promise.resolve([])
        : db
            .select()
            .from(applicationRecords)
            .where(and(eq(applicationRecords.orgId, orgId), inArray(applicationRecords.blockId, blockIds)))
            .orderBy(desc(applicationRecords.appliedDate), desc(applicationRecords.createdAt)),
    ]);

    const applications = await buildApplicationPayloads(applicationRows);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const summary = {
      products: productRows.length,
      applications: applications.length,
      activeRei: applications.filter(
        (record) => record.reiExpiry && new Date(record.reiExpiry) > now,
      ).length,
      activePhi: applications.filter(
        (record) => record.phiExpiry && record.phiExpiry >= today,
      ).length,
      organicApplications: applications.filter((record) => record.isOrganicBlock).length,
    };

    return c.json({
      blocks: blockRows,
      products: productRows,
      scoutingLogs: scoutingRows.map((log) => ({
        ...log,
        pestDisplayName: log.pestSpeciesName ?? log.pestNameCustom ?? 'Observation',
      })),
      applications,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load compliance data.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.get('/export/dpr.csv', async (c) => {
  const orgId = c.get('orgId');
  const ranchId = c.req.query('ranch_id');

  try {
    if (!ranchId) {
      return c.json({ error: 'ranch_id is required.' }, 400);
    }

    await ensureDefaultProducts();
    const ranch = await requireOwnedRanch(orgId, ranchId);

    const blockRows = await db
      .select({
        id: blocks.id,
      })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true)));

    const blockIds = blockRows.map((block) => block.id);
    const pesticideRows =
      blockIds.length === 0
        ? []
        : await db
            .select()
            .from(applicationRecords)
            .where(
              and(
                eq(applicationRecords.orgId, orgId),
                inArray(applicationRecords.blockId, blockIds),
                eq(applicationRecords.recordType, 'pesticide'),
              ),
            )
            .orderBy(desc(applicationRecords.appliedDate), desc(applicationRecords.createdAt));

    const payload = await buildApplicationPayloads(pesticideRows);
    const csv = buildComplianceDprCsv(
      payload.map((record) => ({
        ranchName: ranch.name,
        ranchCounty: ranch.county ?? null,
        ranchAddress: ranch.address ?? null,
        blockName: record.block?.name ?? null,
        cropType: record.block?.cropType ?? null,
        variety: record.block?.variety ?? null,
        applicatorName: record.applicatorName,
        applicatorLicense: record.applicatorLicense ?? null,
        productName: record.productDisplayName,
        epaRegNumber: record.product?.epaRegNumber ?? record.epaRegNumber ?? null,
        cdfaRegNumber: record.product?.cdfaRegNumber ?? null,
        dprProductId: record.product?.dprProductId ?? null,
        recordType: record.recordType,
        appliedDate: record.appliedDate,
        appliedStartTime: record.appliedStartTime ?? null,
        appliedEndTime: record.appliedEndTime ?? null,
        acresTreated: record.acresTreated ?? null,
        ratePerAcre: record.ratePerAcre ?? null,
        rateUnit: record.rateUnit ?? null,
        totalProductUsed: record.totalProductUsed ?? null,
        totalProductUnit: record.totalProductUnit ?? null,
        waterVolumeGpa: record.waterVolumeGpa ?? null,
        windSpeedMph: record.windSpeedMph ?? null,
        windDirection: record.windDirection ?? null,
        tempF: record.tempF ?? null,
        targetPest: record.targetPest ?? record.targetScoutingLog?.pestDisplayName ?? null,
        reiExpiry: record.reiExpiry ?? null,
        phiExpiry: record.phiExpiry ?? null,
        organicBlock: record.isOrganicBlock,
        omriConfirmed: Boolean(record.omriConfirmed),
        certifierNotified: Boolean(record.certifierNotified),
        equipmentUsed: record.equipmentUsed ?? null,
        verifiedBy: record.verifiedByProfile?.fullName ?? null,
        verifiedAt: record.verifiedAt ?? null,
        notes: record.notes ?? null,
      })),
    );

    c.header('content-type', 'text/csv; charset=utf-8');
    c.header(
      'content-disposition',
      `attachment; filename=\"dpr-spray-report-${ranch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ranch'}-${new Date().toISOString().slice(0, 10)}.csv\"`,
    );
    return c.body(csv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to export DPR report.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.post('/products', async (c) => {
  try {
    await ensureDefaultProducts();
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeProductInput(body);

    const [product] = await db.insert(products).values(values).returning();
    return c.json(product, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create product.';
    return c.json({ error: message }, 400);
  }
});

app.post('/applications', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    await ensureDefaultProducts();
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeApplicationUpdateInput(body);

    if (!values.productId && !values.productNameManual) {
      return c.json({ error: 'Choose a product or enter a manual product name.' }, 400);
    }

    const [block, product, targetLog] = await Promise.all([
      requireOwnedBlock(orgId, values.blockId),
      requireProduct(values.productId ?? null),
      requireScoutingLog(orgId, values.targetPestScoutingLogId ?? null),
    ]);

    const appliedBaseDate = combineAppliedDateTime(values.appliedDate, values.appliedEndTime ?? values.appliedStartTime);
    const reiExpiry = addHours(appliedBaseDate, product?.reiHours ?? null);
    const phiExpiry = addDays(values.appliedDate, product?.phiDays ?? null);
    const isOrganicBlock = Boolean(block.isOrganic);

    const [record] = await db
      .insert(applicationRecords)
      .values({
        orgId,
        blockId: block.id,
        recordType: values.recordType,
        applicatorName: values.applicatorName,
        applicatorLicense: values.applicatorLicense ?? null,
        productId: product?.id ?? null,
        productNameManual: values.productNameManual ?? null,
        epaRegNumber: product?.epaRegNumber ?? null,
        ratePerAcre: values.ratePerAcre ?? null,
        rateUnit: values.rateUnit ?? null,
        totalProductUsed: values.totalProductUsed ?? null,
        totalProductUnit: values.totalProductUnit ?? null,
        waterVolumeGpa: values.waterVolumeGpa ?? null,
        appliedDate: values.appliedDate,
        appliedStartTime: values.appliedStartTime ?? null,
        appliedEndTime: values.appliedEndTime ?? null,
        windSpeedMph: values.windSpeedMph ?? null,
        windDirection: values.windDirection ?? null,
        tempF: values.tempF ?? null,
        targetPest: values.targetPest ?? targetLog?.pestNameCustom ?? null,
        targetPestScoutingLogId: targetLog?.id ?? null,
        acresTreated: values.acresTreated,
        equipmentUsed: values.equipmentUsed ?? null,
        reiExpiry,
        phiExpiry,
        isOrganicBlock,
        omriConfirmed: isOrganicBlock
          ? (values.omriConfirmed ?? Boolean(product?.isOmriListed || product?.isCdfaOrganic))
          : false,
        certifierNotified: values.certifierNotified ?? false,
        verifiedBy: values.verified ? profileId : null,
        verifiedAt: values.verified ? new Date() : null,
        notes: values.notes ?? null,
        createdBy: profileId,
        updatedBy: profileId,
      })
      .returning();

    const [payload] = await buildApplicationPayloads([record]);
    await enqueueRecommendationRefresh({ orgId, reason: 'application_created' });
    return c.json(payload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create application record.';
    const status = message === 'Block not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.patch('/applications/:id', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  const id = c.req.param('id');

  try {
    await ensureDefaultProducts();
    const existingRecord = await requireApplicationRecord(orgId, id);
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeApplicationUpdateInput(body);

    if (!values.productId && !values.productNameManual) {
      return c.json({ error: 'Choose a product or enter a manual product name.' }, 400);
    }

    const [block, product, targetLog] = await Promise.all([
      requireOwnedBlock(orgId, values.blockId),
      requireProduct(values.productId ?? null),
      requireScoutingLog(orgId, values.targetPestScoutingLogId ?? null),
    ]);

    const appliedBaseDate = combineAppliedDateTime(values.appliedDate, values.appliedEndTime ?? values.appliedStartTime);
    const reiExpiry = addHours(appliedBaseDate, product?.reiHours ?? null);
    const phiExpiry = addDays(values.appliedDate, product?.phiDays ?? null);
    const isOrganicBlock = Boolean(block.isOrganic);
    const verified = values.verified ?? Boolean(existingRecord.verifiedAt);

    const [record] = await db
      .update(applicationRecords)
      .set({
        blockId: block.id,
        recordType: values.recordType,
        applicatorName: values.applicatorName,
        applicatorLicense: values.applicatorLicense ?? null,
        productId: product?.id ?? null,
        productNameManual: values.productNameManual ?? null,
        epaRegNumber: product?.epaRegNumber ?? null,
        ratePerAcre: values.ratePerAcre ?? null,
        rateUnit: values.rateUnit ?? null,
        totalProductUsed: values.totalProductUsed ?? null,
        totalProductUnit: values.totalProductUnit ?? null,
        waterVolumeGpa: values.waterVolumeGpa ?? null,
        appliedDate: values.appliedDate,
        appliedStartTime: values.appliedStartTime ?? null,
        appliedEndTime: values.appliedEndTime ?? null,
        targetPest: values.targetPest ?? targetLog?.pestNameCustom ?? null,
        targetPestScoutingLogId: targetLog?.id ?? null,
        acresTreated: values.acresTreated,
        equipmentUsed: values.equipmentUsed ?? null,
        reiExpiry,
        phiExpiry,
        isOrganicBlock,
        omriConfirmed: isOrganicBlock
          ? (values.omriConfirmed ?? Boolean(product?.isOmriListed || product?.isCdfaOrganic))
          : false,
        certifierNotified: values.certifierNotified ?? false,
        verifiedBy: verified ? profileId : null,
        verifiedAt: verified ? new Date() : null,
        notes: values.notes ?? null,
        updatedBy: profileId,
        updatedAt: new Date(),
      })
      .where(and(eq(applicationRecords.id, id), eq(applicationRecords.orgId, orgId)))
      .returning();

    const [payload] = await buildApplicationPayloads([record]);
    await enqueueRecommendationRefresh({ orgId, reason: 'application_updated' });
    return c.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update application record.';
    const status =
      message === 'Block not found for this organization.' ||
      message === 'Application record not found for this organization.'
        ? 404
        : 400;
    return c.json({ error: message }, status);
  }
});

export default app;
