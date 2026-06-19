'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RanchBoundaryEditorMap from '@/components/map/RanchBoundaryEditorMap';
import RanchCenterPickerMap from '@/components/map/RanchCenterPickerMap';
import { completeOnboarding, fetchOnboardingStatus } from '@/lib/onboarding';
import { centerToCoordinateFields, type RanchBoundary, type RanchMapViewport } from '@/lib/ranches';

const countyOptions = ['Fresno', 'Tulare', 'Kings', 'Kern', 'Madera', 'Merced', 'San Joaquin', 'San Bernardino', 'Riverside', 'Ventura'] as const;

type OnboardingFormState = {
  organizationName: string;
  primaryCrop: 'almond' | 'citrus' | 'both';
  ranchName: string;
  county: '' | (typeof countyOptions)[number];
  gpsLat: string;
  gpsLng: string;
  mapViewport: RanchMapViewport | null;
  boundary: RanchBoundary | null;
  totalAcres: string;
  fullName: string;
  preferredLocale: 'en' | 'es';
  timezone: string;
  phone: string;
};

const initialFormState: OnboardingFormState = {
  organizationName: '',
  primaryCrop: 'almond',
  ranchName: '',
  county: '',
  gpsLat: '',
  gpsLng: '',
  mapViewport: null,
  boundary: null,
  totalAcres: '',
  fullName: '',
  preferredLocale: 'en',
  timezone: 'America/Los_Angeles',
  phone: '',
};

