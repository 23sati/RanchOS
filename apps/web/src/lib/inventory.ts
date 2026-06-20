export type InventoryCategory =
  | 'fertilizer'
  | 'pesticide'
  | 'soil_amendment'
  | 'fuel'
  | 'irrigation'
  | 'parts'
  | 'packaging'
  | 'tool'
  | 'safety'
  | 'other';

export type InventoryUnit =
  | 'gallon'
  | 'quart'
  | 'pound'
  | 'ounce'
  | 'ton'
  | 'bag'
  | 'case'
  | 'each'
  | 'foot'
  | 'bin';

export type InventoryLocationType =
  | 'warehouse'
  | 'shop'
  | 'yard'
  | 'field'
  | 'vehicle'
  | 'cold_storage'
  | 'other';

export type InventoryMovementType =
  | 'purchase'
  | 'transfer'
  | 'usage'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'return'
  | 'waste';

export type InventoryHealthStatus = 'healthy' | 'low' | 'expiring' | 'expired' | 'out';

export const inventoryCategoryOptions = [
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'pesticide', label: 'Pesticide' },
  { value: 'soil_amendment', label: 'Soil amendment' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'irrigation', label: 'Irrigation' },
  { value: 'parts', label: 'Parts' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'tool', label: 'Tool' },
  { value: 'safety', label: 'Safety' },
  { value: 'other', label: 'Other' },
] as const satisfies ReadonlyArray<{ value: InventoryCategory; label: string }>;

export const inventoryUnitOptions = [
  { value: 'gallon', label: 'Gallon' },
  { value: 'quart', label: 'Quart' },
  { value: 'pound', label: 'Pound' },
  { value: 'ounce', label: 'Ounce' },
  { value: 'ton', label: 'Ton' },
  { value: 'bag', label: 'Bag' },
  { value: 'case', label: 'Case' },
  { value: 'each', label: 'Each' },
  { value: 'foot', label: 'Foot' },
  { value: 'bin', label: 'Bin' },
] as const satisfies ReadonlyArray<{ value: InventoryUnit; label: string }>;

export const inventoryLocationTypeOptions = [
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'shop', label: 'Shop' },
  { value: 'yard', label: 'Yard' },
  { value: 'field', label: 'Field cache' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'cold_storage', label: 'Cold storage' },
  { value: 'other', label: 'Other' },
] as const satisfies ReadonlyArray<{ value: InventoryLocationType; label: string }>;

export const inventoryMovementTypeOptions = [
  { value: 'purchase', label: 'Purchase / receive' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'usage', label: 'Usage' },
  { value: 'adjustment_in', label: 'Adjustment in' },
  { value: 'adjustment_out', label: 'Adjustment out' },
  { value: 'return', label: 'Return' },
  { value: 'waste', label: 'Waste / disposal' },
] as const satisfies ReadonlyArray<{ value: InventoryMovementType; label: string }>;

export type InventoryBlockRecord = {
  id: string;
  name: string;
  ranchId: string;
  cropType: string;
  variety: string;
  active: boolean | null;
};

export type InventoryItemRecord = {
  id: string;
  orgId: string;
  sku: string | null;
  name: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  manufacturer: string | null;
  supplier: string | null;
  description: string | null;
  storageNotes: string | null;
  reorderPoint: string | null;
  targetStock: string | null;
  defaultUnitCost: string | null;
  lotTracking: boolean;
  restrictedUse: boolean;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  stockSummary: {
    quantityOnHand: number;
    stockValue: number;
    locationCount: number;
    lotCount: number;
    expiringLots: number;
    expiredLots: number;
    isLowStock: boolean;
    isOutOfStock: boolean;
  };
};

export type InventoryLocationRecord = {
  id: string;
  orgId: string;
  ranchId: string | null;
  name: string;
  code: string | null;
  locationType: InventoryLocationType;
  notes: string | null;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  ranchName: string | null;
  stockSummary: {
    lotCount: number;
    quantityOnHand: number;
    stockValue: number;
  };
};

export type InventoryStockRecord = {
  id: string;
  orgId: string;
  itemId: string;
  locationId: string;
  lotCode: string | null;
  expirationDate: string | null;
  receivedDate: string | null;
  quantityOnHand: string;
  unitCost: string | null;
  vendorName: string | null;
  referenceNumber: string | null;
  notes: string | null;
  active: boolean;
  lastMovementAt: string | null;
  lastCountedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  item: InventoryItemRecord | null;
  location: (InventoryLocationRecord & { ranchName: string | null }) | null;
  healthStatus: InventoryHealthStatus;
  stockValue: number;
  daysToExpiration: number | null;
};

