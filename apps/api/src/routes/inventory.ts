import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  blocks,
  inventoryItems,
  inventoryLocations,
  inventoryMovements,
  inventoryStocks,
  profiles,
  ranches,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

type InventoryItemInsert = typeof inventoryItems.$inferInsert;
type InventoryLocationInsert = typeof inventoryLocations.$inferInsert;
type InventoryMovementInsert = typeof inventoryMovements.$inferInsert;
type InventoryStockRow = typeof inventoryStocks.$inferSelect;
type InventoryMovementType = NonNullable<InventoryMovementInsert['movementType']>;
type InventoryCategory = NonNullable<InventoryItemInsert['category']>;
type InventoryUnit = NonNullable<InventoryItemInsert['unit']>;
type InventoryLocationType = NonNullable<InventoryLocationInsert['locationType']>;

const inventoryCategoryOptions: InventoryCategory[] = [
  'fertilizer',
  'pesticide',
  'soil_amendment',
  'fuel',
  'irrigation',
  'parts',
  'packaging',
  'tool',
  'safety',
  'other',
];

const inventoryUnitOptions: InventoryUnit[] = [
  'gallon',
  'quart',
  'pound',
  'ounce',
  'ton',
  'bag',
  'case',
  'each',
  'foot',
  'bin',
];

const inventoryLocationTypeOptions: InventoryLocationType[] = [
  'warehouse',
  'shop',
  'yard',
  'field',
  'vehicle',
  'cold_storage',
  'other',
];

const inventoryMovementTypeOptions: InventoryMovementType[] = [
  'purchase',
  'transfer',
  'usage',
  'adjustment_in',
  'adjustment_out',
  'return',
  'waste',
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

function normalizeDate(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must be a valid YYYY-MM-DD date.`);
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return normalized;
}

function normalizeTimestamp(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO timestamp.`);
  }

  return parsed;
}

function normalizeDecimal(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; scale?: number; allowZero?: boolean } = {},
) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  const min = options.min ?? 0;
  const allowZero = options.allowZero ?? true;
  if (
    !Number.isFinite(parsed) ||
    parsed < min ||
    (!allowZero && parsed === 0) ||
    (options.max !== undefined && parsed > options.max)
  ) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return parsed.toFixed(options.scale ?? 2);
}

function normalizeBoolean(value: unknown, fieldName: string) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(`${fieldName} is invalid.`);
}

function toNumber(value: string | null | undefined) {
  return value === null || value === undefined ? 0 : Number(value);
}

function isIncomingMovement(type: InventoryMovementType) {
  return type === 'purchase' || type === 'adjustment_in' || type === 'return';
}

function isOutgoingMovement(type: InventoryMovementType) {
  return type === 'usage' || type === 'adjustment_out' || type === 'waste';
}

function sanitizeInventoryItemInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const sku = 'sku' in body ? normalizeText(body.sku) : undefined;
  const name = !isPartial || 'name' in body ? normalizeText(body.name) : undefined;
  const category = 'category' in body ? normalizeEnum(body.category, inventoryCategoryOptions, 'Category') : undefined;
  const unit = 'unit' in body ? normalizeEnum(body.unit, inventoryUnitOptions, 'Unit') : undefined;
  const manufacturer = 'manufacturer' in body ? normalizeText(body.manufacturer) : undefined;
  const supplier = 'supplier' in body ? normalizeText(body.supplier) : undefined;
  const description = 'description' in body ? normalizeText(body.description) : undefined;
  const storageNotes = 'storageNotes' in body ? normalizeText(body.storageNotes) : undefined;
  const reorderPoint =
    'reorderPoint' in body ? normalizeDecimal(body.reorderPoint, 'Reorder point', { min: 0, scale: 2 }) : undefined;
  const targetStock =
    'targetStock' in body ? normalizeDecimal(body.targetStock, 'Target stock', { min: 0, scale: 2 }) : undefined;
  const defaultUnitCost =
    'defaultUnitCost' in body
      ? normalizeDecimal(body.defaultUnitCost, 'Default unit cost', { min: 0, scale: 2 })
      : undefined;
  const lotTracking =
    'lotTracking' in body ? normalizeBoolean(body.lotTracking, 'Lot tracking') : undefined;
  const restrictedUse =
    'restrictedUse' in body ? normalizeBoolean(body.restrictedUse, 'Restricted use') : undefined;
  const active = 'active' in body ? normalizeBoolean(body.active, 'Active') : undefined;

  if (!isPartial && !name) {
    throw new Error('Item name is required.');
  }

  if (isPartial && 'name' in body && !name) {
    throw new Error('Item name is required.');
  }

  if ('category' in body && !category) {
    throw new Error('Category is required.');
  }

  if ('unit' in body && !unit) {
    throw new Error('Unit is required.');
  }

  return {
    sku,
    name,
    category,
    unit,
    manufacturer,
    supplier,
    description,
    storageNotes,
    reorderPoint,
    targetStock,
    defaultUnitCost,
    lotTracking,
    restrictedUse,
    active,
  };
}

function sanitizeInventoryLocationInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const name = !isPartial || 'name' in body ? normalizeText(body.name) : undefined;
  const code = 'code' in body ? normalizeText(body.code) : undefined;
  const ranchId = 'ranchId' in body ? normalizeNullableId(body.ranchId) : undefined;
  const locationType =
    'locationType' in body
      ? normalizeEnum(body.locationType, inventoryLocationTypeOptions, 'Location type')
      : undefined;
  const notes = 'notes' in body ? normalizeText(body.notes) : undefined;
  const active = 'active' in body ? normalizeBoolean(body.active, 'Active') : undefined;

  if (!isPartial && !name) {
    throw new Error('Location name is required.');
  }

  if (isPartial && 'name' in body && !name) {
    throw new Error('Location name is required.');
  }

  if ('locationType' in body && !locationType) {
    throw new Error('Location type is required.');
  }

  return {
    name,
    code,
    ranchId,
    locationType,
    notes,
    active,
  };
}

function sanitizeInventoryMovementInput(body: Record<string, unknown>) {
  const itemId = normalizeText(body.itemId);
  const movementType = normalizeEnum(body.movementType, inventoryMovementTypeOptions, 'Movement type');
  const fromStockId = normalizeNullableId(body.fromStockId);
  const toLocationId = normalizeNullableId(body.toLocationId);
  const blockId = normalizeNullableId(body.blockId);
  const quantity = normalizeDecimal(body.quantity, 'Quantity', { min: 0, scale: 2, allowZero: false });
  const unitCost = normalizeDecimal(body.unitCost, 'Unit cost', { min: 0, scale: 2 });
  const lotCode = normalizeText(body.lotCode);
  const expirationDate = normalizeDate(body.expirationDate, 'Expiration date');
  const receivedDate = normalizeDate(body.receivedDate, 'Received date');
  const referenceNumber = normalizeText(body.referenceNumber);
  const vendorName = normalizeText(body.vendorName);
  const notes = normalizeText(body.notes);
  const occurredAt = normalizeTimestamp(body.occurredAt, 'Occurred at');

  if (!itemId) {
    throw new Error('Item is required.');
  }

  if (!movementType) {
    throw new Error('Movement type is required.');
  }

  if (!quantity) {
    throw new Error('Quantity is required.');
  }

  if (movementType === 'transfer') {
    if (!fromStockId) {
      throw new Error('A source stock row is required for transfers.');
    }

    if (!toLocationId) {
      throw new Error('A destination location is required for transfers.');
    }
  } else if (isIncomingMovement(movementType)) {
    if (!toLocationId) {
      throw new Error('A destination location is required for incoming inventory.');
    }
  } else if (isOutgoingMovement(movementType) && !fromStockId) {
    throw new Error('A source stock row is required for outgoing inventory.');
  }

  return {
    itemId,
    movementType,
    fromStockId,
    toLocationId,
    blockId,
    quantity,
    unitCost,
    lotCode,
    expirationDate,
    receivedDate,
    referenceNumber,
    vendorName,
    notes,
    occurredAt,
  };
}