export default function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<OnboardingFormState>(initialFormState);
  const [errorMessage, setErrorMessage] = useState('');
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const status = await fetchOnboardingStatus();
        if (cancelled) {
          return;
        }

        if (status.onboardingComplete) {
          router.push('/');
          return;
        }

        setForm((current) => ({
          ...current,
          fullName: current.fullName || status.user.name || '',
        }));
        setIsBooting(false);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unable to load onboarding.';
        if (message === 'Unauthorized') {
          router.push('/login');
          return;
        }

        setErrorMessage(message);
        setIsBooting(false);
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const updateForm = <K extends keyof OnboardingFormState>(key: K, value: OnboardingFormState[K]) => {
    setForm((current) => {
      if (Object.is(current[key], value)) {
        return current;
      }

      return { ...current, [key]: value };
    });
  };

  const goToStep = (nextStep: number) => {
    setErrorMessage('');
    setStep(nextStep);
  };

  const handleNextFromOrganization = () => {
    if (!form.organizationName.trim()) {
      setErrorMessage('Add your ranch or company name to continue.');
      return;
    }

    goToStep(2);
  };

  const handleNextFromRanch = () => {
    if (!form.fullName.trim()) {
      setErrorMessage('Add your full name to continue.');
      return;
    }

    if (!form.ranchName.trim()) {
      setErrorMessage('Add your first ranch name to continue.');
      return;
    }

    goToStep(3);
  };

  const handleFinish = async () => {
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await completeOnboarding(form);
      router.push('/');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to complete onboarding.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isBooting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow">
          <h1 className="text-2xl font-bold text-gray-900">Setting up your workspace</h1>
          <p className="mt-3 text-sm text-gray-600">Checking your account and preparing onboarding...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white shadow rounded-xl p-8">
        <div className="flex justify-between items-center mb-8 border-b pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Welcome to RanchOS</h1>
          <span className="text-sm font-medium text-gray-500">Step {step} of 3</span>
        </div>

        {errorMessage ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <h2 className="text-lg font-semibold">1. Set up your Organization</h2>
            <input
              type="text"
              value={form.organizationName}
              onChange={(event) => updateForm('organizationName', event.target.value)}
              placeholder="Ranch or Company Name"
              className="border w-full p-2 rounded"
            />
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Primary crop</p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name="crop" checked={form.primaryCrop === 'almond'} onChange={() => updateForm('primaryCrop', 'almond')} />
                  Almonds
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="crop" checked={form.primaryCrop === 'citrus'} onChange={() => updateForm('primaryCrop', 'citrus')} />
                  Citrus
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="crop" checked={form.primaryCrop === 'both'} onChange={() => updateForm('primaryCrop', 'both')} />
                  Both
                </label>
              </div>
            </div>
            <input
              type="text"
              value={form.timezone}
              onChange={(event) => updateForm('timezone', event.target.value)}
              placeholder="Timezone"
              className="border w-full p-2 rounded"
            />
            <button onClick={handleNextFromOrganization} className="bg-green-600 text-white px-4 py-2 rounded w-full mt-4">
              Next Step
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <h2 className="text-lg font-semibold">2. Add Your Team Profile and First Ranch</h2>
            <input
              type="text"
              value={form.fullName}
              onChange={(event) => updateForm('fullName', event.target.value)}
              placeholder="Your Full Name"
              className="border w-full p-2 rounded"
            />
            <input
              type="text"
              value={form.ranchName}
              onChange={(event) => updateForm('ranchName', event.target.value)}
              placeholder="Ranch Name (for example, Home Ranch)"
              className="border w-full p-2 rounded"
            />
            <select
              value={form.county}
              onChange={(event) => updateForm('county', event.target.value as OnboardingFormState['county'])}
              className="border w-full p-2 rounded"
            >
              <option value="">Select county</option>
              {countyOptions.map((county) => (
                <option key={county} value={county}>
                  {county} County
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.totalAcres}
              onChange={(event) => updateForm('totalAcres', event.target.value)}
              placeholder="Approximate Acreage"
              className="border w-full p-2 rounded"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <input
                type="number"
                step="0.00000001"
                min="-90"
                max="90"
                value={form.gpsLat}
                onChange={(event) => {
                  updateForm('gpsLat', event.target.value);
                  updateForm('mapViewport', null);
                }}
                placeholder="Ranch center latitude (optional)"
                className="border w-full p-2 rounded"
              />
              <input
                type="number"
                step="0.00000001"
                min="-180"
                max="180"
                value={form.gpsLng}
                onChange={(event) => {
                  updateForm('gpsLng', event.target.value);
                  updateForm('mapViewport', null);
                }}
                placeholder="Ranch center longitude (optional)"
                className="border w-full p-2 rounded"
              />
            </div>
            <p className="text-xs text-gray-500">
              Optional for now, but adding ranch GPS lets RanchOS center the map on your property instead of the Fresno fallback.
            </p>
            <div className="h-[320px] overflow-hidden rounded-2xl border border-gray-200">
              <RanchCenterPickerMap
                center={
                  form.gpsLat && form.gpsLng
                    ? [Number(form.gpsLng), Number(form.gpsLat)]
                    : null
                }
                viewport={form.mapViewport}
                boundary={form.boundary}
                onCenterChange={(center) => {
                  const coordinates = centerToCoordinateFields(center);
                  updateForm('gpsLat', coordinates.gpsLat);
                  updateForm('gpsLng', coordinates.gpsLng);
                }}
                onViewportChange={(viewport) => updateForm('mapViewport', viewport)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Optional ranch footprint</p>
              <p className="text-xs text-gray-500">
                Draw the ranch outline now if you want dashboard maps to open to the full property and block editing to warn when a boundary drifts outside the ranch.
              </p>
            </div>
            <div className="h-[360px] overflow-hidden rounded-2xl border border-gray-200">
              <RanchBoundaryEditorMap
                center={
                  form.gpsLat && form.gpsLng
                    ? [Number(form.gpsLng), Number(form.gpsLat)]
                    : null
                }
                viewport={form.mapViewport}
                boundary={form.boundary}
                onBoundaryChange={(boundary) => updateForm('boundary', boundary)}
              />
            </div>
            <div className="flex gap-4 mt-4">
              <button onClick={() => goToStep(1)} className="border px-4 py-2 rounded w-1/3">Back</button>
              <button onClick={handleNextFromRanch} className="bg-green-600 text-white px-4 py-2 rounded w-2/3">Next Step</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <h2 className="text-lg font-semibold">3. Confirm Your Trial Workspace</h2>
            <p className="text-sm text-gray-600">We’ll create your organization, owner profile, first ranch, and starter trial subscription in the live database.</p>
            <select
              value={form.preferredLocale}
              onChange={(event) => updateForm('preferredLocale', event.target.value as 'en' | 'es')}
              className="border w-full p-2 rounded"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
            </select>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => updateForm('phone', event.target.value)}
              placeholder="Phone Number (optional)"
              className="border w-full p-2 rounded"
            />
            <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-700">
              <p><span className="font-semibold">Organization:</span> {form.organizationName || 'Not set yet'}</p>
              <p><span className="font-semibold">First ranch:</span> {form.ranchName || 'Not set yet'}</p>
              <p><span className="font-semibold">Map center:</span> {form.gpsLat && form.gpsLng ? `${form.gpsLat}, ${form.gpsLng}` : 'Using default map center for now'}</p>
              <p><span className="font-semibold">Ranch boundary:</span> {form.boundary ? 'Captured' : 'Not captured yet'}</p>
              <p><span className="font-semibold">Plan:</span> Starter trial</p>
              <p><span className="font-semibold">Trial length:</span> 14 days</p>
            </div>
            <div className="flex gap-4 mt-4">
              <button onClick={() => goToStep(2)} disabled={isSubmitting} className="border px-4 py-2 rounded w-1/3 disabled:cursor-not-allowed disabled:opacity-60">Back</button>
              <button onClick={handleFinish} disabled={isSubmitting} className="bg-green-600 text-white px-4 py-2 rounded w-2/3 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? 'Creating workspace...' : 'Go to Dashboard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
