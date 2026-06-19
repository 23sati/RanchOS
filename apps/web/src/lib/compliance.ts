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
};

export type ProductRecord = {
  id: string;
  productName: string;
  manufacturer: string | null;
  epaRegNumber: string | null;
  cdfaRegNumber: string | null;
  dprProductId: string | null;
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
  productDisplayName: string;
};

export type ComplianceDashboardPayload = {
  blocks: ComplianceBlockRecord[];
  products: ProductRecord[];
  scoutingLogs: ComplianceScoutingSummary[];
  applications: ApplicationRecord[];
  summary: {
    products: number;
    applications: number;
    activeRei: number;
    activePhi: number;
    organicApplications: number;
  };
};

export type ProductFormValues = {
  productName: string;
  manufacturer: string;
  epaRegNumber: string;
  reiHours: string;
  phiDays: string;
  formulation: string;
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
  ratePerAcre: string;
  rateUnit: string;
  totalProductUsed: string;
  totalProductUnit: string;
  waterVolumeGpa: string;
  appliedDate: string;
  appliedStartTime: string;
  appliedEndTime: string;
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

export function defaultProductFormValues(): ProductFormValues {
  return {
    productName: '',
    manufacturer: '',
    epaRegNumber: '',
    reiHours: '',
    phiDays: '',
    formulation: '',
    targetPests: '',
    restrictedUse: false,
    isOmriListed: false,
    isCdfaOrganic: false,
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
    ratePerAcre: '',
    rateUnit: 'oz/ac',
    totalProductUsed: '',
    totalProductUnit: 'oz',
    waterVolumeGpa: '',
    appliedDate: today,
    appliedStartTime: '',
    appliedEndTime: '',
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
    ratePerAcre: record.ratePerAcre ?? '',
    rateUnit: record.rateUnit ?? '',
    totalProductUsed: record.totalProductUsed ?? '',
    totalProductUnit: record.totalProductUnit ?? '',
    waterVolumeGpa: record.waterVolumeGpa ?? '',
    appliedDate: record.appliedDate,
    appliedStartTime: record.appliedStartTime ?? '',
    appliedEndTime: record.appliedEndTime ?? '',
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
      reiHours: nullableString(values.reiHours),
      phiDays: nullableString(values.phiDays),
      formulation: nullableString(values.formulation),
      targetPests: parseCommaList(values.targetPests),
      restrictedUse: values.restrictedUse,
      isOmriListed: values.isOmriListed,
      isCdfaOrganic: values.isCdfaOrganic,
    }),
  });
}

export async function createApplicationRecord(values: ApplicationFormValues) {
  return request<ApplicationRecord>('/api/v1/compliance/applications', {
    method: 'POST',
    body: JSON.stringify({
      blockId: values.blockId,
      recordType: values.recordType,
      applicatorName: values.applicatorName,
      applicatorLicense: nullableString(values.applicatorLicense),
      productId: nullableString(values.productId),
      productNameManual: nullableString(values.productNameManual),
      ratePerAcre: nullableString(values.ratePerAcre),
      rateUnit: nullableString(values.rateUnit),
      totalProductUsed: nullableString(values.totalProductUsed),
      totalProductUnit: nullableString(values.totalProductUnit),
      waterVolumeGpa: nullableString(values.waterVolumeGpa),
      appliedDate: values.appliedDate,
      appliedStartTime: nullableString(values.appliedStartTime),
      appliedEndTime: nullableString(values.appliedEndTime),
      targetPest: nullableString(values.targetPest),
      targetPestScoutingLogId: nullableString(values.targetPestScoutingLogId),
      acresTreated: values.acresTreated,
      equipmentUsed: nullableString(values.equipmentUsed),
      omriConfirmed: values.omriConfirmed,
      certifierNotified: values.certifierNotified,
      verified: values.verified,
      notes: nullableString(values.notes),
    }),
  });
}

export async function updateApplicationRecord(id: string, values: ApplicationFormValues) {
  return request<ApplicationRecord>(`/api/v1/compliance/applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      blockId: values.blockId,
      recordType: values.recordType,
      applicatorName: values.applicatorName,
      applicatorLicense: nullableString(values.applicatorLicense),
      productId: nullableString(values.productId),
      productNameManual: nullableString(values.productNameManual),
      ratePerAcre: nullableString(values.ratePerAcre),
      rateUnit: nullableString(values.rateUnit),
      totalProductUsed: nullableString(values.totalProductUsed),
      totalProductUnit: nullableString(values.totalProductUnit),
      waterVolumeGpa: nullableString(values.waterVolumeGpa),
      appliedDate: values.appliedDate,
      appliedStartTime: nullableString(values.appliedStartTime),
      appliedEndTime: nullableString(values.appliedEndTime),
      targetPest: nullableString(values.targetPest),
      targetPestScoutingLogId: nullableString(values.targetPestScoutingLogId),
      acresTreated: values.acresTreated,
      equipmentUsed: nullableString(values.equipmentUsed),
      omriConfirmed: values.omriConfirmed,
      certifierNotified: values.certifierNotified,
      verified: values.verified,
      notes: nullableString(values.notes),
    }),
  });
}

export function getComplianceDprExportHref(ranchId: string) {
  return `/api/v1/compliance/export/dpr.csv?ranch_id=${encodeURIComponent(ranchId)}`;
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