async function requireInventoryItem(orgId: string, itemId: string) {
  const item = await db.query.inventoryItems.findFirst({
    where: and(eq(inventoryItems.id, itemId), eq(inventoryItems.orgId, orgId)),
  });

  if (!item) {
    throw new Error('Inventory item not found for this organization.');
  }

  return item;
}

async function requireInventoryLocation(orgId: string, locationId: string) {
  const location = await db.query.inventoryLocations.findFirst({
    where: and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.orgId, orgId)),
  });

  if (!location) {
    throw new Error('Inventory location not found for this organization.');
  }

  return location;
}

async function requireInventoryStock(orgId: string, stockId: string) {
  const stock = await db.query.inventoryStocks.findFirst({
    where: and(eq(inventoryStocks.id, stockId), eq(inventoryStocks.orgId, orgId)),
  });

  if (!stock) {
    throw new Error('Inventory stock row not found for this organization.');
  }

  return stock;
}

async function requireBlock(orgId: string, blockId: string) {
  const block = await db.query.blocks.findFirst({
    where: and(eq(blocks.id, blockId), eq(blocks.orgId, orgId)),
  });

  if (!block) {
    throw new Error('Block not found for this organization.');
  }

  return block;
}

async function requireRanch(orgId: string, ranchId: string) {
  const ranch = await db.query.ranches.findFirst({
    where: and(eq(ranches.id, ranchId), eq(ranches.orgId, orgId)),
  });

  if (!ranch) {
    throw new Error('Ranch not found for this organization.');
  }

  return ranch;
}

