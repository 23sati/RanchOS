export const applicationRecordTypeOptions = [
  { value: 'pesticide', label: 'Pesticide' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'soil_amendment', label: 'Soil amendment' },
] as const;

export type ApplicationRecordType = (typeof applicationRecordTypeOptions)[number]['value'];

export type ComplianceBlockRecord = {
  id: string;
  name: string;
  ranchId: string;
  cropType: string;
  variety: string;
  acreage: string | null;
  treeCount: number | null;
  isOrganic: boolean;
  active: boolean | null;
  apn: string | null;
  organicSince: string | null;
};

export type PesticideInventoryItemOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  supplier: string | null;
  manufacturer: string | null;
};

export type ProductRecord = {
  id: string;
  productName: string;
  manufacturer: string | null;
  epaRegNumber: string | null;
  cdfaRegNumber: string | null;
  dprProductId: string | null;
  inventoryItemId: string | null;
  labelUrl: string | null;
  activeIngredients: Array<{ name: string; percentage: number | null }> | null;
  reiHours: number | null;
  phiDays: number | null;
  formulation: string | null;
  applicableCrops: string[] | null;
  targetPests: string[] | null;
  restrictedUse: boolean | null;
  isOmriListed: boolean | null;
  isCdfaOrganic: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  inventoryItem: {
    id: string;
    name: string;
    unit: string;
    category: string;
  } | null;
  inventorySummary: {
    quantityOnHand: number;
    stockValue: number;
    stockRowCount: number;
  } | null;
};

export type ComplianceScoutingSummary = {
  id: string;
  blockId: string;
  blockName: string;
  scoutedAt: string;
  pestNameCustom: string | null;
  pestSpeciesId: string | null;
  rating: string | null;
  pestSpeciesName: string | null;
  pestDisplayName: string;
};

export type CompliancePesticideStock = {
  id: string;
  itemId: string;
  quantityOnHand: string | null;
  lotCode: string | null;
  expirationDate: string | null;
  locationId: string;
  locationName: string;
  inventoryUnit: string | null;
  itemName: string;
};

export type ApplicationAutomation = {
  blockingIssues: string[];
  warnings: string[];
  reiActive: boolean;
  phiActive: boolean;
  reiCountdownHours: number | null;
  phiCountdownDays: number | null;
  dprReady: boolean;
  verificationEligible: boolean;
  inventoryStatus: 'not_applicable' | 'unmapped' | 'pending' | 'synced' | 'mismatch' | 'insufficient_stock';
  calculatedTotalProductUsed: string | null;
  totalProductVariance: string | null;
};

export type ApplicationRecord = {
  id: string;
  orgId: string;
  blockId: string;
  taskId: string | null;
  recordType: ApplicationRecordType;
  applicatorName: string;
  applicatorLicense: string | null;
  productId: string | null;
  productNameManual: string | null;
  epaRegNumber: string | null;
  sourceInventoryStockId: string | null;
  ratePerAcre: string | null;
  rateUnit: string | null;
  totalProductUsed: string | null;
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
  reiExpiry: string | null;
  phiExpiry: string | null;
  isOrganicBlock: boolean;
  omriConfirmed: boolean | null;
  certifierNotified: boolean | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  block: {
    id: string;
    name: string;
    ranchId: string;
    cropType: string;
    variety: string;
    acreage: string | null;
    isOrganic: boolean;
    apn: string | null;
    organicSince: string | null;
    county: string | null;
    ranchName: string;
  } | null;
  ranch: {
    id: string;
    name: string;
    county: string | null;
  } | null;
  product: ProductRecord | null;
  targetScoutingLog: {
    id: string;
    pestNameCustom: string | null;
    pestSpeciesId: string | null;
    scoutedAt: string;
    pestSpeciesName: string | null;
    pestDisplayName: string;
  } | null;
  verifiedByProfile: {
    id: string;
    fullName: string;
    role: string;
  } | null;
  sourceInventoryStock: CompliancePesticideStock | null;
  linkedInventoryMovement: {
    id: string;
    applicationRecordId: string;
    quantity: string | null;
    fromStockId: string | null;
    occurredAt: string | null;
  } | null;
  productDisplayName: string;
  automation: ApplicationAutomation;
};

