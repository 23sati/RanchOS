'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { booleanWithin } from '@turf/turf';
import BlockMap from '@/components/map/BlockMap';
import {
  BlockFormValues,
  BlockRecord,
  blockCropOptions,
  calculateGeometryAcres,
  calculateOverlapAcres,
  calculateUncoveredRanchGeometry,
  getBlockOverlapDetails,
  irrigationOptions,
} from '@/lib/blocks';
import { ranchToCenter, type RanchRecord } from '@/lib/ranches';

type BlockFormProps = {
  title: string;
  description: string;
  submitLabel: string;
  ranches: RanchRecord[];
  initialValues: BlockFormValues;
  referenceBlocks?: BlockRecord[];
  isSubmitting?: boolean;
  errorMessage?: string;
  onSubmit: (values: BlockFormValues) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  isDeleting?: boolean;
};

export default function BlockForm({
  title,
  description,
  submitLabel,
  ranches,
  initialValues,
  referenceBlocks = [],
  isSubmitting = false,
  errorMessage,
  onSubmit,
  onDelete,
  isDeleting = false,
}: BlockFormProps) {
  const [values, setValues] = useState<BlockFormValues>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const cropLabel = useMemo(
    () => blockCropOptions.find((option) => option.value === values.cropType)?.label ?? values.cropType,
    [values.cropType],
  );

  const mappedAcres = useMemo(
    () => calculateGeometryAcres(values.geometry),
    [values.geometry],
  );

  const selectedRanch = useMemo(
    () => ranches.find((ranch) => ranch.id === values.ranchId) ?? null,
    [ranches, values.ranchId],
  );

  const selectedRanchCenter = useMemo(
    () => ranchToCenter(selectedRanch),
    [selectedRanch],
  );

  const selectedRanchViewport = selectedRanch?.mapViewport ?? null;
  const selectedRanchBoundary = selectedRanch?.boundary ?? null;

  const scopedReferenceBlocks = useMemo(
    () => referenceBlocks.filter((block) => block.ranchId === values.ranchId),
    [referenceBlocks, values.ranchId],
  );

  const isOutsideRanchBoundary = useMemo(() => {
    if (!values.geometry || !selectedRanchBoundary) {
      return false;
    }

    return !booleanWithin(values.geometry, selectedRanchBoundary);
  }, [selectedRanchBoundary, values.geometry]);

  const overlapDetails = useMemo(
    () => getBlockOverlapDetails(values.geometry, scopedReferenceBlocks),
    [scopedReferenceBlocks, values.geometry],
  );

  const uncoveredGeometry = useMemo(
    () => calculateUncoveredRanchGeometry(selectedRanchBoundary, scopedReferenceBlocks),
    [scopedReferenceBlocks, selectedRanchBoundary],
  );

  const overlapAcres = useMemo(
    () => calculateOverlapAcres(overlapDetails),
    [overlapDetails],
  );

  const canUseUncoveredAssist = !initialValues.geometry && !values.geometry && Boolean(uncoveredGeometry);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(values);
  };

  const updateValue = <K extends keyof BlockFormValues>(key: K, value: BlockFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-600">{description}</p>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Ranch</span>
          <select
            value={values.ranchId}
            onChange={(event) => updateValue('ranchId', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            required
          >
            <option value="">Select a ranch</option>
            {ranches.map((ranch) => (
              <option key={ranch.id} value={ranch.id}>
                {ranch.name}
              </option>
            ))}
          </select>
          {ranches.length > 1 ? (
            <p className="text-xs text-gray-500">
              Boundary guidance and overlap checks update when you switch ranches.
            </p>
          ) : null}
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Block name</span>
          <input
            value={values.name}
            onChange={(event) => updateValue('name', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="North 40"
            required
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Crop type</span>
          <select
            value={values.cropType}
            onChange={(event) => updateValue('cropType', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            required
          >
            <option value="">Select crop</option>
            {blockCropOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Variety</span>
          <input
            value={values.variety}
            onChange={(event) => updateValue('variety', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder={cropLabel === values.cropType ? 'Nonpareil, Valencia, Lisbon...' : `${cropLabel} variety`}
            required
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Acreage</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.acreage}
            onChange={(event) => updateValue('acreage', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="40.00"
          />
          <p className="text-xs text-gray-500">
            {mappedAcres
              ? `Current map boundary estimates ${mappedAcres.toFixed(2)} acres. We auto-fill acreage when the shape changes.`
              : 'Draw a block boundary below to auto-fill acreage from the map.'}
          </p>
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Tree count</span>
          <input
            type="number"
            min="0"
            step="1"
            value={values.treeCount}
            onChange={(event) => updateValue('treeCount', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="1200"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Year planted</span>
          <input
            type="number"
            min="1900"
            step="1"
            value={values.yearPlanted}
            onChange={(event) => updateValue('yearPlanted', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="2018"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Irrigation type</span>
          <select
            value={values.irrigationType}
            onChange={(event) => updateValue('irrigationType', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          >
            <option value="">Select irrigation</option>
            {irrigationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Rootstock</span>
          <input
            value={values.rootstock}
            onChange={(event) => updateValue('rootstock', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Nemaguard"
          />
        </label>

        <label className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={values.isOrganic}
            onChange={(event) => updateValue('isOrganic', event.target.checked)}
            className="h-4 w-4"
          />
          Organic block
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Organic since</span>
          <input
            type="date"
            value={values.organicSince}
            onChange={(event) => updateValue('organicSince', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            disabled={!values.isOrganic}
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>APN</span>
          <input
            value={values.apn}
            onChange={(event) => updateValue('apn', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="001-234-567"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700">
          <span>Water district</span>
          <input
            value={values.waterDistrict}
            onChange={(event) => updateValue('waterDistrict', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Fresno Irrigation District"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700 md:col-span-2">
          <span>GSA name</span>
          <input
            value={values.gsaName}
            onChange={(event) => updateValue('gsaName', event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Kings Subbasin GSA"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-gray-700 md:col-span-2">
          <span>Notes</span>
          <textarea
            value={values.notes}
            onChange={(event) => updateValue('notes', event.target.value)}
            className="min-h-28 w-full rounded-lg border px-3 py-2"
            placeholder="Anything the crew or managers should know about this block..."
          />
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border border-ranch-border bg-stone-50 p-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-gray-900">Block boundary</h2>
          <p className="text-sm text-gray-600">
            Draw one polygon for this block. You can edit vertices, move the shape, clear it and redraw, or snap overflow back inside the ranch footprint.
          </p>
        </div>
        {selectedRanchBoundary ? (
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            isOutsideRanchBoundary
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}>
            {isOutsideRanchBoundary
              ? 'This block boundary extends outside the saved ranch footprint. Adjust the block or update the ranch boundary in Settings.'
              : 'The saved ranch boundary is shown as a dashed teal outline for context.'}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-600">
            Save a ranch boundary in Settings to get full-ranch map fitting and outside-boundary warnings while editing blocks.
          </div>
        )}
        {overlapDetails.length > 0 ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            This block overlaps {overlapDetails.length} existing block{overlapDetails.length === 1 ? '' : 's'} for about {overlapAcres.toFixed(2)} acres total.
            {' '}Overlapping blocks: {overlapDetails.map((detail) => `${detail.name} (${detail.overlapAcres.toFixed(2)} ac)`).join(', ')}.
          </div>
        ) : null}
        {canUseUncoveredAssist ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
            RanchOS found uncovered ranch area from the saved footprint and existing blocks.
            {' '}
            <button
              type="button"
              onClick={() => setValues((current) => ({
                ...current,
                geometry: uncoveredGeometry,
                acreage: uncoveredGeometry ? (calculateGeometryAcres(uncoveredGeometry)?.toFixed(2) ?? current.acreage) : current.acreage,
              }))}
              className="font-semibold underline underline-offset-2"
            >
              Use uncovered area as a starter shape
            </button>
            .
          </div>
        ) : null}
        <div className="h-[440px] overflow-hidden rounded-2xl border border-ranch-border bg-white">
          <BlockMap
            editable
            blocks={scopedReferenceBlocks}
            geometry={values.geometry}
            center={selectedRanchCenter}
            viewport={selectedRanchViewport}
            ranchBoundary={selectedRanchBoundary}
            uncoveredGeometry={uncoveredGeometry}
            onGeometryChange={(geometry, acreage) => {
              setValues((current) => ({
                ...current,
                geometry,
                acreage: acreage ? acreage.toFixed(2) : current.acreage,
              }));
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || isDeleting}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
        {onDelete ? (
          <button
            type="button"
            disabled={isSubmitting || isDeleting}
            onClick={() => void onDelete()}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? 'Deleting...' : 'Delete Block'}
          </button>
        ) : null}
      </div>
    </form>
  );
}