function daysUntil(dateValue: string | null | undefined) {
  if (!dateValue) {
    return null;
  }

  const now = new Date();
  const target = new Date(`${dateValue}T12:00:00.000Z`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const diffMs = target.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getStockHealthStatus(stock: {
  quantityOnHand: string | null;
  expirationDate: string | null;
  reorderPoint: string | null;
}) {
  const quantity = toNumber(stock.quantityOnHand);
  const reorderPoint = toNumber(stock.reorderPoint);
  const expiryDays = daysUntil(stock.expirationDate);

  if (quantity <= 0) {
    return 'out';
  }

  if (expiryDays !== null && expiryDays < 0) {
    return 'expired';
  }

  if (expiryDays !== null && expiryDays <= 30) {
    return 'expiring';
  }

  if (reorderPoint > 0 && quantity <= reorderPoint) {
    return 'low';
  }

  return 'healthy';
}

async function buildInventoryDashboard(orgId: string) {
  const [itemRows, locationRows, stockRows, movementRows, ranchRows, blockRows] = await Promise.all([
    db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.orgId, orgId))
      .orderBy(asc(inventoryItems.name)),
    db
      .select()
      .from(inventoryLocations)
      .where(eq(inventoryLocations.orgId, orgId))
      .orderBy(asc(inventoryLocations.name)),
    db
      .select()
      .from(inventoryStocks)
      .where(eq(inventoryStocks.orgId, orgId))
      .orderBy(desc(inventoryStocks.updatedAt), asc(inventoryStocks.lotCode)),
    db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.orgId, orgId))
      .orderBy(desc(inventoryMovements.occurredAt), desc(inventoryMovements.createdAt))
      .limit(80),
    db
      .select({
        id: ranches.id,
        name: ranches.name,
      })
      .from(ranches)
      .where(eq(ranches.orgId, orgId))
      .orderBy(asc(ranches.name)),
    db
      .select({
        id: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        active: blocks.active,
      })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.active, true)))
      .orderBy(asc(blocks.name)),
  ]);

  const itemIds = itemRows.map((row) => row.id);
  const locationIds = locationRows.map((row) => row.id);
  const profileIds = Array.from(
    new Set(movementRows.map((row) => row.performedBy).filter((value): value is string => Boolean(value))),
  );
  const movementBlockIds = Array.from(
    new Set(movementRows.map((row) => row.blockId).filter((value): value is string => Boolean(value))),
  );

  const [movementProfiles, movementBlocks] = await Promise.all([
    profileIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: profiles.id,
            fullName: profiles.fullName,
          })
          .from(profiles)
          .where(inArray(profiles.id, profileIds)),
    movementBlockIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: blocks.id,
            name: blocks.name,
            ranchId: blocks.ranchId,
          })
          .from(blocks)
          .where(inArray(blocks.id, movementBlockIds)),
  ]);

  const itemsById = new Map(itemRows.map((row) => [row.id, row]));
  const locationsById = new Map(locationRows.map((row) => [row.id, row]));
  const ranchesById = new Map(ranchRows.map((row) => [row.id, row]));
  const profilesById = new Map(movementProfiles.map((row) => [row.id, row]));
  const blocksById = new Map(movementBlocks.map((row) => [row.id, row]));

  const stocksByItemId = new Map<string, typeof stockRows>();
  const stocksByLocationId = new Map<string, typeof stockRows>();
  for (const stockRow of stockRows) {
    const itemList = stocksByItemId.get(stockRow.itemId) ?? [];
    itemList.push(stockRow);
    stocksByItemId.set(stockRow.itemId, itemList);

    const locationList = stocksByLocationId.get(stockRow.locationId) ?? [];
    locationList.push(stockRow);
    stocksByLocationId.set(stockRow.locationId, locationList);
  }

  const stockPayload = stockRows.map((stockRow) => {
    const item = itemsById.get(stockRow.itemId) ?? null;
    const location = locationsById.get(stockRow.locationId) ?? null;
    const ranch = location?.ranchId ? ranchesById.get(location.ranchId) ?? null : null;
    const reorderPoint = item?.reorderPoint ?? null;
    const healthStatus = getStockHealthStatus({
      quantityOnHand: stockRow.quantityOnHand,
      expirationDate: stockRow.expirationDate,
      reorderPoint,
    });
    const quantity = toNumber(stockRow.quantityOnHand);
    const unitCost = toNumber(stockRow.unitCost ?? item?.defaultUnitCost ?? null);

    return {
      ...stockRow,
      item,
      location: location
        ? {
            ...location,
            ranchName: ranch?.name ?? null,
          }
        : null,
      healthStatus,
      stockValue: Number((quantity * unitCost).toFixed(2)),
      daysToExpiration: daysUntil(stockRow.expirationDate),
    };
  });

  const itemPayload = itemRows.map((itemRow) => {
    const itemStocks = stocksByItemId.get(itemRow.id) ?? [];
    const quantityOnHand = Number(
      itemStocks.reduce((sum, stockRow) => sum + toNumber(stockRow.quantityOnHand), 0).toFixed(2),
    );
    const stockValue = Number(
      itemStocks
        .reduce((sum, stockRow) => {
          const quantity = toNumber(stockRow.quantityOnHand);
          const unitCost = toNumber(stockRow.unitCost ?? itemRow.defaultUnitCost ?? null);
          return sum + quantity * unitCost;
        }, 0)
        .toFixed(2),
    );
    const expiringLots = itemStocks.filter((stockRow) => {
      const days = daysUntil(stockRow.expirationDate);
      return days !== null && days >= 0 && days <= 30 && toNumber(stockRow.quantityOnHand) > 0;
    }).length;
    const expiredLots = itemStocks.filter((stockRow) => {
      const days = daysUntil(stockRow.expirationDate);
      return days !== null && days < 0 && toNumber(stockRow.quantityOnHand) > 0;
    }).length;
    const locationCount = new Set(itemStocks.map((stockRow) => stockRow.locationId)).size;

    return {
      ...itemRow,
      stockSummary: {
        quantityOnHand,
        stockValue,
        locationCount,
        lotCount: itemStocks.length,
        expiringLots,
        expiredLots,
        isLowStock: toNumber(itemRow.reorderPoint) > 0 && quantityOnHand <= toNumber(itemRow.reorderPoint),
        isOutOfStock: quantityOnHand <= 0,
      },
    };
  });

  const locationPayload = locationRows.map((locationRow) => {
    const locationStocks = stocksByLocationId.get(locationRow.id) ?? [];
    return {
      ...locationRow,
      ranchName: locationRow.ranchId ? ranchesById.get(locationRow.ranchId)?.name ?? null : null,
      stockSummary: {
        lotCount: locationStocks.length,
        quantityOnHand: Number(
          locationStocks.reduce((sum, stockRow) => sum + toNumber(stockRow.quantityOnHand), 0).toFixed(2),
        ),
        stockValue: Number(
          locationStocks
            .reduce((sum, stockRow) => {
              const item = itemsById.get(stockRow.itemId);
              const quantity = toNumber(stockRow.quantityOnHand);
              const unitCost = toNumber(stockRow.unitCost ?? item?.defaultUnitCost ?? null);
              return sum + quantity * unitCost;
            }, 0)
            .toFixed(2),
        ),
      },
    };
  });

  const movementPayload = movementRows.map((movementRow) => {
    const item = itemsById.get(movementRow.itemId) ?? null;
    const fromLocation = movementRow.fromLocationId
      ? locationsById.get(movementRow.fromLocationId) ?? null
      : null;
    const toLocation = movementRow.toLocationId
      ? locationsById.get(movementRow.toLocationId) ?? null
      : null;
    const block = movementRow.blockId ? blocksById.get(movementRow.blockId) ?? null : null;
    const performer = profilesById.get(movementRow.performedBy) ?? null;

    return {
      ...movementRow,
      item: item
        ? {
            id: item.id,
            name: item.name,
            sku: item.sku,
            category: item.category,
            unit: item.unit,
          }
        : null,
      fromLocation: fromLocation
        ? {
            id: fromLocation.id,
            name: fromLocation.name,
            ranchName: fromLocation.ranchId ? ranchesById.get(fromLocation.ranchId)?.name ?? null : null,
          }
        : null,
      toLocation: toLocation
        ? {
            id: toLocation.id,
            name: toLocation.name,
            ranchName: toLocation.ranchId ? ranchesById.get(toLocation.ranchId)?.name ?? null : null,
          }
        : null,
      block: block
        ? {
            ...block,
            ranchName: ranchesById.get(block.ranchId)?.name ?? null,
          }
        : null,
      performedByProfile: performer,
    };
  });

  const categorySummary = inventoryCategoryOptions.map((category) => {
    const itemsInCategory = itemPayload.filter((itemRow) => itemRow.category === category);
    return {
      category,
      itemCount: itemsInCategory.length,
      quantityOnHand: Number(
        itemsInCategory.reduce((sum, itemRow) => sum + itemRow.stockSummary.quantityOnHand, 0).toFixed(2),
      ),
      stockValue: Number(
        itemsInCategory.reduce((sum, itemRow) => sum + itemRow.stockSummary.stockValue, 0).toFixed(2),
      ),
      lowStockItems: itemsInCategory.filter((itemRow) => itemRow.stockSummary.isLowStock).length,
    };
  });

  const recentUsageQuantity = Number(
    movementRows
      .filter((movementRow) => movementRow.movementType === 'usage')
      .reduce((sum, movementRow) => sum + toNumber(movementRow.quantity), 0)
      .toFixed(2),
  );

  return {
    items: itemPayload,
    locations: locationPayload,
    stocks: stockPayload,
    movements: movementPayload,
    blocks: blockRows,
    summary: {
      totalItems: itemPayload.length,
      activeLocations: locationPayload.filter((locationRow) => locationRow.active).length,
      totalStockValue: Number(
        itemPayload.reduce((sum, itemRow) => sum + itemRow.stockSummary.stockValue, 0).toFixed(2),
      ),
      lowStockItems: itemPayload.filter((itemRow) => itemRow.stockSummary.isLowStock).length,
      outOfStockItems: itemPayload.filter((itemRow) => itemRow.stockSummary.isOutOfStock).length,
      expiringLots: stockPayload.filter((stockRow) => stockRow.healthStatus === 'expiring').length,
      expiredLots: stockPayload.filter((stockRow) => stockRow.healthStatus === 'expired').length,
      trackedLots: stockPayload.length,
      recentUsageQuantity,
    },
    categorySummary,
  };
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');
  return c.json(await buildInventoryDashboard(orgId));
});