export type InventoryMovementRecord = {
  id: string;
  orgId: string;
  itemId: string;
  movementType: InventoryMovementType;
  fromStockId: string | null;
  toStockId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  blockId: string | null;
  quantity: string;
  unitCost: string | null;
  lotCode: string | null;
  expirationDate: string | null;
  referenceNumber: string | null;
  vendorName: string | null;
  notes: string | null;
  occurredAt: string;
  performedBy: string;
  createdAt: string | null;
  item: {
    id: string;
    name: string;
    sku: string | null;
    category: InventoryCategory;
    unit: InventoryUnit;
  } | null;
  fromLocation: {
    id: string;
    name: string;
    ranchName: string | null;
  } | null;
  toLocation: {
    id: string;
    name: string;
    ranchName: string | null;
  } | null;
  block: {
    id: string;
    name: string;
    ranchId: string;
    ranchName: string | null;
  } | null;
  performedByProfile: {
    id: string;
    fullName: string;
  } | null;
};

export type InventoryDashboardPayload = {
  items: InventoryItemRecord[];
  locations: InventoryLocationRecord[];
  stocks: InventoryStockRecord[];
  movements: InventoryMovementRecord[];
  blocks: InventoryBlockRecord[];
  summary: {
    totalItems: number;
    activeLocations: number;
    totalStockValue: number;
    lowStockItems: number;
    outOfStockItems: number;
    expiringLots: number;
    expiredLots: number;
    trackedLots: number;
    recentUsageQuantity: number;
  };
  categorySummary: Array<{
    category: InventoryCategory;
    itemCount: number;
    quantityOnHand: number;
    stockValue: number;
    lowStockItems: number;
  }>;
};

export type InventoryItemFormValues = {
  name: string;
  sku: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  manufacturer: string;
  supplier: string;
  description: string;
  storageNotes: string;
  reorderPoint: string;
  targetStock: string;
  defaultUnitCost: string;
  lotTracking: boolean;
  restrictedUse: boolean;
  active: boolean;
};

export type InventoryLocationFormValues = {
  name: string;
  code: string;
  ranchId: string;
  locationType: InventoryLocationType;
  notes: string;
  active: boolean;
};

