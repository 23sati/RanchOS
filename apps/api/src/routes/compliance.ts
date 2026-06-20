import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  applicationRecords,
  blocks,
  inventoryItems,
  inventoryLocations,
  inventoryMovements,
  inventoryStocks,
  organizations,
  pestSpecies,
  productInventoryLinks,
  products,
  profiles,
  ranches,
  scoutingLogs,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import { buildComplianceDprCsv } from '../utils/complianceExport';
import { enqueueRecommendationRefresh } from '../lib/refreshRecommendations';
import { buildDprSprayReportPdf } from '@ranchos/shared/src/compliance/sprayReport';
import { buildOrganicInputLogPdf } from '@ranchos/shared/src/compliance/organicReport';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

type ProductInsert = typeof products.$inferInsert;
type ApplicationInsert = typeof applicationRecords.$inferInsert;
type InventoryMovementInsert = typeof inventoryMovements.$inferInsert;
type RecordType = NonNullable<ApplicationInsert['recordType']>;
type InventoryStatus =
  | 'not_applicable'
  | 'unmapped'
  | 'pending'
  | 'synced'
  | 'mismatch'
  | 'insufficient_stock';
type ComplianceProduct = Pick<
  typeof products.$inferSelect,
  | 'id'
  | 'productName'
  | 'manufacturer'
  | 'epaRegNumber'
  | 'cdfaRegNumber'
  | 'dprProductId'
  | 'labelUrl'
  | 'activeIngredients'
  | 'reiHours'
  | 'phiDays'
  | 'formulation'
  | 'applicableCrops'
  | 'targetPests'
  | 'restrictedUse'
  | 'isOmriListed'
  | 'isCdfaOrganic'
  | 'createdAt'
  | 'updatedAt'
> & {
  inventoryItemId: string | null;
};

type ActiveIngredientInput = {
  name: string;
  percentage: number | null;
};

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
  | 'activeIngredients'
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
    activeIngredients: [{ name: 'Methoxyfenozide', percentage: 22.6 }],
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
    activeIngredients: [{ name: 'Spinosad', percentage: 22.5 }],
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
    activeIngredients: [{ name: 'Cinnamon Oil', percentage: 20 }],
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
    activeIngredients: [{ name: 'Nitrogen', percentage: 32 }],
  },
];

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeNullableId(value: unknown) {
  return normalizeText(value);
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

function normalizeActiveIngredients(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error('Active ingredients must be a list.');
  }

  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const name = normalizeText((entry as Record<string, unknown>).name);
      if (!name) {
        return null;
      }

      const rawPercentage = (entry as Record<string, unknown>).percentage;
      const percentage =
        rawPercentage === null || rawPercentage === undefined || rawPercentage === ''
          ? null
          : Number(rawPercentage);

      if (percentage !== null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) {
        throw new Error('Active ingredient percentage is invalid.');
      }

      return {
        name,
        percentage,
      } satisfies ActiveIngredientInput;
    })
    .filter((entry): entry is ActiveIngredientInput => Boolean(entry));

  return normalized.length > 0 ? normalized : null;
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  return typeof value === 'number' ? value : Number(value);
}

function sanitizeProductInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const productName = !isPartial || 'productName' in body ? normalizeText(body.productName) : undefined;

  if (!isPartial && !productName) {
    throw new Error('Product name is required.');
  }

  if (isPartial && 'productName' in body && !productName) {
    throw new Error('Product name is required.');
  }

  return {
    productName,
    manufacturer: 'manufacturer' in body ? normalizeText(body.manufacturer) : undefined,
    epaRegNumber: 'epaRegNumber' in body ? normalizeText(body.epaRegNumber) : undefined,
    cdfaRegNumber: 'cdfaRegNumber' in body ? normalizeText(body.cdfaRegNumber) : undefined,
    dprProductId: 'dprProductId' in body ? normalizeText(body.dprProductId) : undefined,
    inventoryItemId: 'inventoryItemId' in body ? normalizeNullableId(body.inventoryItemId) : undefined,
    labelUrl: 'labelUrl' in body ? normalizeText(body.labelUrl) : undefined,
    reiHours: 'reiHours' in body ? normalizeInteger(body.reiHours, 'REI hours', { min: 0, max: 999 }) : undefined,
    phiDays: 'phiDays' in body ? normalizeInteger(body.phiDays, 'PHI days', { min: 0, max: 999 }) : undefined,
    formulation: 'formulation' in body ? normalizeText(body.formulation) : undefined,
    activeIngredients: 'activeIngredients' in body ? normalizeActiveIngredients(body.activeIngredients) : undefined,
    applicableCrops: 'applicableCrops' in body ? normalizeStringArray(body.applicableCrops) : undefined,
    targetPests: 'targetPests' in body ? normalizeStringArray(body.targetPests) : undefined,
    restrictedUse: 'restrictedUse' in body ? Boolean(body.restrictedUse) : undefined,
    isOmriListed: 'isOmriListed' in body ? Boolean(body.isOmriListed) : undefined,
    isCdfaOrganic: 'isCdfaOrganic' in body ? Boolean(body.isCdfaOrganic) : undefined,
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
    epaRegNumber: normalizeText(body.epaRegNumber),
    sourceInventoryStockId: normalizeNullableId(body.sourceInventoryStockId),
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
    omriConfirmed: Boolean(body.omriConfirmed),
    certifierNotified: Boolean(body.certifierNotified),
    verified: Boolean(body.verified),
    notes: normalizeText(body.notes),
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

async function requireProduct(orgId: string, productId: string | null) {
  if (!productId) {
    return null;
  }

  const [product] = await db
    .select({
      id: products.id,
      productName: products.productName,
      manufacturer: products.manufacturer,
      epaRegNumber: products.epaRegNumber,
      cdfaRegNumber: products.cdfaRegNumber,
      dprProductId: products.dprProductId,
      inventoryItemId: productInventoryLinks.inventoryItemId,
      labelUrl: products.labelUrl,
      activeIngredients: products.activeIngredients,
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
    .leftJoin(productInventoryLinks, and(eq(productInventoryLinks.productId, products.id), eq(productInventoryLinks.orgId, orgId)))
    .where(eq(products.id, productId));

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

async function requireInventoryItem(orgId: string, inventoryItemId: string | null) {
  if (!inventoryItemId) {
    return null;
  }

  const item = await db.query.inventoryItems.findFirst({
    where: and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.orgId, orgId)),
  });

  if (!item) {
    throw new Error('Inventory item not found.');
  }

  return item;
}

async function requireInventoryStock(orgId: string, stockId: string | null) {
  if (!stockId) {
    return null;
  }

  const [stock] = await db
    .select({
      id: inventoryStocks.id,
      orgId: inventoryStocks.orgId,
      itemId: inventoryStocks.itemId,
      locationId: inventoryStocks.locationId,
      lotCode: inventoryStocks.lotCode,
      expirationDate: inventoryStocks.expirationDate,
      quantityOnHand: inventoryStocks.quantityOnHand,
      unitCost: inventoryStocks.unitCost,
      locationName: inventoryLocations.name,
      inventoryUnit: inventoryItems.unit,
      itemName: inventoryItems.name,
    })
    .from(inventoryStocks)
    .innerJoin(inventoryLocations, eq(inventoryStocks.locationId, inventoryLocations.id))
    .innerJoin(inventoryItems, eq(inventoryStocks.itemId, inventoryItems.id))
    .where(and(eq(inventoryStocks.id, stockId), eq(inventoryStocks.orgId, orgId)));

  if (!stock) {
    throw new Error('Inventory stock row not found for this organization.');
  }

  return stock;
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

function differenceInHours(target: string | Date | null | undefined) {
  if (!target) {
    return null;
  }

  const date = target instanceof Date ? target : new Date(target);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Number(((date.getTime() - Date.now()) / (1000 * 60 * 60)).toFixed(2));
}

function differenceInDays(dateValue: string | null | undefined) {
  if (!dateValue) {
    return null;
  }

  const target = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  return Math.floor((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatCropLabel(cropType: string | null | undefined) {
  if (!cropType) {
    return 'Crop';
  }

  return cropType
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function formatDecimal(value: string | number | null | undefined, digits = 2) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }

  return numeric.toFixed(digits);
}

type ApplicationAutomationInput = {
  recordType: RecordType;
  product: ComplianceProduct | null;
  block: { acreage: string | null; isOrganic: boolean | null } | null;
  epaRegNumber: string | null;
  applicatorLicense: string | null;
  sourceInventoryStock: {
    id: string;
    itemId: string;
    quantityOnHand: string | null;
    inventoryUnit: string | null;
    locationName?: string | null;
  } | null;
  linkedInventoryMovement: {
    id: string;
    quantity: string | null;
    fromStockId: string | null;
  } | null;
  ratePerAcre: string | null;
  totalProductUsed: string | null;
  rateUnit: string | null;
  totalProductUnit: string | null;
  waterVolumeGpa: string | null;
  appliedDate: string;
  appliedStartTime: string | null;
  appliedEndTime: string | null;
  windSpeedMph: string | null;
  windDirection: string | null;
  tempF: string | null;
  targetPest: string | null;
  targetPestScoutingLogId: string | null;
  acresTreated: string;
  equipmentUsed: string | null;
  reiExpiry: string | Date | null;
  phiExpiry: string | null;
  omriConfirmed: boolean | null;
  certifierNotified: boolean | null;
  verifiedAt: string | Date | null;
};

function evaluateApplicationAutomation(input: ApplicationAutomationInput) {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const reiCountdownHours = differenceInHours(input.reiExpiry);
  const phiCountdownDays = differenceInDays(input.phiExpiry);
  const reiActive = reiCountdownHours !== null && reiCountdownHours > 0;
  const phiActive = phiCountdownDays !== null && phiCountdownDays >= 0;
  let inventoryStatus: InventoryStatus = 'not_applicable';
  let calculatedTotalProductUsed: string | null = null;
  let totalProductVariance: string | null = null;

  if (input.recordType === 'pesticide') {
    if (!input.applicatorLicense) blockingIssues.push('Applicator license is required for pesticide records.');
    if (!(input.product?.epaRegNumber ?? input.epaRegNumber)) blockingIssues.push('EPA registration number is required for DPR-ready pesticide records.');
    if (!input.appliedStartTime) blockingIssues.push('Application start time is required.');
    if (!input.appliedEndTime) blockingIssues.push('Application end time is required.');
    if (!input.windSpeedMph) blockingIssues.push('Wind speed is required.');
    if (!input.windDirection) blockingIssues.push('Wind direction is required.');
    if (!input.tempF) blockingIssues.push('Temperature is required.');
    if (!input.ratePerAcre) blockingIssues.push('Rate per acre is required.');
    if (!input.totalProductUsed) blockingIssues.push('Total product used is required.');
    if (!input.totalProductUnit) blockingIssues.push('Total product unit is required.');
    if (!input.waterVolumeGpa) blockingIssues.push('Water volume GPA is required.');
    if (!input.equipmentUsed) blockingIssues.push('Equipment used is required.');
    if (!input.targetPest && !input.targetPestScoutingLogId) blockingIssues.push('Target pest or scouting evidence is required.');

    if (input.appliedStartTime && input.appliedEndTime && input.appliedEndTime < input.appliedStartTime) {
      blockingIssues.push('Application end time cannot be earlier than start time.');
    }

    if (input.block?.acreage && toNumber(input.acresTreated) > toNumber(input.block.acreage)) {
      blockingIssues.push('Acres treated exceed the planted acreage on this block.');
    }

    if (input.ratePerAcre && input.totalProductUsed) {
      const calculated = toNumber(input.ratePerAcre) * toNumber(input.acresTreated);
      calculatedTotalProductUsed = formatDecimal(calculated, 4);
      const variance = Math.abs(calculated - toNumber(input.totalProductUsed));
      totalProductVariance = formatDecimal(variance, 4);
      if (variance > Math.max(0.25, calculated * 0.05)) {
        warnings.push('Rate x acres does not closely match total product used.');
      }
    }

    if (!input.product) {
      warnings.push('Manual product entry should be reconciled into the product catalog before downstream sync.');
    }

    if (input.product?.restrictedUse) {
      warnings.push('Restricted-use pesticide: double-check license, supervision, and posting requirements.');
    }

    const organicApproved = Boolean(input.product?.isOmriListed || input.product?.isCdfaOrganic || input.omriConfirmed);
    if (input.block?.isOrganic) {
      if (!organicApproved) {
        blockingIssues.push('Organic block application needs OMRI or approved-organic confirmation.');
      }

      if (!input.certifierNotified && !organicApproved) {
        warnings.push('Organic certifier notification is recommended for non-approved or restricted materials.');
      }
    }

    if (input.product?.inventoryItemId) {
      if (!input.sourceInventoryStock) {
        inventoryStatus = 'pending';
        blockingIssues.push('Choose the pesticide inventory lot to auto-deduct usage.');
      } else if (input.sourceInventoryStock.itemId !== input.product.inventoryItemId) {
        inventoryStatus = 'mismatch';
        blockingIssues.push('Selected inventory lot is not linked to the chosen pesticide product.');
      } else if (
        input.totalProductUnit &&
        input.sourceInventoryStock.inventoryUnit &&
        input.totalProductUnit.toLowerCase() !== input.sourceInventoryStock.inventoryUnit.toLowerCase()
      ) {
        inventoryStatus = 'mismatch';
        blockingIssues.push('Application total-product unit must match the linked inventory unit for auto-deduction.');
      } else if (toNumber(input.totalProductUsed) > toNumber(input.sourceInventoryStock.quantityOnHand)) {
        inventoryStatus = 'insufficient_stock';
        blockingIssues.push('Selected pesticide lot does not have enough stock to cover total product used.');
      } else if (input.linkedInventoryMovement) {
        const movementMatches =
          input.linkedInventoryMovement.fromStockId === input.sourceInventoryStock.id &&
          formatDecimal(input.linkedInventoryMovement.quantity, 2) === formatDecimal(input.totalProductUsed, 2);
        inventoryStatus = movementMatches ? 'synced' : 'mismatch';
        if (!movementMatches) {
          blockingIssues.push('Inventory auto-deduction is out of sync with the recorded pesticide usage.');
        }
      } else {
        inventoryStatus = 'pending';
      }
    } else if (input.product) {
      inventoryStatus = 'unmapped';
      warnings.push('This pesticide product is not mapped to an inventory item yet.');
    }
  }

  return {
    blockingIssues,
    warnings,
    reiActive,
    phiActive,
    reiCountdownHours,
    phiCountdownDays,
    dprReady: input.recordType === 'pesticide' && blockingIssues.length === 0 && Boolean(input.verifiedAt),
    verificationEligible: blockingIssues.length === 0,
    inventoryStatus,
    calculatedTotalProductUsed,
    totalProductVariance,
  };
}

async function syncApplicationInventoryUsage(
  tx: any,
  options: {
    orgId: string;
    profileId: string;
    applicationRecordId: string;
    blockId: string;
    product: ComplianceProduct | null;
    sourceInventoryStockId: string | null;
    totalProductUsed: string | null;
    totalProductUnit: string | null;
    occurredAt: Date;
    notes: string | null;
  },
) {
  const existingMovementRows = await tx
    .select()
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.orgId, options.orgId), eq(inventoryMovements.applicationRecordId, options.applicationRecordId)));

  const existingMovement = existingMovementRows[0] ?? null;
  if (existingMovement?.fromStockId) {
    const existingSourceRows = await tx
      .select()
      .from(inventoryStocks)
      .where(and(eq(inventoryStocks.orgId, options.orgId), eq(inventoryStocks.id, existingMovement.fromStockId)));
    const existingSource = existingSourceRows[0] ?? null;

    if (existingSource) {
      await tx
        .update(inventoryStocks)
        .set({
          quantityOnHand: formatDecimal(toNumber(existingSource.quantityOnHand) + toNumber(existingMovement.quantity), 2),
          active: true,
          updatedAt: new Date(),
          updatedBy: options.profileId,
          lastMovementAt: new Date(),
        })
        .where(and(eq(inventoryStocks.orgId, options.orgId), eq(inventoryStocks.id, existingSource.id)));
    }

    await tx
      .delete(inventoryMovements)
      .where(and(eq(inventoryMovements.orgId, options.orgId), eq(inventoryMovements.id, existingMovement.id)));
  } else if (existingMovement) {
    await tx
      .delete(inventoryMovements)
      .where(and(eq(inventoryMovements.orgId, options.orgId), eq(inventoryMovements.id, existingMovement.id)));
  }

  if (!options.product?.inventoryItemId || !options.sourceInventoryStockId || !options.totalProductUsed) {
    return null;
  }

  const sourceRows = await tx
    .select({
      id: inventoryStocks.id,
      orgId: inventoryStocks.orgId,
      itemId: inventoryStocks.itemId,
      locationId: inventoryStocks.locationId,
      quantityOnHand: inventoryStocks.quantityOnHand,
      unitCost: inventoryStocks.unitCost,
    })
    .from(inventoryStocks)
    .where(and(eq(inventoryStocks.orgId, options.orgId), eq(inventoryStocks.id, options.sourceInventoryStockId)));

  const sourceStock = sourceRows[0] ?? null;
  if (!sourceStock) {
    throw new Error('Inventory stock row not found for this organization.');
  }

  if (sourceStock.itemId !== options.product.inventoryItemId) {
    throw new Error('Selected inventory lot is not linked to the chosen pesticide product.');
  }

  const quantity = toNumber(options.totalProductUsed);
  if (toNumber(sourceStock.quantityOnHand) < quantity) {
    throw new Error('Selected pesticide lot does not have enough stock to cover total product used.');
  }

  await tx
    .update(inventoryStocks)
    .set({
      quantityOnHand: formatDecimal(toNumber(sourceStock.quantityOnHand) - quantity, 2),
      active: toNumber(sourceStock.quantityOnHand) - quantity > 0,
      updatedAt: new Date(),
      updatedBy: options.profileId,
      lastMovementAt: options.occurredAt,
    })
    .where(and(eq(inventoryStocks.orgId, options.orgId), eq(inventoryStocks.id, sourceStock.id)));

  const [movement] = await tx
    .insert(inventoryMovements)
    .values({
      orgId: options.orgId,
      itemId: sourceStock.itemId,
      movementType: 'usage',
      fromStockId: sourceStock.id,
      fromLocationId: sourceStock.locationId,
      toStockId: null,
      toLocationId: null,
      blockId: options.blockId,
      applicationRecordId: options.applicationRecordId,
      quantity: formatDecimal(quantity, 2),
      unitCost: sourceStock.unitCost ?? null,
      notes: options.notes ? `Auto-deducted from pesticide application: ${options.notes}` : 'Auto-deducted from pesticide application.',
      occurredAt: options.occurredAt,
      performedBy: options.profileId,
    } satisfies InventoryMovementInsert)
    .returning();

  return movement;
}

async function buildApplicationPayloads(orgId: string, recordRows: (typeof applicationRecords.$inferSelect)[]) {
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
  const sourceStockIds = Array.from(
    new Set(recordRows.map((record) => record.sourceInventoryStockId).filter((value): value is string => Boolean(value))),
  );
  const recordIds = recordRows.map((record) => record.id);

  const [blockRows, productRows, scoutingRows, verifierRows, sourceStockRows, movementRows] = await Promise.all([
    db
      .select({
        id: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        isOrganic: blocks.isOrganic,
        apn: blocks.apn,
        organicSince: blocks.organicSince,
        county: ranches.county,
        ranchName: ranches.name,
      })
      .from(blocks)
      .innerJoin(ranches, eq(blocks.ranchId, ranches.id))
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
            inventoryItemId: productInventoryLinks.inventoryItemId,
            labelUrl: products.labelUrl,
            activeIngredients: products.activeIngredients,
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
          .leftJoin(productInventoryLinks, and(eq(productInventoryLinks.productId, products.id), eq(productInventoryLinks.orgId, orgId)))
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
    sourceStockIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: inventoryStocks.id,
            itemId: inventoryStocks.itemId,
            quantityOnHand: inventoryStocks.quantityOnHand,
            lotCode: inventoryStocks.lotCode,
            expirationDate: inventoryStocks.expirationDate,
            locationId: inventoryStocks.locationId,
            locationName: inventoryLocations.name,
            inventoryUnit: inventoryItems.unit,
            itemName: inventoryItems.name,
          })
          .from(inventoryStocks)
          .innerJoin(inventoryLocations, eq(inventoryStocks.locationId, inventoryLocations.id))
          .innerJoin(inventoryItems, eq(inventoryStocks.itemId, inventoryItems.id))
          .where(inArray(inventoryStocks.id, sourceStockIds)),
    db
      .select({
        id: inventoryMovements.id,
        applicationRecordId: inventoryMovements.applicationRecordId,
        quantity: inventoryMovements.quantity,
        fromStockId: inventoryMovements.fromStockId,
        occurredAt: inventoryMovements.occurredAt,
      })
      .from(inventoryMovements)
      .where(inArray(inventoryMovements.applicationRecordId, recordIds)),
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
  const stocksById = new Map(sourceStockRows.map((stock) => [stock.id, stock]));
  const movementsByAppId = new Map(movementRows.map((movement) => [movement.applicationRecordId, movement]));

  return recordRows.map((record) => {
    const block = blocksById.get(record.blockId) ?? null;
    const product = record.productId ? productsById.get(record.productId) ?? null : null;
    const sourceStock = record.sourceInventoryStockId ? stocksById.get(record.sourceInventoryStockId) ?? null : null;
    const linkedMovement = movementsByAppId.get(record.id) ?? null;
    const automation = evaluateApplicationAutomation({
      recordType: record.recordType,
      product: product as ComplianceProduct | null,
      block,
      epaRegNumber: record.epaRegNumber,
      applicatorLicense: record.applicatorLicense,
      sourceInventoryStock: sourceStock
        ? {
            id: sourceStock.id,
            itemId: sourceStock.itemId,
            quantityOnHand: sourceStock.quantityOnHand,
            inventoryUnit: sourceStock.inventoryUnit,
            locationName: sourceStock.locationName,
          }
        : null,
      linkedInventoryMovement: linkedMovement,
      ratePerAcre: record.ratePerAcre,
      totalProductUsed: record.totalProductUsed,
      rateUnit: record.rateUnit,
      totalProductUnit: record.totalProductUnit,
      waterVolumeGpa: record.waterVolumeGpa,
      appliedDate: record.appliedDate,
      appliedStartTime: record.appliedStartTime,
      appliedEndTime: record.appliedEndTime,
      windSpeedMph: record.windSpeedMph,
      windDirection: record.windDirection,
      tempF: record.tempF,
      targetPest: record.targetPest,
      targetPestScoutingLogId: record.targetPestScoutingLogId,
      acresTreated: record.acresTreated,
      equipmentUsed: record.equipmentUsed,
      reiExpiry: record.reiExpiry,
      phiExpiry: record.phiExpiry,
      omriConfirmed: record.omriConfirmed,
      certifierNotified: record.certifierNotified,
      verifiedAt: record.verifiedAt,
    });

    return {
      ...record,
      block,
      ranch: block
        ? {
            id: block.ranchId,
            name: block.ranchName,
            county: block.county,
          }
        : null,
      product,
      targetScoutingLog: record.targetPestScoutingLogId
        ? scoutingById.get(record.targetPestScoutingLogId) ?? null
        : null,
      verifiedByProfile: record.verifiedBy ? verifiersById.get(record.verifiedBy) ?? null : null,
      sourceInventoryStock: sourceStock,
      linkedInventoryMovement: linkedMovement,
      productDisplayName:
        (record.productId ? productsById.get(record.productId)?.productName : null) ??
        record.productNameManual ??
        'Manual entry',
      automation,
    };
  });
}

function filterApplicationsByScope<
  T extends {
    block?: { ranchId: string } | null;
    appliedDate: string;
    recordType: RecordType;
  },
>(rows: T[], filters: { ranchId?: string | null; blockId?: string | null; start?: string | null; end?: string | null; recordType?: RecordType | null }) {
  return rows.filter((row) => {
    if (filters.ranchId && row.block?.ranchId !== filters.ranchId) return false;
    if (filters.blockId && row.block?.ranchId && row.block?.ranchId !== filters.ranchId && filters.ranchId) return false;
    if (filters.blockId && (row as { blockId?: string }).blockId !== filters.blockId) return false;
    if (filters.recordType && row.recordType !== filters.recordType) return false;
    if (filters.start && row.appliedDate < filters.start) return false;
    if (filters.end && row.appliedDate > filters.end) return false;
    return true;
  });
}

function sanitizeDateFilter(value: string | null | undefined, fieldName: string) {
  if (!value) {
    return null;
  }

  return normalizeDate(value, fieldName);
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');
  const ranchId = normalizeText(c.req.query('ranch_id'));

  try {
    await ensureDefaultProducts();
    if (ranchId) {
      await requireOwnedRanch(orgId, ranchId);
    }

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
        apn: blocks.apn,
        organicSince: blocks.organicSince,
      })
      .from(blocks)
      .where(
        ranchId
          ? and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true))
          : and(eq(blocks.orgId, orgId), eq(blocks.active, true)),
      )
      .orderBy(asc(blocks.name));

    const blockIds = blockRows.map((block) => block.id);
    const productRows = await db
      .select({
        id: products.id,
        productName: products.productName,
        manufacturer: products.manufacturer,
        epaRegNumber: products.epaRegNumber,
        cdfaRegNumber: products.cdfaRegNumber,
        dprProductId: products.dprProductId,
        inventoryItemId: productInventoryLinks.inventoryItemId,
        labelUrl: products.labelUrl,
        activeIngredients: products.activeIngredients,
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
      .leftJoin(productInventoryLinks, and(eq(productInventoryLinks.productId, products.id), eq(productInventoryLinks.orgId, orgId)))
      .orderBy(asc(products.productName));

    const productInventoryItemIds = Array.from(
      new Set(productRows.map((product) => product.inventoryItemId).filter((value): value is string => Boolean(value))),
    );

    const [productInventoryItems, productInventoryStocks, scoutingRows, applicationRows, pesticideStockRows, pesticideInventoryItemRows, orgRow] = await Promise.all([
      productInventoryItemIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              id: inventoryItems.id,
              name: inventoryItems.name,
              unit: inventoryItems.unit,
              category: inventoryItems.category,
            })
            .from(inventoryItems)
            .where(inArray(inventoryItems.id, productInventoryItemIds)),
      productInventoryItemIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              itemId: inventoryStocks.itemId,
              quantityOnHand: inventoryStocks.quantityOnHand,
              unitCost: inventoryStocks.unitCost,
            })
            .from(inventoryStocks)
            .where(inArray(inventoryStocks.itemId, productInventoryItemIds)),
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
            .limit(40),
      blockIds.length === 0
        ? Promise.resolve([])
        : db
            .select()
            .from(applicationRecords)
            .where(and(eq(applicationRecords.orgId, orgId), inArray(applicationRecords.blockId, blockIds)))
            .orderBy(desc(applicationRecords.appliedDate), desc(applicationRecords.createdAt)),
      db
        .select({
          id: inventoryStocks.id,
          itemId: inventoryStocks.itemId,
          quantityOnHand: inventoryStocks.quantityOnHand,
          lotCode: inventoryStocks.lotCode,
          expirationDate: inventoryStocks.expirationDate,
          locationId: inventoryStocks.locationId,
          locationName: inventoryLocations.name,
          inventoryUnit: inventoryItems.unit,
          itemName: inventoryItems.name,
        })
        .from(inventoryStocks)
        .innerJoin(inventoryItems, eq(inventoryStocks.itemId, inventoryItems.id))
        .innerJoin(inventoryLocations, eq(inventoryStocks.locationId, inventoryLocations.id))
        .where(and(eq(inventoryStocks.orgId, orgId), eq(inventoryItems.category, 'pesticide')))
        .orderBy(asc(inventoryItems.name), asc(inventoryLocations.name), asc(inventoryStocks.expirationDate)),
      db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          sku: inventoryItems.sku,
          unit: inventoryItems.unit,
          supplier: inventoryItems.supplier,
          manufacturer: inventoryItems.manufacturer,
        })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.orgId, orgId), eq(inventoryItems.category, 'pesticide'), eq(inventoryItems.active, true)))
        .orderBy(asc(inventoryItems.name)),
      db.query.organizations.findFirst({ where: eq(organizations.id, orgId) }),
    ]);

    const inventoryItemsById = new Map(productInventoryItems.map((item) => [item.id, item]));
    const inventoryStocksByItemId = new Map<string, typeof productInventoryStocks>();
    for (const stockRow of productInventoryStocks) {
      const existing = inventoryStocksByItemId.get(stockRow.itemId) ?? [];
      existing.push(stockRow);
      inventoryStocksByItemId.set(stockRow.itemId, existing);
    }

    const productsWithInventory = productRows.map((product) => {
      const inventoryItem = product.inventoryItemId ? inventoryItemsById.get(product.inventoryItemId) ?? null : null;
      const itemStocks = product.inventoryItemId ? inventoryStocksByItemId.get(product.inventoryItemId) ?? [] : [];
      return {
        ...product,
        inventoryItem,
        inventorySummary: inventoryItem
          ? {
              quantityOnHand: Number(itemStocks.reduce((sum, row) => sum + toNumber(row.quantityOnHand), 0).toFixed(2)),
              stockValue: Number(itemStocks.reduce((sum, row) => sum + toNumber(row.quantityOnHand) * toNumber(row.unitCost), 0).toFixed(2)),
              stockRowCount: itemStocks.length,
            }
          : null,
      };
    });

    const applications = await buildApplicationPayloads(orgId, applicationRows);
    const now = new Date();
    const pesticideApplications = applications.filter((record) => record.recordType === 'pesticide');
    const organicApplications = applications.filter((record) => record.isOrganicBlock);
    const reiCalendar = pesticideApplications
      .filter((record) => record.automation.reiActive)
      .sort((left, right) => (left.reiExpiry ?? '').toString().localeCompare((right.reiExpiry ?? '').toString()))
      .map((record) => ({
        applicationId: record.id,
        blockId: record.blockId,
        blockName: record.block?.name ?? 'Block',
        ranchName: record.ranch?.name ?? null,
        productName: record.productDisplayName,
        reiExpiry: record.reiExpiry,
        reiCountdownHours: record.automation.reiCountdownHours,
        verified: Boolean(record.verifiedAt),
      }));

    const activeIngredientMap = new Map<string, { ingredientName: string; applicationCount: number; totalAcres: number; totalProductUsed: number }>();
    for (const record of pesticideApplications) {
      const ingredients = Array.isArray(record.product?.activeIngredients) && record.product.activeIngredients.length > 0
        ? (record.product.activeIngredients as Array<{ name?: string }>).map((entry) => entry?.name).filter((value): value is string => Boolean(value))
        : [record.productDisplayName];

      for (const ingredientName of ingredients) {
        const existing = activeIngredientMap.get(ingredientName) ?? {
          ingredientName,
          applicationCount: 0,
          totalAcres: 0,
          totalProductUsed: 0,
        };
        existing.applicationCount += 1;
        existing.totalAcres += toNumber(record.acresTreated);
        existing.totalProductUsed += toNumber(record.totalProductUsed);
        activeIngredientMap.set(ingredientName, existing);
      }
    }

    const countyMap = new Map<string, { county: string; applicationCount: number; totalAcres: number; totalProductUsed: number }>();
    for (const record of pesticideApplications) {
      const county = record.ranch?.county ?? 'Unknown county';
      const existing = countyMap.get(county) ?? {
        county,
        applicationCount: 0,
        totalAcres: 0,
        totalProductUsed: 0,
      };
      existing.applicationCount += 1;
      existing.totalAcres += toNumber(record.acresTreated);
      existing.totalProductUsed += toNumber(record.totalProductUsed);
      countyMap.set(county, existing);
    }

    const automationQueue = pesticideApplications
      .filter((record) => record.automation.blockingIssues.length > 0 || record.automation.warnings.length > 0)
      .map((record) => ({
        applicationId: record.id,
        blockName: record.block?.name ?? 'Block',
        ranchName: record.ranch?.name ?? null,
        productName: record.productDisplayName,
        appliedDate: record.appliedDate,
        verified: Boolean(record.verifiedAt),
        blockingIssues: record.automation.blockingIssues,
        warnings: record.automation.warnings,
        inventoryStatus: record.automation.inventoryStatus,
      }))
      .slice(0, 30);

    return c.json({
      blocks: blockRows,
      products: productsWithInventory,
      scoutingLogs: scoutingRows.map((log) => ({
        ...log,
        pestDisplayName: log.pestSpeciesName ?? log.pestNameCustom ?? 'Observation',
      })),
      applications,
      pesticideInventoryItems: pesticideInventoryItemRows,
      pesticideInventoryStocks: pesticideStockRows,
      reiCalendar,
      annualSummary: {
        activeIngredients: Array.from(activeIngredientMap.values()).sort((left, right) => right.totalProductUsed - left.totalProductUsed),
        counties: Array.from(countyMap.values()).sort((left, right) => right.totalProductUsed - left.totalProductUsed),
      },
      organicSummary: {
        certifierName:
          orgRow?.certificationBody === 'ccof'
            ? 'CCOF'
            : orgRow?.certificationBody === 'ocia'
              ? 'OCIA'
              : orgRow?.certificationBody === 'oregon_tilth'
                ? 'Oregon Tilth'
                : orgRow?.certificationBody === 'primus'
                  ? 'Primus'
                  : orgRow?.certificationBody ?? 'Organic certifier',
        organicBlocks: blockRows
          .filter((block) => block.isOrganic)
          .map((block) => ({
            id: block.id,
            name: block.name,
            acreage: block.acreage,
            apn: block.apn,
            organicSince: block.organicSince,
          })),
        applications: organicApplications.map((record) => ({
          applicationId: record.id,
          blockName: record.block?.name ?? 'Block',
          productName: record.productDisplayName,
          omriApproved: Boolean(record.product?.isOmriListed || record.product?.isCdfaOrganic || record.omriConfirmed),
          certifierNotified: Boolean(record.certifierNotified),
          appliedDate: record.appliedDate,
          applicatorName: record.applicatorName,
          rate: `${record.ratePerAcre ?? ''} ${record.rateUnit ?? ''}`.trim(),
          totalUsed: `${record.totalProductUsed ?? ''} ${record.totalProductUnit ?? ''}`.trim(),
          blockingIssues: record.automation.blockingIssues,
        })),
      },
      automationQueue,
      summary: {
        products: productsWithInventory.length,
        applications: applications.length,
        pesticideApplications: pesticideApplications.length,
        dprReady: pesticideApplications.filter((record) => record.automation.dprReady).length,
        blockedPesticides: pesticideApplications.filter((record) => record.automation.blockingIssues.length > 0).length,
        activeRei: reiCalendar.length,
        activePhi: pesticideApplications.filter((record) => record.automation.phiActive).length,
        organicApplications: organicApplications.length,
        syncedInventoryRecords: pesticideApplications.filter((record) => record.automation.inventoryStatus === 'synced').length,
        restrictedUseApplications: pesticideApplications.filter((record) => Boolean(record.product?.restrictedUse)).length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load compliance data.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.get('/export/dpr.csv', async (c) => {
  const orgId = c.get('orgId');
  const ranchId = normalizeText(c.req.query('ranch_id'));
  const blockId = normalizeText(c.req.query('block_id'));
  const start = sanitizeDateFilter(c.req.query('start'), 'Start date');
  const end = sanitizeDateFilter(c.req.query('end'), 'End date');

  try {
    if (!ranchId) {
      return c.json({ error: 'ranch_id is required.' }, 400);
    }

    await ensureDefaultProducts();
    const ranch = await requireOwnedRanch(orgId, ranchId);
    if (blockId) {
      await requireOwnedBlock(orgId, blockId);
    }

    const blockRows = await db
      .select({ id: blocks.id })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true)));

    const applicationRows = blockRows.length === 0
      ? []
      : await db
          .select()
          .from(applicationRecords)
          .where(and(eq(applicationRecords.orgId, orgId), inArray(applicationRecords.blockId, blockRows.map((row) => row.id)), eq(applicationRecords.recordType, 'pesticide')))
          .orderBy(desc(applicationRecords.appliedDate), desc(applicationRecords.createdAt));

    const payload = await buildApplicationPayloads(orgId, applicationRows);
    const filtered = filterApplicationsByScope(payload, { ranchId, blockId, start, end, recordType: 'pesticide' });

    const csv = buildComplianceDprCsv(
      filtered.map((record) => ({
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
    c.header('content-disposition', `attachment; filename=\"dpr-spray-report-${new Date().toISOString().slice(0, 10)}.csv\"`);
    return c.body(csv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to export DPR report.';
    const status = message === 'Ranch not found for this organization.' || message === 'Block not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.get('/spray-report.pdf', async (c) => {
  const orgId = c.get('orgId');
  const ranchId = normalizeText(c.req.query('ranch_id'));
  const blockId = normalizeText(c.req.query('block_id'));
  const start = sanitizeDateFilter(c.req.query('start'), 'Start date');
  const end = sanitizeDateFilter(c.req.query('end'), 'End date');
  const organicOnly = c.req.query('organic') === 'true';

  try {
    if (!ranchId) {
      return c.json({ error: 'ranch_id is required.' }, 400);
    }

    await ensureDefaultProducts();
    const ranch = await requireOwnedRanch(orgId, ranchId);
    if (blockId) {
      await requireOwnedBlock(orgId, blockId);
    }

    const blockRows = await db
      .select({ id: blocks.id })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.ranchId, ranchId), eq(blocks.active, true)));

    const applicationRows = blockRows.length === 0
      ? []
      : await db
          .select()
          .from(applicationRecords)
          .where(and(eq(applicationRecords.orgId, orgId), inArray(applicationRecords.blockId, blockRows.map((row) => row.id)), eq(applicationRecords.recordType, 'pesticide')))
          .orderBy(desc(applicationRecords.appliedDate), desc(applicationRecords.createdAt));

    const payload = await buildApplicationPayloads(orgId, applicationRows);
    const filtered = filterApplicationsByScope(payload, { ranchId, blockId, start, end, recordType: 'pesticide' }).filter((record) =>
      organicOnly ? record.isOrganicBlock : true,
    );

    const reportBuffer = buildDprSprayReportPdf(
      {
        growerName: ranch.name,
        operatorName: ranch.name,
        operatorLicense: filtered[0]?.applicatorLicense ?? null,
        reportPeriodLabel: `${start ?? filtered.at(-1)?.appliedDate ?? 'start'} to ${end ?? filtered[0]?.appliedDate ?? 'end'}`,
        organicOperation: organicOnly,
      },
      filtered.map((record) => ({
        dateApplied: record.appliedDate,
        county: record.ranch?.county ?? '',
        studySite: record.block?.name ?? '',
        commoditySite: `${formatCropLabel(record.block?.cropType)}${record.block?.variety ? ` / ${record.block.variety}` : ''}`,
        pest: record.targetPest ?? record.targetScoutingLog?.pestDisplayName ?? '',
        totalAcresPlanted: formatDecimal(record.block?.acreage, 2),
        totalAcresTreated: formatDecimal(record.acresTreated, 2),
        productName: record.productDisplayName,
        epaRegNumber: record.product?.epaRegNumber ?? record.epaRegNumber ?? '',
        amountPerAcre: `${record.ratePerAcre ?? ''} ${record.rateUnit ?? ''}`.trim(),
        totalAmountUsed: `${record.totalProductUsed ?? ''} ${record.totalProductUnit ?? ''}`.trim(),
        applicatorName: record.applicatorName,
        applicatorLicense: record.applicatorLicense ?? '',
        startTime: record.appliedStartTime ?? '',
        endTime: record.appliedEndTime ?? '',
        tempF: formatDecimal(record.tempF, 2),
        windSpeed: formatDecimal(record.windSpeedMph, 2),
        windDirection: record.windDirection ?? '',
        omriListed: record.product?.isOmriListed || record.product?.isCdfaOrganic || record.omriConfirmed ? 'YES' : 'NO',
        certifierNotified: record.certifierNotified ? 'YES' : 'NO',
      })),
    );

    c.header('content-type', 'application/pdf');
    c.header('content-disposition', `attachment; filename=\"spray-report-${new Date().toISOString().slice(0, 10)}.pdf\"`);
    return c.body(reportBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate spray report PDF.';
    const status = message === 'Ranch not found for this organization.' || message === 'Block not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.get('/organic-report.pdf', async (c) => {
  const orgId = c.get('orgId');
  const year = normalizeText(c.req.query('year')) ?? new Date().getFullYear().toString();

  try {
    await ensureDefaultProducts();
    const orgRow = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    const allBlockRows = await db
      .select({
        id: blocks.id,
        name: blocks.name,
        acreage: blocks.acreage,
        apn: blocks.apn,
        organicSince: blocks.organicSince,
        isOrganic: blocks.isOrganic,
      })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.active, true), eq(blocks.isOrganic, true)))
      .orderBy(asc(blocks.name));

    const organicBlockIds = allBlockRows.map((block) => block.id);
    const applicationRows = organicBlockIds.length === 0
      ? []
      : await db
          .select()
          .from(applicationRecords)
          .where(and(eq(applicationRecords.orgId, orgId), inArray(applicationRecords.blockId, organicBlockIds)))
          .orderBy(desc(applicationRecords.appliedDate), desc(applicationRecords.createdAt));

    const payload = (await buildApplicationPayloads(orgId, applicationRows)).filter((record) => record.appliedDate.startsWith(year));
    const reportBuffer = buildOrganicInputLogPdf(
      {
        operationName: orgRow?.name ?? 'Organic operation',
        certifierName:
          orgRow?.certificationBody === 'ccof'
            ? 'CCOF'
            : orgRow?.certificationBody === 'ocia'
              ? 'OCIA'
              : orgRow?.certificationBody === 'oregon_tilth'
                ? 'Oregon Tilth'
                : orgRow?.certificationBody === 'primus'
                  ? 'Primus'
                  : orgRow?.certificationBody ?? 'Organic certifier',
        reportLabel: year,
      },
      allBlockRows.map((block) => ({
        blockName: block.name,
        acreage: formatDecimal(block.acreage, 2),
        apn: block.apn ?? '',
        certifiedSince: block.organicSince ?? '',
      })),
      payload.map((record) => ({
        dateApplied: record.appliedDate,
        blockName: record.block?.name ?? 'Block',
        productName: record.productDisplayName,
        omriStatus: record.product?.isOmriListed || record.product?.isCdfaOrganic || record.omriConfirmed ? 'Approved / confirmed' : 'WARNING - not confirmed',
        applicatorName: record.applicatorName,
        rate: `${record.ratePerAcre ?? ''} ${record.rateUnit ?? ''}`.trim(),
        totalUsed: `${record.totalProductUsed ?? ''} ${record.totalProductUnit ?? ''}`.trim(),
        notes: record.notes ?? '',
      })),
    );

    c.header('content-type', 'application/pdf');
    c.header('content-disposition', `attachment; filename=\"organic-input-log-${year}.pdf\"`);
    return c.body(reportBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate organic report PDF.';
    return c.json({ error: message }, 400);
  }
});

app.post('/products', async (c) => {
  const orgId = c.get('orgId');

  try {
    await ensureDefaultProducts();
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeProductInput(body);

    if (values.inventoryItemId) {
      const inventoryItem = await requireInventoryItem(orgId, values.inventoryItemId);
      if (inventoryItem?.category !== 'pesticide') {
        throw new Error('Linked inventory item must use the pesticide category.');
      }
    }

    const [product] = await db.transaction(async (tx) => {
      const [createdProduct] = await tx.insert(products).values({
        productName: values.productName!,
        manufacturer: values.manufacturer ?? null,
        epaRegNumber: values.epaRegNumber ?? null,
        cdfaRegNumber: values.cdfaRegNumber ?? null,
        dprProductId: values.dprProductId ?? null,
        labelUrl: values.labelUrl ?? null,
        reiHours: values.reiHours ?? null,
        phiDays: values.phiDays ?? null,
        formulation: values.formulation ?? null,
        activeIngredients: values.activeIngredients ?? null,
        applicableCrops: values.applicableCrops ?? [],
        targetPests: values.targetPests ?? [],
        restrictedUse: values.restrictedUse ?? false,
        isOmriListed: values.isOmriListed ?? false,
        isCdfaOrganic: values.isCdfaOrganic ?? false,
      }).returning();

      if (values.inventoryItemId) {
        await tx.insert(productInventoryLinks).values({
          orgId,
          productId: createdProduct.id,
          inventoryItemId: values.inventoryItemId,
          updatedBy: c.get('profileId'),
        });
      }

      return [createdProduct];
    });

    return c.json(product, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create product.';
    return c.json({ error: message }, 400);
  }
});

app.patch('/products/:id', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  const id = c.req.param('id');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeProductInput(body, { partial: true });

    if (values.inventoryItemId) {
      const inventoryItem = await requireInventoryItem(orgId, values.inventoryItemId);
      if (inventoryItem?.category !== 'pesticide') {
        throw new Error('Linked inventory item must use the pesticide category.');
      }
    }

    const [product] = await db.transaction(async (tx) => {
      const [updatedProduct] = await tx
        .update(products)
        .set({
          productName: values.productName ?? undefined,
          manufacturer: values.manufacturer ?? undefined,
          epaRegNumber: values.epaRegNumber ?? undefined,
          cdfaRegNumber: values.cdfaRegNumber ?? undefined,
          dprProductId: values.dprProductId ?? undefined,
          labelUrl: values.labelUrl ?? undefined,
          reiHours: values.reiHours ?? undefined,
          phiDays: values.phiDays ?? undefined,
          formulation: values.formulation ?? undefined,
          activeIngredients: values.activeIngredients ?? undefined,
          applicableCrops: values.applicableCrops ?? undefined,
          targetPests: values.targetPests ?? undefined,
          restrictedUse: values.restrictedUse ?? undefined,
          isOmriListed: values.isOmriListed ?? undefined,
          isCdfaOrganic: values.isCdfaOrganic ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();

      if (!updatedProduct) {
        return [updatedProduct];
      }

      if (values.inventoryItemId !== undefined) {
        await tx.delete(productInventoryLinks).where(and(eq(productInventoryLinks.orgId, orgId), eq(productInventoryLinks.productId, id)));
        if (values.inventoryItemId) {
          await tx.insert(productInventoryLinks).values({
            orgId,
            productId: id,
            inventoryItemId: values.inventoryItemId,
            updatedBy: profileId,
          });
        }
      }

      return [updatedProduct];
    });

    if (!product) {
      return c.json({ error: 'Product not found.' }, 404);
    }

    return c.json(product);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update product.';
    const status = message === 'Product not found.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.post('/applications', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    await ensureDefaultProducts();
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeApplicationInput(body);

    if (!values.productId && !values.productNameManual) {
      return c.json({ error: 'Choose a product or enter a manual product name.' }, 400);
    }

    const [block, product, targetLog, sourceStock] = await Promise.all([
      requireOwnedBlock(orgId, values.blockId),
      requireProduct(orgId, values.productId ?? null),
      requireScoutingLog(orgId, values.targetPestScoutingLogId ?? null),
      requireInventoryStock(orgId, values.sourceInventoryStockId ?? null),
    ]);

    const draftAutomation = evaluateApplicationAutomation({
      recordType: values.recordType,
      product,
      block,
      epaRegNumber: values.productId ? product?.epaRegNumber ?? null : values.epaRegNumber ?? null,
      applicatorLicense: values.applicatorLicense,
      sourceInventoryStock: sourceStock
        ? {
            id: sourceStock.id,
            itemId: sourceStock.itemId,
            quantityOnHand: sourceStock.quantityOnHand,
            inventoryUnit: sourceStock.inventoryUnit,
          }
        : null,
      linkedInventoryMovement: null,
      ratePerAcre: values.ratePerAcre,
      totalProductUsed: values.totalProductUsed,
      rateUnit: values.rateUnit,
      totalProductUnit: values.totalProductUnit,
      waterVolumeGpa: values.waterVolumeGpa,
      appliedDate: values.appliedDate,
      appliedStartTime: values.appliedStartTime,
      appliedEndTime: values.appliedEndTime,
      windSpeedMph: values.windSpeedMph,
      windDirection: values.windDirection,
      tempF: values.tempF,
      targetPest: values.targetPest,
      targetPestScoutingLogId: values.targetPestScoutingLogId,
      acresTreated: values.acresTreated,
      equipmentUsed: values.equipmentUsed,
      reiExpiry: addHours(combineAppliedDateTime(values.appliedDate, values.appliedEndTime ?? values.appliedStartTime), product?.reiHours ?? null),
      phiExpiry: addDays(values.appliedDate, product?.phiDays ?? null),
      omriConfirmed: values.omriConfirmed,
      certifierNotified: values.certifierNotified,
      verifiedAt: values.verified ? new Date() : null,
    });

    if (values.verified && draftAutomation.blockingIssues.length > 0) {
      return c.json({ error: `Cannot verify pesticide record: ${draftAutomation.blockingIssues[0]}` }, 400);
    }

    const appliedBaseDate = combineAppliedDateTime(values.appliedDate, values.appliedEndTime ?? values.appliedStartTime);
    const reiExpiry = addHours(appliedBaseDate, product?.reiHours ?? null);
    const phiExpiry = addDays(values.appliedDate, product?.phiDays ?? null);
    const isOrganicBlock = Boolean(block.isOrganic);

    const [record] = await db.transaction(async (tx) => {
      const [createdRecord] = await tx
        .insert(applicationRecords)
        .values({
          orgId,
          blockId: block.id,
          taskId: null,
          recordType: values.recordType,
          applicatorName: values.applicatorName,
          applicatorLicense: values.applicatorLicense ?? null,
          productId: product?.id ?? null,
          productNameManual: values.productNameManual ?? null,
          epaRegNumber: product?.epaRegNumber ?? values.epaRegNumber ?? null,
          sourceInventoryStockId: values.sourceInventoryStockId ?? null,
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
            : values.omriConfirmed,
          certifierNotified: values.certifierNotified ?? false,
          verifiedBy: values.verified ? profileId : null,
          verifiedAt: values.verified ? new Date() : null,
          notes: values.notes ?? null,
          createdBy: profileId,
          updatedBy: profileId,
        })
        .returning();

      await syncApplicationInventoryUsage(tx, {
        orgId,
        profileId,
        applicationRecordId: createdRecord.id,
        blockId: createdRecord.blockId,
        product,
        sourceInventoryStockId: values.sourceInventoryStockId ?? null,
        totalProductUsed: createdRecord.totalProductUsed,
        totalProductUnit: createdRecord.totalProductUnit,
        occurredAt: appliedBaseDate ?? new Date(),
        notes: createdRecord.notes,
      });

      return [createdRecord];
    });

    const [payload] = await buildApplicationPayloads(orgId, [record]);
    await enqueueRecommendationRefresh({ orgId, reason: 'application_created' });
    return c.json(payload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create application record.';
    const status =
      message === 'Block not found for this organization.' ||
      message === 'Inventory stock row not found for this organization.'
        ? 404
        : 400;
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
    const values = sanitizeApplicationInput(body);

    if (!values.productId && !values.productNameManual) {
      return c.json({ error: 'Choose a product or enter a manual product name.' }, 400);
    }

    const [block, product, targetLog, sourceStock] = await Promise.all([
      requireOwnedBlock(orgId, values.blockId),
      requireProduct(orgId, values.productId ?? null),
      requireScoutingLog(orgId, values.targetPestScoutingLogId ?? null),
      requireInventoryStock(orgId, values.sourceInventoryStockId ?? null),
    ]);

    const nextVerifiedAt = values.verified ? new Date() : null;
    const draftAutomation = evaluateApplicationAutomation({
      recordType: values.recordType,
      product,
      block,
      epaRegNumber: product?.epaRegNumber ?? values.epaRegNumber ?? null,
      applicatorLicense: values.applicatorLicense,
      sourceInventoryStock: sourceStock
        ? {
            id: sourceStock.id,
            itemId: sourceStock.itemId,
            quantityOnHand: sourceStock.quantityOnHand,
            inventoryUnit: sourceStock.inventoryUnit,
          }
        : null,
      linkedInventoryMovement: null,
      ratePerAcre: values.ratePerAcre,
      totalProductUsed: values.totalProductUsed,
      rateUnit: values.rateUnit,
      totalProductUnit: values.totalProductUnit,
      waterVolumeGpa: values.waterVolumeGpa,
      appliedDate: values.appliedDate,
      appliedStartTime: values.appliedStartTime,
      appliedEndTime: values.appliedEndTime,
      windSpeedMph: values.windSpeedMph,
      windDirection: values.windDirection,
      tempF: values.tempF,
      targetPest: values.targetPest,
      targetPestScoutingLogId: values.targetPestScoutingLogId,
      acresTreated: values.acresTreated,
      equipmentUsed: values.equipmentUsed,
      reiExpiry: addHours(combineAppliedDateTime(values.appliedDate, values.appliedEndTime ?? values.appliedStartTime), product?.reiHours ?? null),
      phiExpiry: addDays(values.appliedDate, product?.phiDays ?? null),
      omriConfirmed: values.omriConfirmed,
      certifierNotified: values.certifierNotified,
      verifiedAt: nextVerifiedAt,
    });

    if (values.verified && draftAutomation.blockingIssues.length > 0) {
      return c.json({ error: `Cannot verify pesticide record: ${draftAutomation.blockingIssues[0]}` }, 400);
    }

    const appliedBaseDate = combineAppliedDateTime(values.appliedDate, values.appliedEndTime ?? values.appliedStartTime);
    const reiExpiry = addHours(appliedBaseDate, product?.reiHours ?? null);
    const phiExpiry = addDays(values.appliedDate, product?.phiDays ?? null);
    const isOrganicBlock = Boolean(block.isOrganic);

    const [record] = await db.transaction(async (tx) => {
      const [updatedRecord] = await tx
        .update(applicationRecords)
        .set({
          blockId: block.id,
          recordType: values.recordType,
          applicatorName: values.applicatorName,
          applicatorLicense: values.applicatorLicense ?? null,
          productId: product?.id ?? null,
          productNameManual: values.productNameManual ?? null,
          epaRegNumber: product?.epaRegNumber ?? values.epaRegNumber ?? null,
          sourceInventoryStockId: values.sourceInventoryStockId ?? null,
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
            : values.omriConfirmed,
          certifierNotified: values.certifierNotified ?? false,
          verifiedBy: values.verified ? profileId : null,
          verifiedAt: values.verified ? nextVerifiedAt : null,
          notes: values.notes ?? null,
          updatedBy: profileId,
          updatedAt: new Date(),
        })
        .where(and(eq(applicationRecords.id, id), eq(applicationRecords.orgId, orgId)))
        .returning();

      await syncApplicationInventoryUsage(tx, {
        orgId,
        profileId,
        applicationRecordId: updatedRecord.id,
        blockId: updatedRecord.blockId,
        product,
        sourceInventoryStockId: values.sourceInventoryStockId ?? null,
        totalProductUsed: updatedRecord.totalProductUsed,
        totalProductUnit: updatedRecord.totalProductUnit,
        occurredAt: appliedBaseDate ?? new Date(),
        notes: updatedRecord.notes,
      });

      return [updatedRecord];
    });

    const [payload] = await buildApplicationPayloads(orgId, [record]);
    await enqueueRecommendationRefresh({ orgId, reason: 'application_updated' });
    return c.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update application record.';
    const status =
      message === 'Block not found for this organization.' ||
      message === 'Application record not found for this organization.' ||
      message === 'Inventory stock row not found for this organization.'
        ? 404
        : 400;
    return c.json({ error: message }, status);
  }
});

export default app;