export type ComplianceDashboardPayload = {
  blocks: ComplianceBlockRecord[];
  products: ProductRecord[];
  scoutingLogs: ComplianceScoutingSummary[];
  applications: ApplicationRecord[];
  pesticideInventoryItems: PesticideInventoryItemOption[];
  pesticideInventoryStocks: CompliancePesticideStock[];
  reiCalendar: Array<{
    applicationId: string;
    blockId: string;
    blockName: string;
    ranchName: string | null;
    productName: string;
    reiExpiry: string | null;
    reiCountdownHours: number | null;
    verified: boolean;
  }>;
  annualSummary: {
    activeIngredients: Array<{
      ingredientName: string;
      applicationCount: number;
      totalAcres: number;
      totalProductUsed: number;
    }>;
    counties: Array<{
      county: string;
      applicationCount: number;
      totalAcres: number;
      totalProductUsed: number;
    }>;
  };
  organicSummary: {
    certifierName: string;
    organicBlocks: Array<{
      id: string;
      name: string;
      acreage: string | null;
      apn: string | null;
      organicSince: string | null;
    }>;
    applications: Array<{
      applicationId: string;
      blockName: string;
      productName: string;
      omriApproved: boolean;
      certifierNotified: boolean;
      appliedDate: string;
      applicatorName: string;
      rate: string;
      totalUsed: string;
      blockingIssues: string[];
    }>;
  };
  automationQueue: Array<{
    applicationId: string;
    blockName: string;
    ranchName: string | null;
    productName: string;
    appliedDate: string;
    verified: boolean;
    blockingIssues: string[];
    warnings: string[];
    inventoryStatus: ApplicationAutomation['inventoryStatus'];
  }>;
  summary: {
    products: number;
    applications: number;
    pesticideApplications: number;
    dprReady: number;
    blockedPesticides: number;
    activeRei: number;
    activePhi: number;
    organicApplications: number;
    syncedInventoryRecords: number;
    restrictedUseApplications: number;
  };
};

export type ProductFormValues = {
  productName: string;
  manufacturer: string;
  epaRegNumber: string;
  cdfaRegNumber: string;
  dprProductId: string;
  inventoryItemId: string;
  labelUrl: string;
  reiHours: string;
  phiDays: string;
  formulation: string;
  activeIngredients: string;
  targetPests: string;
  restrictedUse: boolean;
  isOmriListed: boolean;
  isCdfaOrganic: boolean;
};

export type ApplicationFormValues = {
  blockId: string;
  recordType: ApplicationRecordType;
  applicatorName: string;
  applicatorLicense: string;
  productId: string;
  productNameManual: string;
  epaRegNumber: string;
  sourceInventoryStockId: string;
  ratePerAcre: string;
  rateUnit: string;
  totalProductUsed: string;
  totalProductUnit: string;
  waterVolumeGpa: string;
  appliedDate: string;
  appliedStartTime: string;
  appliedEndTime: string;
  windSpeedMph: string;
  windDirection: string;
  tempF: string;
  targetPest: string;
  targetPestScoutingLogId: string;
  acresTreated: string;
  equipmentUsed: string;
  omriConfirmed: boolean;
  certifierNotified: boolean;
  verified: boolean;
  notes: string;
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

function parseCommaList(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function parseActiveIngredients(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, percentagePart] = line.split('|').map((token) => token.trim());
      return {
        name: namePart,
        percentage: percentagePart ? Number(percentagePart) : null,
      };
    })
    .filter((entry) => entry.name);
}

export function defaultProductFormValues(): ProductFormValues {
  return {
    productName: '',
    manufacturer: '',
    epaRegNumber: '',
    cdfaRegNumber: '',
    dprProductId: '',
    inventoryItemId: '',
    labelUrl: '',
    reiHours: '',
    phiDays: '',
    formulation: '',
    activeIngredients: '',
    targetPests: '',
    restrictedUse: false,
    isOmriListed: false,
    isCdfaOrganic: false,
  };
}

