'use client';

import { type ReactNode, useDeferredValue, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeDollarSign,
  Boxes,
  MapPinned,
  PackagePlus,
  RefreshCw,
  Save,
  ShieldAlert,
  Warehouse,
} from 'lucide-react';
import { fetchOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding';
import { fetchRanches, type RanchRecord } from '@/lib/ranches';
import {
  createInventoryItem,
  createInventoryLocation,
  createInventoryMovement,
  defaultInventoryItemFormValues,
  defaultInventoryLocationFormValues,
  defaultInventoryMovementFormValues,
  fetchInventoryDashboard,
  formatInventoryCategory,
  formatInventoryCurrency,
  formatInventoryDate,
  formatInventoryDateTime,
  formatInventoryHealthStatus,
  formatInventoryLocationType,
  formatInventoryMovementType,
  formatInventoryQuantity,
  formatInventoryUnit,
  inventoryCategoryOptions,
  inventoryItemToFormValues,
  inventoryLocationToFormValues,
  inventoryLocationTypeOptions,
  inventoryMovementTypeOptions,
  inventoryUnitOptions,
  type InventoryDashboardPayload,
  type InventoryHealthStatus,
  type InventoryItemFormValues,
  type InventoryLocationFormValues,
  type InventoryMovementFormValues,
  updateInventoryItem,
  updateInventoryLocation,
} from '@/lib/inventory';

const emptyDashboard: InventoryDashboardPayload = {
  items: [],
  locations: [],
  stocks: [],
  movements: [],
  blocks: [],
  summary: {
    totalItems: 0,
    activeLocations: 0,
    totalStockValue: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    expiringLots: 0,
    expiredLots: 0,
    trackedLots: 0,
    recentUsageQuantity: 0,
  },
  categorySummary: [],
};

function MetricCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClasses = {
    default: 'border-ranch-border bg-white',
    warning: 'border-amber-200 bg-amber-50',
    danger: 'border-red-200 bg-red-50',
    success: 'border-emerald-200 bg-emerald-50',
  };

  return (
    <div className={`rounded-2xl border p-6 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <h2 className="mt-2 text-3xl font-bold text-gray-900">{value}</h2>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function StatusPill({ status }: { status: InventoryHealthStatus }) {
  const toneClasses = {
    healthy: 'bg-emerald-100 text-emerald-800',
    low: 'bg-amber-100 text-amber-800',
    expiring: 'bg-orange-100 text-orange-800',
    expired: 'bg-red-100 text-red-800',
    out: 'bg-stone-200 text-stone-800',
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClasses[status]}`}>
      {formatInventoryHealthStatus(status)}
    </span>
  );
}

function InventoryFormShell({
  title,
  description,
  icon,
  children,
  footer,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-ranch-border bg-gray-50 px-6 py-4">
        <div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-stone-900 text-white">
          {icon}
        </div>
      </div>
      <div className="space-y-4 p-6">{children}</div>
      <div className="border-t border-ranch-border px-6 py-4">{footer}</div>
    </div>
  );
}

function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ranch-border bg-gray-50 px-4 py-5 text-sm text-gray-600">
      {children}
    </div>
  );
}

