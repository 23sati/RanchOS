'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPinned, Save } from 'lucide-react';
import RanchBoundaryEditorMap from '@/components/map/RanchBoundaryEditorMap';
import RanchCenterPickerMap from '@/components/map/RanchCenterPickerMap';
import {
  BlockRecord,
  calculateBlockTopologySummary,
  calculateGeometryAcres,
  calculateUncoveredRanchGeometry,
  fetchBlocks,
} from '@/lib/blocks';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import {
  calculateRanchBoundaryAcres,
  calculateRanchCoverage,
  centerToCoordinateFields,
  fetchRanches,
  type RanchBoundary,
  type RanchMapViewport,
  RanchRecord,
  ranchToCenter,
  updateRanch,
} from '@/lib/ranches';

type RanchCenterFormState = {
  gpsLat: string;
  gpsLng: string;
  mapViewport: RanchMapViewport | null;
  boundary: RanchBoundary | null;
};

export default function SettingsPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranch, setRanch] = useState<RanchRecord | null>(null);
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [form, setForm] = useState<RanchCenterFormState>({ gpsLat: '', gpsLng: '', mapViewport: null, boundary: null });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const onboardingStatus = await fetchOnboardingStatus();
        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);

        const ranchRows = await fetchRanches();
        if (cancelled) {
          return;
        }

        const currentRanch = onboardingStatus.ranch
          ? ranchRows.find((candidate) => candidate.id === onboardingStatus.ranch?.id) ?? null
          : ranchRows[0] ?? null;

        setRanch(currentRanch);
        setForm({
          gpsLat: currentRanch?.gpsLat ?? '',
          gpsLng: currentRanch?.gpsLng ?? '',
          mapViewport: currentRanch?.mapViewport ?? null,
          boundary: currentRanch?.boundary ?? null,
        });

        if (currentRanch?.id) {
          const blockRows = await fetchBlocks(currentRanch.id);
          if (cancelled) {
            return;
          }

          setBlocks(blockRows);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load ranch settings.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCenter = form.gpsLat && form.gpsLng
    ? [Number(form.gpsLng), Number(form.gpsLat)] as [number, number]
    : null;
  const currentBoundary = form.boundary;
  const boundaryAcres = calculateRanchBoundaryAcres(currentBoundary);
  const coverageSummary = calculateRanchCoverage(blocks, currentBoundary);
  const uncoveredGeometry = calculateUncoveredRanchGeometry(currentBoundary, blocks);
  const uncoveredAcres = calculateGeometryAcres(uncoveredGeometry);
  const topologySummary = calculateBlockTopologySummary(blocks);
  const readiness = {
    hasCenter: Boolean(selectedCenter),
    hasViewport: Boolean(form.mapViewport),
    hasBoundary: Boolean(currentBoundary),
    hasMappedBlocks: blocks.some((block) => block.geometry),
  };
  const mappedCoveragePct = boundaryAcres && uncoveredAcres !== null
    ? Math.max(((boundaryAcres - uncoveredAcres) / boundaryAcres) * 100, 0)
    : coverageSummary.coveragePct;

  const handleSave = async () => {
    if (!ranch) {
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const updatedRanch = await updateRanch(ranch.id, {
        gpsLat: form.gpsLat || null,
        gpsLng: form.gpsLng || null,
        mapViewport: form.mapViewport,
        boundary: form.boundary,
      });

      setRanch(updatedRanch);
      setForm({
        gpsLat: updatedRanch.gpsLat ?? '',
        gpsLng: updatedRanch.gpsLng ?? '',
        mapViewport: updatedRanch.mapViewport ?? null,
        boundary: updatedRanch.boundary ?? null,
      });
      setSuccessMessage('Ranch map location saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save ranch center.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading ranch settings...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto w-full flex flex-col gap-8 animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="text-sm text-gray-600">
          Save your ranch center and ranch footprint so RanchOS opens maps on your property instead of the Central Valley fallback.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/settings/team" className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm transition hover:border-green-300 hover:bg-green-50/30">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Team</p>
          <h2 className="mt-2 text-xl font-bold text-gray-900">Crew roster</h2>
          <p className="mt-2 text-sm text-gray-600">Create and update crew members before logging labor entries.</p>
        </Link>
        <Link href="/settings/frost" className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/30">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Alerts</p>
          <h2 className="mt-2 text-xl font-bold text-gray-900">Frost settings</h2>
          <p className="mt-2 text-sm text-gray-600">Tune the frost thresholds and response window for overnight events.</p>
        </Link>
        <Link href="/settings/notifications" className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/30">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Notifications</p>
          <h2 className="mt-2 text-xl font-bold text-gray-900">Push delivery</h2>
          <p className="mt-2 text-sm text-gray-600">Control quiet hours and queue urgent intelligence alerts for mobile delivery.</p>
        </Link>
        <Link href="/settings/advisor" className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/30">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Advisor</p>
          <h2 className="mt-2 text-xl font-bold text-gray-900">API access</h2>
          <p className="mt-2 text-sm text-gray-600">Create read-only advisor keys for a persisted operational snapshot.</p>
        </Link>
        <Link href="/settings/agworld" className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/30">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Integrations</p>
          <h2 className="mt-2 text-xl font-bold text-gray-900">AgWorld sync</h2>
          <p className="mt-2 text-sm text-gray-600">Map paddocks and push verified spray records through the persisted AgWorld log.</p>
        </Link>
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

      {!ranch ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">No ranch found</h2>
          <p className="mt-2 text-sm text-gray-600">Finish onboarding before editing ranch settings.</p>
          <Link href="/onboarding" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            Return to onboarding
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Current ranch</p>
              <h2 className="text-2xl font-bold text-gray-900">{ranch.name}</h2>
              <p className="text-sm text-gray-600">
                {ranch.county ? `${ranch.county} County` : 'County not set'}
                {status?.organization?.name ? ` for ${status.organization.name}` : ''}
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-ranch-border bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <MapPinned className="h-4 w-4 text-sky-700" />
                <h3 className="font-semibold text-gray-900">Ranch center</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-gray-700">
                  <span>Latitude</span>
                  <input
                    type="number"
                    min="-90"
                    max="90"
                    step="0.00000001"
                    value={form.gpsLat}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      gpsLat: event.target.value,
                      mapViewport: null,
                    }))}
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="36.73780000"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-gray-700">
                  <span>Longitude</span>
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    step="0.00000001"
                    value={form.gpsLng}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      gpsLng: event.target.value,
                      mapViewport: null,
                    }))}
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="-119.78710000"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Click the map to update these coordinates, or type them directly if you already know the ranch center. Panning and zooming also saves the preferred ranch viewport.
              </p>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <p><span className="font-semibold">Mapped blocks:</span> {blocks.length}</p>
              <p><span className="font-semibold">Existing center:</span> {selectedCenter ? `${form.gpsLat}, ${form.gpsLng}` : 'Not saved yet'}</p>
              <p><span className="font-semibold">Saved viewport:</span> {form.mapViewport ? `Zoom ${form.mapViewport.zoom.toFixed(2)}` : 'Not saved yet'}</p>
              <p><span className="font-semibold">Ranch boundary:</span> {currentBoundary ? (boundaryAcres ? `${boundaryAcres.toFixed(2)} acres` : 'Captured') : 'Not saved yet'}</p>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-gray-50 p-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Mapping health</p>
                <h3 className="text-lg font-semibold text-gray-900">
                  {readiness.hasBoundary ? `${(mappedCoveragePct ?? 0).toFixed(1)}% ranch coverage` : 'Finish ranch map setup'}
                </h3>
                <p className="text-sm text-gray-600">
                  {readiness.hasBoundary
                    ? `${coverageSummary.mappedAcres.toFixed(2)} mapped acres with ${uncoveredAcres?.toFixed(2) ?? coverageSummary.remainingAcres?.toFixed(2) ?? '0.00'} acres still uncovered.`
                    : 'Save a ranch boundary to measure full property coverage and validate block geometry.'}
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-ranch-border bg-white p-3 text-sm text-gray-700">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Readiness</p>
                  <p className="mt-2">{readiness.hasCenter ? 'Center saved' : 'Center missing'}</p>
                  <p>{readiness.hasViewport ? 'Viewport saved' : 'Viewport missing'}</p>
                  <p>{readiness.hasBoundary ? 'Boundary saved' : 'Boundary missing'}</p>
                  <p>{readiness.hasMappedBlocks ? 'Mapped blocks available' : 'No mapped blocks yet'}</p>
                </div>
                <div className="rounded-xl border border-ranch-border bg-white p-3 text-sm text-gray-700">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Topology</p>
                  <p className="mt-2">
                    Boundary acres: {boundaryAcres ? boundaryAcres.toFixed(2) : 'Not saved'}
                  </p>
                  <p>Uncovered acres: {uncoveredAcres !== null ? uncoveredAcres.toFixed(2) : 'Not measured'}</p>
                  <p>Overlap pairs: {topologySummary.overlapPairs}</p>
                  <p>Overlap acres: {topologySummary.overlapAcres.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save ranch map'}
            </button>
          </div>

          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Ranch map center picker</h2>
                <p className="mt-1 text-sm text-gray-600">Click anywhere on the map to set where RanchOS should center the ranch.</p>
              </div>
              <div className="h-[320px]">
                <RanchCenterPickerMap
                  blocks={blocks}
                  center={selectedCenter}
                  viewport={form.mapViewport}
                  boundary={currentBoundary}
                  onCenterChange={(center) => {
                    const coordinates = centerToCoordinateFields(center);
                    setForm((current) => ({
                      ...current,
                      ...coordinates,
                    }));
                    setSuccessMessage('');
                  }}
                  onViewportChange={(viewport) => {
                    setForm((current) => ({
                      ...current,
                      mapViewport: viewport,
                    }));
                    setSuccessMessage('');
                  }}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-ranch-border bg-white shadow-sm">
              <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
                <h2 className="font-semibold text-gray-900">Ranch boundary editor</h2>
                <p className="mt-1 text-sm text-gray-600">Draw the ranch footprint once so maps can fit the full property and block editing can validate against it.</p>
              </div>
              <div className="h-[420px]">
                <RanchBoundaryEditorMap
                  blocks={blocks}
                  center={selectedCenter}
                  viewport={form.mapViewport}
                  boundary={currentBoundary}
                  onBoundaryChange={(boundary) => {
                    setForm((current) => ({
                      ...current,
                      boundary,
                    }));
                    setSuccessMessage('');
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