export function productRecordToFormValues(product: ProductRecord): ProductFormValues {
  return {
    productName: product.productName,
    manufacturer: product.manufacturer ?? '',
    epaRegNumber: product.epaRegNumber ?? '',
    cdfaRegNumber: product.cdfaRegNumber ?? '',
    dprProductId: product.dprProductId ?? '',
    inventoryItemId: product.inventoryItemId ?? '',
    labelUrl: product.labelUrl ?? '',
    reiHours: product.reiHours?.toString() ?? '',
    phiDays: product.phiDays?.toString() ?? '',
    formulation: product.formulation ?? '',
    activeIngredients: (product.activeIngredients ?? [])
      .map((entry) => `${entry.name}${entry.percentage !== null ? ` | ${entry.percentage}` : ''}`)
      .join('\n'),
    targetPests: (product.targetPests ?? []).join(', '),
    restrictedUse: Boolean(product.restrictedUse),
    isOmriListed: Boolean(product.isOmriListed),
    isCdfaOrganic: Boolean(product.isCdfaOrganic),
  };
}

export function defaultApplicationFormValues(blockId = ''): ApplicationFormValues {
  const today = new Date().toISOString().slice(0, 10);
  return {
    blockId,
    recordType: 'pesticide',
    applicatorName: '',
    applicatorLicense: '',
    productId: '',
    productNameManual: '',
    epaRegNumber: '',
    sourceInventoryStockId: '',
    ratePerAcre: '',
    rateUnit: 'oz',
    totalProductUsed: '',
    totalProductUnit: 'oz',
    waterVolumeGpa: '',
    appliedDate: today,
    appliedStartTime: '',
    appliedEndTime: '',
    windSpeedMph: '',
    windDirection: '',
    tempF: '',
    targetPest: '',
    targetPestScoutingLogId: '',
    acresTreated: '',
    equipmentUsed: '',
    omriConfirmed: false,
    certifierNotified: false,
    verified: false,
    notes: '',
  };
}

export function applicationRecordToFormValues(record: ApplicationRecord): ApplicationFormValues {
  return {
    blockId: record.blockId,
    recordType: record.recordType,
    applicatorName: record.applicatorName,
    applicatorLicense: record.applicatorLicense ?? '',
    productId: record.productId ?? '',
    productNameManual: record.productNameManual ?? '',
    epaRegNumber: record.epaRegNumber ?? '',
    sourceInventoryStockId: record.sourceInventoryStockId ?? '',
    ratePerAcre: record.ratePerAcre ?? '',
    rateUnit: record.rateUnit ?? '',
    totalProductUsed: record.totalProductUsed ?? '',
    totalProductUnit: record.totalProductUnit ?? '',
    waterVolumeGpa: record.waterVolumeGpa ?? '',
    appliedDate: record.appliedDate,
    appliedStartTime: record.appliedStartTime ?? '',
    appliedEndTime: record.appliedEndTime ?? '',
    windSpeedMph: record.windSpeedMph ?? '',
    windDirection: record.windDirection ?? '',
    tempF: record.tempF ?? '',
    targetPest: record.targetPest ?? '',
    targetPestScoutingLogId: record.targetPestScoutingLogId ?? '',
    acresTreated: record.acresTreated,
    equipmentUsed: record.equipmentUsed ?? '',
    omriConfirmed: Boolean(record.omriConfirmed),
    certifierNotified: Boolean(record.certifierNotified),
    verified: Boolean(record.verifiedAt),
    notes: record.notes ?? '',
  };
}

export async function fetchComplianceDashboard(ranchId?: string) {
  const query = ranchId ? `?ranch_id=${encodeURIComponent(ranchId)}` : '';

  return request<ComplianceDashboardPayload>(`/api/v1/compliance${query}`, {
    method: 'GET',
  });
}

export async function createProduct(values: ProductFormValues) {
  return request<ProductRecord>('/api/v1/compliance/products', {
    method: 'POST',
    body: JSON.stringify({
      productName: values.productName,
      manufacturer: nullableString(values.manufacturer),
      epaRegNumber: nullableString(values.epaRegNumber),
      cdfaRegNumber: nullableString(values.cdfaRegNumber),
      dprProductId: nullableString(values.dprProductId),
      inventoryItemId: nullableString(values.inventoryItemId),
      labelUrl: nullableString(values.labelUrl),
      reiHours: nullableString(values.reiHours),
      phiDays: nullableString(values.phiDays),
      formulation: nullableString(values.formulation),
      activeIngredients: parseActiveIngredients(values.activeIngredients),
      targetPests: parseCommaList(values.targetPests),
      restrictedUse: values.restrictedUse,
      isOmriListed: values.isOmriListed,
      isCdfaOrganic: values.isCdfaOrganic,
    }),
  });
}