export default function InventoryPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [dashboard, setDashboard] = useState<InventoryDashboardPayload>(emptyDashboard);
  const [itemForm, setItemForm] = useState<InventoryItemFormValues>(defaultInventoryItemFormValues());
  const [locationForm, setLocationForm] = useState<InventoryLocationFormValues>(defaultInventoryLocationFormValues());
  const [movementForm, setMovementForm] = useState<InventoryMovementFormValues>(defaultInventoryMovementFormValues());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [savingMovement, setSavingMovement] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [stockQuery, setStockQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | (typeof inventoryCategoryOptions)[number]['value']>('all');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const deferredCatalogQuery = useDeferredValue(catalogQuery);
  const deferredStockQuery = useDeferredValue(stockQuery);

  const refreshDashboard = async () => {
    setRefreshing(true);
    try {
      const payload = await fetchInventoryDashboard();
      setDashboard(payload);
      return payload;
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [onboardingStatus, ranchRows, inventoryDashboard] = await Promise.all([
          fetchOnboardingStatus(),
          fetchRanches(),
          fetchInventoryDashboard(),
        ]);

        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);
        setRanches(ranchRows);
        setDashboard(inventoryDashboard);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load inventory workspace.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!movementForm.itemId) {
      return;
    }

    const selectedItemStillExists = dashboard.items.some((item) => item.id === movementForm.itemId);
    if (!selectedItemStillExists) {
      setMovementForm((current) => ({ ...current, itemId: '', fromStockId: '' }));
    }
  }, [dashboard.items, movementForm.itemId]);

  useEffect(() => {
    if (!movementForm.fromStockId) {
      return;
    }

    const stock = dashboard.stocks.find((row) => row.id === movementForm.fromStockId);
    if (!stock) {
      setMovementForm((current) => ({ ...current, fromStockId: '' }));
      return;
    }

    if (movementForm.itemId && movementForm.itemId !== stock.itemId) {
      setMovementForm((current) => ({
        ...current,
        itemId: stock.itemId,
        lotCode: stock.lotCode ?? current.lotCode,
        expirationDate: stock.expirationDate ?? current.expirationDate,
        unitCost: stock.unitCost ?? current.unitCost,
      }));
      return;
    }

    if (!movementForm.itemId) {
      setMovementForm((current) => ({
        ...current,
        itemId: stock.itemId,
        lotCode: stock.lotCode ?? current.lotCode,
        expirationDate: stock.expirationDate ?? current.expirationDate,
        unitCost: stock.unitCost ?? current.unitCost,
      }));
    }
  }, [dashboard.stocks, movementForm.fromStockId, movementForm.itemId]);

  const selectedItem = dashboard.items.find((item) => item.id === movementForm.itemId) ?? null;
  const selectedSourceStock = dashboard.stocks.find((stock) => stock.id === movementForm.fromStockId) ?? null;
  const sourceStockOptions = dashboard.stocks.filter((stock) => stock.itemId === movementForm.itemId && Number(stock.quantityOnHand) > 0);
  const lowStockItems = dashboard.items.filter((item) => item.stockSummary.isLowStock || item.stockSummary.isOutOfStock);
  const expiringStocks = dashboard.stocks.filter((stock) => stock.healthStatus === 'expiring' || stock.healthStatus === 'expired');
  const visibleItems = dashboard.items.filter((item) => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) {
      return false;
    }

    const query = deferredCatalogQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [item.name, item.sku, item.supplier, item.manufacturer]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(query));
  });
  const visibleStocks = dashboard.stocks.filter((stock) => {
    const query = deferredStockQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [
      stock.item?.name,
      stock.item?.sku,
      stock.location?.name,
      stock.location?.ranchName,
      stock.lotCode,
      stock.vendorName,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(query));
  });

  const resetItemForm = () => {
    setEditingItemId(null);
    setItemForm(defaultInventoryItemFormValues());
  };

  const resetLocationForm = () => {
    setEditingLocationId(null);
    setLocationForm(defaultInventoryLocationFormValues());
  };

  const resetMovementForm = () => {
    setMovementForm(defaultInventoryMovementFormValues());
  };

  const handleItemSubmit = async () => {
    setSavingItem(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (editingItemId) {
        await updateInventoryItem(editingItemId, itemForm);
        setSuccessMessage('Inventory item updated.');
      } else {
        await createInventoryItem(itemForm);
        setSuccessMessage('Inventory item created.');
      }

      await refreshDashboard();
      resetItemForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save inventory item.');
    } finally {
      setSavingItem(false);
    }
  };

  const handleLocationSubmit = async () => {
    setSavingLocation(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (editingLocationId) {
        await updateInventoryLocation(editingLocationId, locationForm);
        setSuccessMessage('Inventory location updated.');
      } else {
        await createInventoryLocation(locationForm);
        setSuccessMessage('Inventory location created.');
      }

      await refreshDashboard();
      resetLocationForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save inventory location.');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleMovementSubmit = async () => {
    setSavingMovement(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await createInventoryMovement(movementForm);
      await refreshDashboard();
      setSuccessMessage('Inventory movement recorded.');
      resetMovementForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to record inventory movement.');
    } finally {
      setSavingMovement(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading inventory operations...</div>;
  }

  if (!status?.organization) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Finish onboarding first</h1>
          <p className="mt-2 text-sm text-gray-600">
            Inventory is tied to your organization, ranches, and blocks, so it unlocks after onboarding is complete.
          </p>
          <Link
            href="/onboarding"
            className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Return to onboarding
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8 animate-fade-in">
      <div className="flex flex-col gap-4 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Inventory</p>
          <h1 className="text-3xl font-bold text-gray-900">Detailed inventory control for field ops</h1>
          <p className="max-w-3xl text-sm text-gray-600">
            Track the catalog, storage locations, lot-level stock, and every movement across your ranch operation from one live workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshDashboard()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-ranch-border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh inventory'}
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Catalog" value={dashboard.summary.totalItems} detail="Tracked inventory items" />
        <MetricCard
          label="Value"
          value={formatInventoryCurrency(dashboard.summary.totalStockValue)}
          detail="Current on-hand inventory value"
          tone="success"
        />
        <MetricCard
          label="Low Stock"
          value={dashboard.summary.lowStockItems}
          detail={`${dashboard.summary.outOfStockItems} fully out of stock`}
          tone={dashboard.summary.lowStockItems > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Expiring"
          value={dashboard.summary.expiringLots + dashboard.summary.expiredLots}
          detail={`${dashboard.summary.expiredLots} already expired lots`}
          tone={dashboard.summary.expiredLots > 0 ? 'danger' : 'warning'}
        />
        <MetricCard
          label="Locations"
          value={dashboard.summary.activeLocations}
          detail={`${dashboard.summary.trackedLots} active lot positions`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
        <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
          <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
            <h2 className="font-semibold text-gray-900">Low-stock watchlist</h2>
            <p className="mt-1 text-sm text-gray-500">Items that are at or below their reorder threshold.</p>
          </div>
          <div className="divide-y">
            {lowStockItems.length === 0 ? (
              <div className="px-6 py-8">
                <SectionEmpty>Everything is above reorder point right now.</SectionEmpty>
              </div>
            ) : (
              lowStockItems.slice(0, 8).map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 px-6 py-4">
                  <div>
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-600">
                      {item.sku ? <span>SKU {item.sku}</span> : null}
                      <span>{formatInventoryCategory(item.category)}</span>
                      <span>{formatInventoryQuantity(item.stockSummary.quantityOnHand)} {formatInventoryUnit(item.unit).toLowerCase()}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <StatusPill status={item.stockSummary.isOutOfStock ? 'out' : 'low'} />
                    <p className="mt-2 text-xs text-gray-500">
                      Reorder at {formatInventoryQuantity(item.reorderPoint)} {formatInventoryUnit(item.unit).toLowerCase()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
          <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
            <h2 className="font-semibold text-gray-900">Lot expiry pressure</h2>
            <p className="mt-1 text-sm text-gray-500">Prioritize lots that are already expired or expiring within 30 days.</p>
          </div>
          <div className="divide-y">
            {expiringStocks.length === 0 ? (
              <div className="px-6 py-8">
                <SectionEmpty>No expiring or expired lots right now.</SectionEmpty>
              </div>
            ) : (
              expiringStocks.slice(0, 8).map((stock) => (
                <div key={stock.id} className="flex items-start justify-between gap-4 px-6 py-4">
                  <div>
                    <p className="font-semibold text-gray-900">{stock.item?.name ?? 'Inventory item'}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-600">
                      <span>{stock.location?.name ?? 'Location'}</span>
                      {stock.lotCode ? <span>Lot {stock.lotCode}</span> : null}
                      <span>{formatInventoryQuantity(stock.quantityOnHand)} {stock.item ? formatInventoryUnit(stock.item.unit).toLowerCase() : 'units'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <StatusPill status={stock.healthStatus} />
                    <p className="mt-2 text-xs text-gray-500">{formatInventoryDate(stock.expirationDate)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
          <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
            <h2 className="font-semibold text-gray-900">Category mix</h2>
            <p className="mt-1 text-sm text-gray-500">Stock coverage by inventory category.</p>
          </div>
          <div className="space-y-3 p-6">
            {dashboard.categorySummary.filter((row) => row.itemCount > 0).length === 0 ? (
              <SectionEmpty>Create your first inventory item to start seeing category mix.</SectionEmpty>
            ) : (
              dashboard.categorySummary
                .filter((row) => row.itemCount > 0)
                .map((row) => (
                  <div key={row.category} className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-gray-900">{formatInventoryCategory(row.category)}</p>
                      <span className="text-xs text-gray-500">{row.itemCount} items</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
                      <span>{formatInventoryQuantity(row.quantityOnHand)} on hand</span>
                      <span>{formatInventoryCurrency(row.stockValue)}</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">{row.lowStockItems} items at reorder level</p>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-3">
        <InventoryFormShell
          title={editingItemId ? 'Edit inventory item' : 'Create inventory item'}
          description="Define catalog settings like units, reorder points, and lot tracking once, then reuse them across stock movements."
          icon={<PackagePlus className="h-5 w-5" />}
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                {editingItemId ? 'Updating the selected catalog item.' : 'Create the next item in your inventory catalog.'}
              </p>
              <div className="flex gap-3">
                {editingItemId ? (
                  <button
                    type="button"
                    onClick={resetItemForm}
                    className="rounded-lg border border-ranch-border px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleItemSubmit()}
                  disabled={savingItem}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingItem ? 'Saving...' : editingItemId ? 'Update item' : 'Create item'}
                </button>
              </div>
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Item name</span>
              <input
                type="text"
                value={itemForm.name}
                onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                placeholder="Muriate of potash, gloves, emitters..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">SKU</span>
              <input
                type="text"
                value={itemForm.sku}
                onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Category</span>
              <select
                value={itemForm.category}
                onChange={(event) => setItemForm((current) => ({ ...current, category: event.target.value as InventoryItemFormValues['category'] }))}
                className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
              >
                {inventoryCategoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Unit</span>
              <select
                value={itemForm.unit}
                onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value as InventoryItemFormValues['unit'] }))}
                className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
              >
                {inventoryUnitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Manufacturer</span>
              <input
                type="text"
                value={itemForm.manufacturer}
                onChange={(event) => setItemForm((current) => ({ ...current, manufacturer: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Supplier</span>
              <input
                type="text"
                value={itemForm.supplier}
                onChange={(event) => setItemForm((current) => ({ ...current, supplier: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Reorder point</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemForm.reorderPoint}
                onChange={(event) => setItemForm((current) => ({ ...current, reorderPoint: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Target stock</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemForm.targetStock}
                onChange={(event) => setItemForm((current) => ({ ...current, targetStock: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Default unit cost</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemForm.defaultUnitCost}
                onChange={(event) => setItemForm((current) => ({ ...current, defaultUnitCost: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Description</span>
              <textarea
                rows={3}
                value={itemForm.description}
                onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Storage notes</span>
              <textarea
                rows={3}
                value={itemForm.storageNotes}
                onChange={(event) => setItemForm((current) => ({ ...current, storageNotes: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={itemForm.lotTracking}
                onChange={(event) => setItemForm((current) => ({ ...current, lotTracking: event.target.checked }))}
              />
              Track lots and expiration per stock position
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={itemForm.restrictedUse}
                onChange={(event) => setItemForm((current) => ({ ...current, restrictedUse: event.target.checked }))}
              />
              Restricted-use or safety-sensitive inventory
            </label>
          </div>
        </InventoryFormShell>

        <InventoryFormShell
          title={editingLocationId ? 'Edit location' : 'Create location'}
          description="Set up every place inventory can live, from the main warehouse to a field trailer or truck."
          icon={<Warehouse className="h-5 w-5" />}
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                {editingLocationId ? 'Updating the selected storage location.' : 'Create a new storage location.'}
              </p>
              <div className="flex gap-3">
                {editingLocationId ? (
                  <button
                    type="button"
                    onClick={resetLocationForm}
                    className="rounded-lg border border-ranch-border px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleLocationSubmit()}
                  disabled={savingLocation}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingLocation ? 'Saving...' : editingLocationId ? 'Update location' : 'Create location'}
                </button>
              </div>
            </div>
          }
        >
          <div className="grid gap-4">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Location name</span>
              <input
                type="text"
                value={locationForm.name}
                onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                placeholder="Main warehouse, truck 12, north field box..."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Code</span>
              <input
                type="text"
                value={locationForm.code}
                onChange={(event) => setLocationForm((current) => ({ ...current, code: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                placeholder="WH-01"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Location type</span>
              <select
                value={locationForm.locationType}
                onChange={(event) => setLocationForm((current) => ({ ...current, locationType: event.target.value as InventoryLocationFormValues['locationType'] }))}
                className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
              >
                {inventoryLocationTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Ranch</span>
              <select
                value={locationForm.ranchId}
                onChange={(event) => setLocationForm((current) => ({ ...current, ranchId: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
              >
                <option value="">Shared / organization-wide</option>
                {ranches.map((ranch) => (
                  <option key={ranch.id} value={ranch.id}>
                    {ranch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Notes</span>
              <textarea
                rows={4}
                value={locationForm.notes}
                onChange={(event) => setLocationForm((current) => ({ ...current, notes: event.target.value }))}
                className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
              />
            </label>
          </div>
        </InventoryFormShell>

        <InventoryFormShell
          title="Record movement"
          description="Post purchases, transfers, usage, and adjustments directly against real stock rows so balances stay trustworthy."
          icon={<ArrowRightLeft className="h-5 w-5" />}
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">Every movement updates stock balances and creates a full audit trail.</p>
              <button
                type="button"
                onClick={() => void handleMovementSubmit()}
                disabled={savingMovement}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {savingMovement ? 'Posting...' : 'Record movement'}
              </button>
            </div>
          }
        >
          {dashboard.items.length === 0 || dashboard.locations.length === 0 ? (
            <SectionEmpty>
              Create at least one inventory item and one location before posting movements.
            </SectionEmpty>
          ) : (
            <div className="grid gap-4">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900">Item</span>
                <select
                  value={movementForm.itemId}
                  onChange={(event) => setMovementForm((current) => ({ ...current, itemId: event.target.value, fromStockId: '' }))}
                  className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Select item</option>
                  {dashboard.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.sku ? ` (${item.sku})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900">Movement type</span>
                <select
                  value={movementForm.movementType}
                  onChange={(event) => setMovementForm((current) => ({ ...current, movementType: event.target.value as InventoryMovementFormValues['movementType'] }))}
                  className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                >
                  {inventoryMovementTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {movementForm.movementType === 'usage' || movementForm.movementType === 'adjustment_out' || movementForm.movementType === 'waste' || movementForm.movementType === 'transfer' ? (
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Source stock row</span>
                  <select
                    value={movementForm.fromStockId}
                    onChange={(event) => setMovementForm((current) => ({ ...current, fromStockId: event.target.value }))}
                    className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">Select source stock</option>
                    {sourceStockOptions.map((stock) => (
                      <option key={stock.id} value={stock.id}>
                        {(stock.location?.name ?? 'Location')} · {formatInventoryQuantity(stock.quantityOnHand)} {stock.item ? formatInventoryUnit(stock.item.unit).toLowerCase() : 'units'}{stock.lotCode ? ` · Lot ${stock.lotCode}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {movementForm.movementType === 'purchase' || movementForm.movementType === 'adjustment_in' || movementForm.movementType === 'return' || movementForm.movementType === 'transfer' ? (
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Destination location</span>
                  <select
                    value={movementForm.toLocationId}
                    onChange={(event) => setMovementForm((current) => ({ ...current, toLocationId: event.target.value }))}
                    className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">Select destination</option>
                    {dashboard.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}{location.ranchName ? ` (${location.ranchName})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Quantity</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={movementForm.quantity}
                    onChange={(event) => setMovementForm((current) => ({ ...current, quantity: event.target.value }))}
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Unit cost</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={movementForm.unitCost}
                    onChange={(event) => setMovementForm((current) => ({ ...current, unitCost: event.target.value }))}
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Lot code</span>
                  <input
                    type="text"
                    value={movementForm.lotCode}
                    onChange={(event) => setMovementForm((current) => ({ ...current, lotCode: event.target.value }))}
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                    disabled={selectedItem ? !selectedItem.lotTracking : false}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Expiration date</span>
                  <input
                    type="date"
                    value={movementForm.expirationDate}
                    onChange={(event) => setMovementForm((current) => ({ ...current, expirationDate: event.target.value }))}
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                    disabled={selectedItem ? !selectedItem.lotTracking : false}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Received date</span>
                  <input
                    type="date"
                    value={movementForm.receivedDate}
                    onChange={(event) => setMovementForm((current) => ({ ...current, receivedDate: event.target.value }))}
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Block linkage</span>
                  <select
                    value={movementForm.blockId}
                    onChange={(event) => setMovementForm((current) => ({ ...current, blockId: event.target.value }))}
                    className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">No block link</option>
                    {dashboard.blocks.map((block) => (
                      <option key={block.id} value={block.id}>
                        {block.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Reference number</span>
                  <input
                    type="text"
                    value={movementForm.referenceNumber}
                    onChange={(event) => setMovementForm((current) => ({ ...current, referenceNumber: event.target.value }))}
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900">Vendor / source</span>
                  <input
                    type="text"
                    value={movementForm.vendorName}
                    onChange={(event) => setMovementForm((current) => ({ ...current, vendorName: event.target.value }))}
                    className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900">Occurred at</span>
                <input
                  type="datetime-local"
                  value={movementForm.occurredAt}
                  onChange={(event) => setMovementForm((current) => ({ ...current, occurredAt: event.target.value }))}
                  className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900">Notes</span>
                <textarea
                  rows={3}
                  value={movementForm.notes}
                  onChange={(event) => setMovementForm((current) => ({ ...current, notes: event.target.value }))}
                  className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                />
              </label>

              {selectedSourceStock ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                  <p className="font-semibold">Selected source stock</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <span>{selectedSourceStock.location?.name ?? 'Location'}</span>
                    <span>{formatInventoryQuantity(selectedSourceStock.quantityOnHand)} on hand</span>
                    {selectedSourceStock.lotCode ? <span>Lot {selectedSourceStock.lotCode}</span> : null}
                    {selectedSourceStock.expirationDate ? <span>Expires {formatInventoryDate(selectedSourceStock.expirationDate)}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </InventoryFormShell>
      </div>

      <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-ranch-border bg-gray-50 px-6 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Catalog workspace</h2>
            <p className="mt-1 text-sm text-gray-500">Browse, filter, and maintain the inventory catalog configuration.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder="Search by name, SKU, supplier..."
              className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm sm:w-72"
            />
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}
              className="rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
            >
              <option value="all">All categories</option>
              {inventoryCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          {visibleItems.length === 0 ? (
            <div className="p-6">
              <SectionEmpty>No catalog items match the current filters.</SectionEmpty>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-ranch-border text-sm">
              <thead className="bg-white text-left text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="px-6 py-3">Item</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Stock</th>
                  <th className="px-6 py-3">Locations</th>
                  <th className="px-6 py-3">Value</th>
                  <th className="px-6 py-3">Flags</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ranch-border">
                {visibleItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">{item.name}</p>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                          {item.sku ? <span>SKU {item.sku}</span> : null}
                          {item.manufacturer ? <span>{item.manufacturer}</span> : null}
                          <span>{formatInventoryUnit(item.unit)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{formatInventoryCategory(item.category)}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatInventoryQuantity(item.stockSummary.quantityOnHand)} {formatInventoryUnit(item.unit).toLowerCase()}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{item.stockSummary.locationCount}</td>
                    <td className="px-6 py-4 text-gray-600">{formatInventoryCurrency(item.stockSummary.stockValue)}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {item.stockSummary.isOutOfStock ? <StatusPill status="out" /> : null}
                        {!item.stockSummary.isOutOfStock && item.stockSummary.isLowStock ? <StatusPill status="low" /> : null}
                        {item.restrictedUse ? (
                          <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                            Restricted use
                          </span>
                        ) : null}
                        {item.stockSummary.expiringLots > 0 ? <StatusPill status="expiring" /> : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItemId(item.id);
                          setItemForm(inventoryItemToFormValues(item));
                          setErrorMessage('');
                          setSuccessMessage('');
                        }}
                        className="rounded-lg border border-ranch-border px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-ranch-border bg-gray-50 px-6 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Stock positions</h2>
              <p className="mt-1 text-sm text-gray-500">Every lot or stock row with quantity, valuation, and health context.</p>
            </div>
            <input
              type="text"
              value={stockQuery}
              onChange={(event) => setStockQuery(event.target.value)}
              placeholder="Search item, location, lot..."
              className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm lg:w-72"
            />
          </div>
          <div className="divide-y">
            {visibleStocks.length === 0 ? (
              <div className="p-6">
                <SectionEmpty>No stock rows match the current search.</SectionEmpty>
              </div>
            ) : (
              visibleStocks.map((stock) => (
                <div key={stock.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-gray-900">{stock.item?.name ?? 'Inventory item'}</p>
                      <StatusPill status={stock.healthStatus} />
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                      <span>{stock.location?.name ?? 'Location'}</span>
                      {stock.location?.ranchName ? <span>{stock.location.ranchName}</span> : null}
                      {stock.lotCode ? <span>Lot {stock.lotCode}</span> : null}
                      <span>{formatInventoryQuantity(stock.quantityOnHand)} {stock.item ? formatInventoryUnit(stock.item.unit).toLowerCase() : 'units'}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                      <span>Value {formatInventoryCurrency(stock.stockValue)}</span>
                      {stock.unitCost ? <span>Unit cost {formatInventoryCurrency(stock.unitCost)}</span> : null}
                      {stock.expirationDate ? <span>Expires {formatInventoryDate(stock.expirationDate)}</span> : null}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    <p>Updated {formatInventoryDateTime(stock.updatedAt ?? stock.createdAt)}</p>
                    {stock.vendorName ? <p className="mt-1">Vendor {stock.vendorName}</p> : null}
                    {stock.referenceNumber ? <p className="mt-1">Ref {stock.referenceNumber}</p> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Storage map</h2>
              <p className="mt-1 text-sm text-gray-500">Inventory locations and the stock value currently sitting in each one.</p>
            </div>
            <div className="divide-y">
              {dashboard.locations.length === 0 ? (
                <div className="p-6">
                  <SectionEmpty>Create a location to begin tracking stock positions.</SectionEmpty>
                </div>
              ) : (
                dashboard.locations.map((location) => (
                  <div key={location.id} className="flex items-start justify-between gap-4 px-6 py-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{location.name}</p>
                        <span className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                          {formatInventoryLocationType(location.locationType)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-600">
                        {location.code ? <span>{location.code}</span> : null}
                        {location.ranchName ? <span>{location.ranchName}</span> : <span>Shared location</span>}
                        <span>{location.stockSummary.lotCount} lot rows</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{formatInventoryCurrency(location.stockSummary.stockValue)}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatInventoryQuantity(location.stockSummary.quantityOnHand)} tracked units
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLocationId(location.id);
                          setLocationForm(inventoryLocationToFormValues(location));
                          setErrorMessage('');
                          setSuccessMessage('');
                        }}
                        className="mt-3 rounded-lg border border-ranch-border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-900">
            <div className="flex items-start gap-3">
              <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
              <p>
                Inventory movements can optionally link to a block, which gives the team a clean trail between stock usage and field activity.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-ranch-border bg-gray-50 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Recent movement log</h2>
            <p className="mt-1 text-sm text-gray-500">Chronological audit trail across receiving, usage, transfers, adjustments, and waste.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2">
              <BadgeDollarSign className="h-4 w-4" />
              Recent usage {formatInventoryQuantity(dashboard.summary.recentUsageQuantity)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2">
              <Boxes className="h-4 w-4" />
              {dashboard.movements.length} recent entries
            </span>
          </div>
        </div>
        <div className="divide-y">
          {dashboard.movements.length === 0 ? (
            <div className="p-6">
              <SectionEmpty>Record your first inventory movement to create the audit trail.</SectionEmpty>
            </div>
          ) : (
            dashboard.movements.map((movement) => (
              <div key={movement.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{movement.item?.name ?? 'Inventory item'}</p>
                    <span className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                      {formatInventoryMovementType(movement.movementType)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                    <span>{formatInventoryQuantity(movement.quantity)} {movement.item ? formatInventoryUnit(movement.item.unit).toLowerCase() : 'units'}</span>
                    {movement.fromLocation ? <span>From {movement.fromLocation.name}</span> : null}
                    {movement.toLocation ? <span>To {movement.toLocation.name}</span> : null}
                    {movement.block ? <span>Block {movement.block.name}</span> : null}
                    {movement.lotCode ? <span>Lot {movement.lotCode}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                    <span>{formatInventoryDateTime(movement.occurredAt)}</span>
                    {movement.performedByProfile?.fullName ? <span>{movement.performedByProfile.fullName}</span> : null}
                    {movement.referenceNumber ? <span>Ref {movement.referenceNumber}</span> : null}
                    {movement.vendorName ? <span>{movement.vendorName}</span> : null}
                  </div>
                  {movement.notes ? <p className="text-sm text-gray-700">{movement.notes}</p> : null}
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  {movement.movementType === 'waste' ? <ShieldAlert className="h-4 w-4 text-red-600" /> : null}
                  {movement.movementType === 'transfer' ? <ArrowRightLeft className="h-4 w-4 text-sky-700" /> : null}
                  {(movement.movementType === 'adjustment_in' || movement.movementType === 'adjustment_out') ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