app.post('/items', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeInventoryItemInput(body);

    const [item] = await db
      .insert(inventoryItems)
      .values({
        orgId,
        sku: values.sku ?? null,
        name: values.name!,
        category: values.category ?? 'other',
        unit: values.unit ?? 'each',
        manufacturer: values.manufacturer ?? null,
        supplier: values.supplier ?? null,
        description: values.description ?? null,
        storageNotes: values.storageNotes ?? null,
        reorderPoint: values.reorderPoint ?? '0.00',
        targetStock: values.targetStock ?? null,
        defaultUnitCost: values.defaultUnitCost ?? null,
        lotTracking: values.lotTracking ?? true,
        restrictedUse: values.restrictedUse ?? false,
        active: values.active ?? true,
        updatedBy: profileId,
      })
      .returning();

    return c.json(item, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create inventory item.';
    return c.json({ error: message }, 400);
  }
});

app.patch('/items/:id', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  const id = c.req.param('id');

  try {
    const existingItem = await requireInventoryItem(orgId, id);
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeInventoryItemInput(body, { partial: true });

    const updateValues: Partial<InventoryItemInsert> = {
      updatedBy: profileId,
      updatedAt: new Date(),
    };

    if (values.sku !== undefined) updateValues.sku = values.sku ?? null;
    if (values.name !== undefined) updateValues.name = values.name!;
    if (values.category !== undefined) updateValues.category = values.category ?? undefined;
    if (values.unit !== undefined) updateValues.unit = values.unit ?? undefined;
    if (values.manufacturer !== undefined) updateValues.manufacturer = values.manufacturer ?? null;
    if (values.supplier !== undefined) updateValues.supplier = values.supplier ?? null;
    if (values.description !== undefined) updateValues.description = values.description ?? null;
    if (values.storageNotes !== undefined) updateValues.storageNotes = values.storageNotes ?? null;
    if (values.reorderPoint !== undefined) updateValues.reorderPoint = values.reorderPoint ?? '0.00';
    if (values.targetStock !== undefined) updateValues.targetStock = values.targetStock ?? null;
    if (values.defaultUnitCost !== undefined) updateValues.defaultUnitCost = values.defaultUnitCost ?? null;
    if (values.lotTracking !== undefined) updateValues.lotTracking = values.lotTracking;
    if (values.restrictedUse !== undefined) updateValues.restrictedUse = values.restrictedUse;
    if (values.active !== undefined) updateValues.active = values.active;

    if (Object.keys(updateValues).length === 2 && existingItem.id) {
      return c.json(existingItem);
    }

    const [item] = await db
      .update(inventoryItems)
      .set(updateValues)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.orgId, orgId)))
      .returning();

    return c.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update inventory item.';
    const status = message === 'Inventory item not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.post('/locations', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeInventoryLocationInput(body);

    if (values.ranchId) {
      await requireRanch(orgId, values.ranchId);
    }

    const [location] = await db
      .insert(inventoryLocations)
      .values({
        orgId,
        ranchId: values.ranchId ?? null,
        name: values.name!,
        code: values.code ?? null,
        locationType: values.locationType ?? 'warehouse',
        notes: values.notes ?? null,
        active: values.active ?? true,
        updatedBy: profileId,
      })
      .returning();

    return c.json(location, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create inventory location.';
    const status = message === 'Ranch not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.patch('/locations/:id', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  const id = c.req.param('id');

  try {
    await requireInventoryLocation(orgId, id);
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeInventoryLocationInput(body, { partial: true });

    if (values.ranchId) {
      await requireRanch(orgId, values.ranchId);
    }

    const updateValues: Partial<InventoryLocationInsert> = {
      updatedBy: profileId,
      updatedAt: new Date(),
    };

    if (values.name !== undefined) updateValues.name = values.name!;
    if (values.code !== undefined) updateValues.code = values.code ?? null;
    if (values.ranchId !== undefined) updateValues.ranchId = values.ranchId ?? null;
    if (values.locationType !== undefined) updateValues.locationType = values.locationType ?? undefined;
    if (values.notes !== undefined) updateValues.notes = values.notes ?? null;
    if (values.active !== undefined) updateValues.active = values.active;

    const [location] = await db
      .update(inventoryLocations)
      .set(updateValues)
      .where(and(eq(inventoryLocations.id, id), eq(inventoryLocations.orgId, orgId)))
      .returning();

    return c.json(location);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update inventory location.';
    const status =
      message === 'Inventory location not found for this organization.' ||
      message === 'Ranch not found for this organization.'
        ? 404
        : 400;
    return c.json({ error: message }, status);
  }
});