export async function updateProduct(id: string, values: ProductFormValues) {
  return request<ProductRecord>(`/api/v1/compliance/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      productName: values.productName,
      manufacturer: nullableString(values.manufacturer),
      epaRegNumber: nullableString(values.epaRegNumber),
      cdfaRegNumber: nullableString(values.cdfaRegNumber),
      dprProductId: nullableString(values.dprProductId),
      inventoryItemId: nullableString(values.inventoryItemId),
      labelUrl: nullableString(values.labelUrl),
      reiHours: nullableString(values.reiHours),
      phiDays: nullableString(values.phiDays),
      formulation: nullableString(values.formulation),
      activeIngredients: parseActiveIngredients(values.activeIngredients),
      targetPests: parseCommaList(values.targetPests),
      restrictedUse: values.restrictedUse,
      isOmriListed: values.isOmriListed,
      isCdfaOrganic: values.isCdfaOrganic,
    }),
  });
}

function buildApplicationPayload(values: ApplicationFormValues) {
  return {
    blockId: values.blockId,
    recordType: values.recordType,
    applicatorName: values.applicatorName,
    applicatorLicense: nullableString(values.applicatorLicense),
    productId: nullableString(values.productId),
    productNameManual: nullableString(values.productNameManual),
    epaRegNumber: nullableString(values.epaRegNumber),
    sourceInventoryStockId: nullableString(values.sourceInventoryStockId),
    ratePerAcre: nullableString(values.ratePerAcre),
    rateUnit: nullableString(values.rateUnit),
    totalProductUsed: nullableString(values.totalProductUsed),
    totalProductUnit: nullableString(values.totalProductUnit),
    waterVolumeGpa: nullableString(values.waterVolumeGpa),
    appliedDate: values.appliedDate,
    appliedStartTime: nullableString(values.appliedStartTime),
    appliedEndTime: nullableString(values.appliedEndTime),
    windSpeedMph: nullableString(values.windSpeedMph),
    windDirection: nullableString(values.windDirection),
    tempF: nullableString(values.tempF),
    targetPest: nullableString(values.targetPest),
    targetPestScoutingLogId: nullableString(values.targetPestScoutingLogId),
    acresTreated: values.acresTreated,
    equipmentUsed: nullableString(values.equipmentUsed),
    omriConfirmed: values.omriConfirmed,
    certifierNotified: values.certifierNotified,
    verified: values.verified,
    notes: nullableString(values.notes),
  };
}

export async function createApplicationRecord(values: ApplicationFormValues) {
  return request<ApplicationRecord>('/api/v1/compliance/applications', {
    method: 'POST',
    body: JSON.stringify(buildApplicationPayload(values)),
  });
}

export async function updateApplicationRecord(id: string, values: ApplicationFormValues) {
  return request<ApplicationRecord>(`/api/v1/compliance/applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(buildApplicationPayload(values)),
  });
}

export function getComplianceDprExportHref(ranchId: string) {
  return `/api/v1/compliance/export/dpr.csv?ranch_id=${encodeURIComponent(ranchId)}`;
}

export function getComplianceSprayReportHref(ranchId: string, options?: { organic?: boolean }) {
  const params = new URLSearchParams({ ranch_id: ranchId });
  if (options?.organic) {
    params.set('organic', 'true');
  }

  return `/api/v1/compliance/spray-report.pdf?${params.toString()}`;
}

export function getComplianceOrganicReportHref(year?: string) {
  const params = new URLSearchParams();
  if (year) {
    params.set('year', year);
  }

  return `/api/v1/compliance/organic-report.pdf${params.toString() ? `?${params.toString()}` : ''}`;
}

export function formatRecordTypeLabel(value: ApplicationRecordType) {
  return applicationRecordTypeOptions.find((option) => option.value === value)?.label ?? value;
}

export function formatAppliedDate(value: string) {
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

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatCountdownHours(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'n/a';
  }

  if (value <= 0) {
    return 'Expired';
  }

  return `${value.toFixed(1)}h`;
}

export function formatCountdownDays(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'n/a';
  }

  if (value < 0) {
    return 'Expired';
  }

  return `${value}d`;
}

export function formatQuantity(value: string | number | null | undefined, digits = 2) {
  const numeric = value === null || value === undefined || value === '' ? 0 : Number(value);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}
