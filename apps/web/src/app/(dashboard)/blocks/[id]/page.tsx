'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import BlockForm from '@/components/blocks/BlockForm';
import { BlockFormValues, BlockRecord, blockToFormValues, deleteBlock, fetchBlock, fetchBlocks, updateBlock } from '@/lib/blocks';
import { fetchRanches, RanchRecord } from '@/lib/ranches';

export default function BlockDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [ranches, setRanches] = useState<RanchRecord[]>([]);
  const [block, setBlock] = useState<BlockRecord | null>(null);
  const [referenceBlocks, setReferenceBlocks] = useState<BlockRecord[]>([]);
  const [initialValues, setInitialValues] = useState<BlockFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [ranchRows, blockRows, blockRow] = await Promise.all([
          fetchRanches(),
          fetchBlocks(),
          fetchBlock(params.id),
        ]);

        if (cancelled) {
          return;
        }

        setRanches(ranchRows);
        setBlock(blockRow);
        setInitialValues(blockToFormValues(blockRow));
        setReferenceBlocks(blockRows.filter((candidate) => candidate.id !== blockRow.id));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load block.');
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
  }, [params.id]);

  const handleSubmit = async (values: BlockFormValues) => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const updatedBlock = await updateBlock(params.id, values);
      setBlock(updatedBlock);
      setInitialValues(blockToFormValues(updatedBlock));
      router.push('/blocks');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update block.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage('');

    try {
      await deleteBlock(params.id);
      router.push('/blocks');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete block.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading || !initialValues) {
    return <div className="p-6 text-sm text-gray-600">Loading block...</div>;
  }

  if (!block || !ranches.length) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Block not available</h1>
          <p className="mt-2 text-sm text-gray-600">{errorMessage || 'This block could not be found for your current workspace.'}</p>
          <Link href="/blocks" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            Back to blocks
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
        title={`Edit ${block.name}`}
        description={`Update this ${block.cropType.replace(/_/g, ' ')} block and move it between ranches if your workspace layout has changed.`}
        submitLabel="Save changes"
        ranches={ranches}
        referenceBlocks={referenceBlocks}
        initialValues={initialValues}
        isSubmitting={isSubmitting}
        isDeleting={isDeleting}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </div>
  );
}