export type InventoryMovementFormValues = {
  itemId: string;
  movementType: InventoryMovementType;
  fromStockId: string;
  toLocationId: string;
  blockId: string;
  quantity: string;
  unitCost: string;
  lotCode: string;
  expirationDate: string;
  receivedDate: string;
  referenceNumber: string;
  vendorName: string;
  notes: string;
  occurredAt: string;
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

function nullableId(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

export function defaultInventoryItemFormValues(): InventoryItemFormValues {
  return {
    name: '',
    sku: '',
    category: 'parts',
    unit: 'each',
    manufacturer: '',
    supplier: '',
    description: '',
    storageNotes: '',
    reorderPoint: '',
    targetStock: '',
    defaultUnitCost: '',
    lotTracking: true,
    restrictedUse: false,
    active: true,
  };
}

export function defaultInventoryLocationFormValues(): InventoryLocationFormValues {
  return {
    name: '',
    code: '',
    ranchId: '',
    locationType: 'warehouse',
    notes: '',
    active: true,
  };
}

export function defaultInventoryMovementFormValues(): InventoryMovementFormValues {
  return {
    itemId: '',
    movementType: 'purchase',
    fromStockId: '',
    toLocationId: '',
    blockId: '',
    quantity: '',
    unitCost: '',
    lotCode: '',
    expirationDate: '',
    receivedDate: '',
    referenceNumber: '',
    vendorName: '',
    notes: '',
    occurredAt: new Date().toISOString().slice(0, 16),
  };
}

export function inventoryItemToFormValues(item: InventoryItemRecord): InventoryItemFormValues {
  return {
    name: item.name,
    sku: item.sku ?? '',
    category: item.category,
    unit: item.unit,
    manufacturer: item.manufacturer ?? '',
    supplier: item.supplier ?? '',
    description: item.description ?? '',
    storageNotes: item.storageNotes ?? '',
    reorderPoint: item.reorderPoint ?? '',
    targetStock: item.targetStock ?? '',
    defaultUnitCost: item.defaultUnitCost ?? '',
    lotTracking: item.lotTracking,
    restrictedUse: item.restrictedUse,
    active: item.active,
  };
}

export function inventoryLocationToFormValues(location: InventoryLocationRecord): InventoryLocationFormValues {
  return {
    name: location.name,
    code: location.code ?? '',
    ranchId: location.ranchId ?? '',
    locationType: location.locationType,
    notes: location.notes ?? '',
    active: location.active,
  };
}

function buildInventoryItemPayload(values: InventoryItemFormValues) {
  return {
    name: values.name.trim(),
    sku: nullableString(values.sku),
    category: values.category,
    unit: values.unit,
    manufacturer: nullableString(values.manufacturer),
    supplier: nullableString(values.supplier),
    description: nullableString(values.description),
    storageNotes: nullableString(values.storageNotes),
    reorderPoint: nullableString(values.reorderPoint),
    targetStock: nullableString(values.targetStock),
    defaultUnitCost: nullableString(values.defaultUnitCost),
    lotTracking: values.lotTracking,
    restrictedUse: values.restrictedUse,
    active: values.active,
  };
}

function buildInventoryLocationPayload(values: InventoryLocationFormValues) {
  return {
    name: values.name.trim(),
    code: nullableString(values.code),
    ranchId: nullableId(values.ranchId),
    locationType: values.locationType,
    notes: nullableString(values.notes),
    active: values.active,
  };
}

function buildInventoryMovementPayload(values: InventoryMovementFormValues) {
  return {
    itemId: values.itemId,
    movementType: values.movementType,
    fromStockId: nullableId(values.fromStockId),
    toLocationId: nullableId(values.toLocationId),
    blockId: nullableId(values.blockId),
    quantity: values.quantity.trim(),
    unitCost: nullableString(values.unitCost),
    lotCode: nullableString(values.lotCode),
    expirationDate: nullableString(values.expirationDate),
    receivedDate: nullableString(values.receivedDate),
    referenceNumber: nullableString(values.referenceNumber),
    vendorName: nullableString(values.vendorName),
    notes: nullableString(values.notes),
    occurredAt: values.occurredAt ? new Date(values.occurredAt).toISOString() : null,
  };
}

export async function fetchInventoryDashboard() {
  return request<InventoryDashboardPayload>('/api/v1/inventory', {
    method: 'GET',
  });
}

export async function createInventoryItem(values: InventoryItemFormValues) {
  return request<InventoryItemRecord>('/api/v1/inventory/items', {
    method: 'POST',
    body: JSON.stringify(buildInventoryItemPayload(values)),
  });
}

export async function updateInventoryItem(id: string, values: InventoryItemFormValues) {
  return request<InventoryItemRecord>(`/api/v1/inventory/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(buildInventoryItemPayload(values)),
  });
}

export async function createInventoryLocation(values: InventoryLocationFormValues) {
  return request<InventoryLocationRecord>('/api/v1/inventory/locations', {
    method: 'POST',
    body: JSON.stringify(buildInventoryLocationPayload(values)),
  });
}

export async function updateInventoryLocation(id: string, values: InventoryLocationFormValues) {
  return request<InventoryLocationRecord>(`/api/v1/inventory/locations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(buildInventoryLocationPayload(values)),
  });
}

export async function createInventoryMovement(values: InventoryMovementFormValues) {
  return request<InventoryMovementRecord>('/api/v1/inventory/movements', {
    method: 'POST',
    body: JSON.stringify(buildInventoryMovementPayload(values)),
  });
}

export function formatInventoryCategory(category: InventoryCategory) {
  return inventoryCategoryOptions.find((option) => option.value === category)?.label ?? category;
}

export function formatInventoryUnit(unit: InventoryUnit) {
  return inventoryUnitOptions.find((option) => option.value === unit)?.label ?? unit;
}

export function formatInventoryLocationType(locationType: InventoryLocationType) {
  return inventoryLocationTypeOptions.find((option) => option.value === locationType)?.label ?? locationType;
}

export function formatInventoryMovementType(movementType: InventoryMovementType) {
  return inventoryMovementTypeOptions.find((option) => option.value === movementType)?.label ?? movementType;
}

export function formatInventoryQuantity(value: number | string | null | undefined, digits = 2) {
  const numeric = typeof value === 'number' ? value : value ? Number(value) : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}

export function formatInventoryCurrency(value: number | string | null | undefined) {
  const numeric = typeof value === 'number' ? value : value ? Number(value) : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatInventoryDate(value: string | null | undefined) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatInventoryDateTime(value: string | null | undefined) {
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

export function formatInventoryHealthStatus(status: InventoryHealthStatus) {
  if (status === 'low') {
    return 'Low stock';
  }

  if (status === 'expiring') {
    return 'Expiring soon';
  }

  if (status === 'expired') {
    return 'Expired';
  }

  if (status === 'out') {
    return 'Out of stock';
  }

  return 'Healthy';
}
