'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BlockForm from '@/components/blocks/BlockForm';
import { BlockFormValues, BlockRecord, createBlock, fetchBlocks } from '@/lib/blocks';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { fetchRanches, RanchRecord } from '@/lib/ranches';

const emptyValues: BlockFormValues = {
  ranchId: '',
  name: '',
  cropType: 'almond',
  variety: '',
  acreage: '',
  treeCount: '',
  yearPlanted: '',
  rootstock: '',
  irrigationType: '',
  isOrganic: false,
  organicSince: '',
  apn: '',
  waterDistrict: '',
  gsaName: '',
  notes: '',
  geometry: null,
};

export default function NewBlockPage() {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [referenceBlocks, setReferenceBlocks] = useState<BlockRecord[]>([]);
  const [initialValues, setInitialValues] = useState<BlockFormValues>(emptyValues);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const [onboardingStatus, ranchRows, blockRows] = await Promise.all([
          fetchOnboardingStatus(),
          fetchRanches(),
          fetchBlocks(),
        ]);
        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);
        setRanches(ranchRows);
        setReferenceBlocks(blockRows);
        setInitialValues((current) => ({
          ...current,
          ranchId: onboardingStatus.ranch?.id ?? ranchRows[0]?.id ?? '',
        }));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load ranch data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (values: BlockFormValues) => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const createdBlock = await createBlock(values);
      router.push(`/blocks/${createdBlock.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create block.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading ranch context...</div>;
  }

  if (!ranches.length) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">No ranch available yet</h1>
          <p className="mt-2 text-sm text-gray-600">Finish onboarding before creating blocks.</p>
          <Link href="/onboarding" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            Return to onboarding
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <Link href="/blocks" className="text-sm font-medium text-green-700 hover:text-green-800">
          ← Back to blocks
        </Link>
      </div>
      <BlockForm
        title="Create a new block"
        description={status?.organization?.name
          ? `Create a mapped block anywhere in ${status.organization.name}, then switch ranch context in the form if needed.`
          : 'Create a mapped block and choose which ranch it belongs to.'}
        submitLabel="Create block"
        ranches={ranches}
        referenceBlocks={referenceBlocks}
        initialValues={initialValues}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