app.post('/movements', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeInventoryMovementInput(body);

    const item = await requireInventoryItem(orgId, values.itemId);
    if (values.blockId) {
      await requireBlock(orgId, values.blockId);
    }

    const sourceStock = values.fromStockId ? await requireInventoryStock(orgId, values.fromStockId) : null;
    if (sourceStock && sourceStock.itemId !== values.itemId) {
      throw new Error('Selected source stock does not belong to the chosen item.');
    }

    const destinationLocation = values.toLocationId
      ? await requireInventoryLocation(orgId, values.toLocationId)
      : null;

    if (sourceStock && destinationLocation && sourceStock.locationId === destinationLocation.id && values.movementType === 'transfer') {
      throw new Error('Transfer destination must be different from the source location.');
    }

    const quantityAmount = Number(values.quantity);
    if (!Number.isFinite(quantityAmount) || quantityAmount <= 0) {
      throw new Error('Quantity is invalid.');
    }

    const lotCode = item.lotTracking ? values.lotCode ?? sourceStock?.lotCode ?? null : null;
    const expirationDate = item.lotTracking ? values.expirationDate ?? sourceStock?.expirationDate ?? null : null;
    const receivedDate = values.receivedDate ?? sourceStock?.receivedDate ?? null;

    const movement = await db.transaction(async (tx) => {
      let nextFromStock: InventoryStockRow | null = sourceStock;
      let nextToStock: InventoryStockRow | null = null;

      if (nextFromStock && (isOutgoingMovement(values.movementType) || values.movementType === 'transfer')) {
        const currentQty = toNumber(nextFromStock.quantityOnHand);
        if (currentQty < quantityAmount) {
          throw new Error(`Only ${currentQty.toFixed(2)} ${item.unit} available in the selected stock row.`);
        }

        const [updatedFromStock] = await tx
          .update(inventoryStocks)
          .set({
            quantityOnHand: (currentQty - quantityAmount).toFixed(2),
            active: currentQty - quantityAmount > 0 || nextFromStock.active,
            updatedAt: new Date(),
            updatedBy: profileId,
            lastMovementAt: values.occurredAt ?? new Date(),
          })
          .where(and(eq(inventoryStocks.id, nextFromStock.id), eq(inventoryStocks.orgId, orgId)))
          .returning();

        nextFromStock = updatedFromStock ?? nextFromStock;
      }

      if (destinationLocation && (isIncomingMovement(values.movementType) || values.movementType === 'transfer')) {
        const candidateStocks = await tx
          .select()
          .from(inventoryStocks)
          .where(
            and(
              eq(inventoryStocks.orgId, orgId),
              eq(inventoryStocks.itemId, item.id),
              eq(inventoryStocks.locationId, destinationLocation.id),
              lotCode ? eq(inventoryStocks.lotCode, lotCode) : isNull(inventoryStocks.lotCode),
              expirationDate
                ? eq(inventoryStocks.expirationDate, expirationDate)
                : isNull(inventoryStocks.expirationDate),
            ),
          )
          .orderBy(desc(inventoryStocks.updatedAt));

        const matchingStock = candidateStocks[0] ?? null;
        const effectiveUnitCost =
          values.unitCost ??
          nextFromStock?.unitCost ??
          item.defaultUnitCost ??
          null;

        if (matchingStock) {
          const [updatedToStock] = await tx
            .update(inventoryStocks)
            .set({
              quantityOnHand: (toNumber(matchingStock.quantityOnHand) + quantityAmount).toFixed(2),
              unitCost: effectiveUnitCost,
              receivedDate,
              vendorName: values.vendorName ?? matchingStock.vendorName ?? null,
              referenceNumber: values.referenceNumber ?? matchingStock.referenceNumber ?? null,
              notes: values.notes ?? matchingStock.notes ?? null,
              active: true,
              updatedAt: new Date(),
              updatedBy: profileId,
              lastMovementAt: values.occurredAt ?? new Date(),
            })
            .where(and(eq(inventoryStocks.id, matchingStock.id), eq(inventoryStocks.orgId, orgId)))
            .returning();

          nextToStock = updatedToStock ?? matchingStock;
        } else {
          const [createdToStock] = await tx
            .insert(inventoryStocks)
            .values({
              orgId,
              itemId: item.id,
              locationId: destinationLocation.id,
              lotCode,
              expirationDate,
              receivedDate,
              quantityOnHand: quantityAmount.toFixed(2),
              unitCost: effectiveUnitCost,
              vendorName: values.vendorName ?? null,
              referenceNumber: values.referenceNumber ?? null,
              notes: values.notes ?? null,
              active: true,
              updatedBy: profileId,
              lastMovementAt: values.occurredAt ?? new Date(),
            })
            .returning();

          nextToStock = createdToStock;
        }
      }

      const [createdMovement] = await tx
        .insert(inventoryMovements)
        .values({
          orgId,
          itemId: item.id,
          movementType: values.movementType,
          fromStockId: nextFromStock?.id ?? null,
          toStockId: nextToStock?.id ?? null,
          fromLocationId: nextFromStock?.locationId ?? null,
          toLocationId: destinationLocation?.id ?? null,
          blockId: values.blockId ?? null,
          quantity: values.quantity,
          unitCost: values.unitCost ?? nextFromStock?.unitCost ?? item.defaultUnitCost ?? null,
          lotCode,
          expirationDate,
          referenceNumber: values.referenceNumber ?? null,
          vendorName: values.vendorName ?? null,
          notes: values.notes ?? null,
          occurredAt: values.occurredAt ?? new Date(),
          performedBy: profileId,
        })
        .returning();

      return createdMovement;
    });

    return c.json(movement, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to record inventory movement.';
    const status =
      message === 'Inventory item not found for this organization.' ||
      message === 'Inventory stock row not found for this organization.' ||
      message === 'Inventory location not found for this organization.' ||
      message === 'Block not found for this organization.'
        ? 404
        : 400;
    return c.json({ error: message }, status);
  }
});

export default app;
