'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Cloud, Copy, Download, RefreshCcw, Save } from 'lucide-react';
import {
  type AgworldBatchReadbackResponse,
  fetchAgworldRecordReconciliation,
  fetchAgworldWorkspace,
  formatAgworldDate,
  formatAgworldDateOnly,
  formatAgworldSyncStatus,
  readbackAgworldSprayRecords,
  readbackAgworldSprayRecord,
  syncAgworldSprayRecords,
  type AgworldRecentSync,
  type AgworldSyncResponse,
  type AgworldSyncLogEntry,
  type AgworldSyncSnapshot,
  type AgworldReadbackPayload,
  type AgworldRecordReconciliationPayload,
  type AgworldSprayRecordPreview,
  type AgworldWorkspacePayload,
  updateAgworldWorkspace,
} from '@/lib/agworld';
import { fetchOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding';

const EMPTY_WORKSPACE: AgworldWorkspacePayload = {
  organization: {
    id: '',
    name: '',
  },
  integration: {
    enabled: false,
    connected: false,
    hasAccessToken: false,
    hasRefreshToken: false,
    workspaceId: null,
    autoPushSprayRecords: false,
    autoPullRecommendations: false,
    fieldMappings: [],
    createdAt: null,
  },
  summary: {
    totalBlocks: 0,
    mappedBlocks: 0,
    exportableSprayRecords: 0,
    readbackEligibleRecords: 0,
    successfulSpraySyncs: 0,
    failedSpraySyncs: 0,
    conflictSpraySyncs: 0,
    successfulPushSyncs: 0,
    failedPushSyncs: 0,
    conflictPushSyncs: 0,
    successfulPullSyncs: 0,
    failedPullSyncs: 0,
    conflictPullSyncs: 0,
    openPushBlockers: 0,
    openPullBlockers: 0,
  },
  blocks: [],
  exportableSprayRecords: [],
  recentSyncs: [],
};

function syncTone(status: string | null) {
  if (status === 'success') {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (status === 'failed') {
    return 'bg-red-50 text-red-700';
  }

  if (status === 'conflict') {
    return 'bg-amber-50 text-amber-800';
  }

  return 'bg-stone-100 text-stone-700';
}

function MetricCard(props: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-ranch-border bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">{props.label}</p>
      <p className="mt-3 text-3xl font-bold text-gray-900">{props.value}</p>
      <p className="mt-2 text-sm text-gray-600">{props.detail}</p>
    </div>
  );
}

type SprayRecordFilter = 'needs_attention' | 'all' | 'ready' | 'mapping_required' | 'retry' | 'synced';
type SyncLogFilter = 'all' | 'success' | 'failed' | 'conflict';
type SyncDirectionFilter = 'all' | 'push' | 'pull';
type DetailHistoryStatusFilter = 'all' | 'issues' | 'success';

const sprayRecordFilterOptions: Array<{ value: SprayRecordFilter; label: string }> = [
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'all', label: 'All records' },
  { value: 'ready', label: 'Ready to push' },
  { value: 'mapping_required', label: 'Mapping required' },
  { value: 'retry', label: 'Needs retry' },
  { value: 'synced', label: 'Synced' },
];

const syncLogFilterOptions: Array<{ value: SyncLogFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'conflict', label: 'Conflict' },
];

const syncDirectionFilterOptions: Array<{ value: SyncDirectionFilter; label: string }> = [
  { value: 'all', label: 'All directions' },
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
];

const detailHistoryStatusFilterOptions: Array<{ value: DetailHistoryStatusFilter; label: string }> = [
  { value: 'all', label: 'All rows' },
  { value: 'issues', label: 'Issues only' },
  { value: 'success', label: 'Success only' },
];

function checklistTone(complete: boolean) {
  return complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900';
}

function queueStateLabel(state: ReturnType<typeof getSprayRecordQueueState>) {
  if (state === 'mapping_required') {
    return 'Mapping required';
  }

  if (state === 'retry') {
    return 'Needs retry';
  }

  if (state === 'synced') {
    return 'Synced';
  }

  return 'Ready to push';
}

function getSprayRecordQueueState(record: AgworldSprayRecordPreview) {
  if (!record.paddockId) {
    return 'mapping_required' as const;
  }

  if (record.lastSync?.status === 'failed' || record.lastSync?.status === 'conflict') {
    return 'retry' as const;
  }

  if (record.lastSync?.status === 'success') {
    return 'synced' as const;
  }

  return 'ready' as const;
}

function matchesSprayRecordFilter(record: AgworldSprayRecordPreview, filter: SprayRecordFilter) {
  const state = getSprayRecordQueueState(record);
  if (filter === 'all') {
    return true;
  }

  if (filter === 'needs_attention') {
    return state !== 'synced';
  }

  return state === filter;
}

function matchesSyncLogFilter(record: { status: string | null }, filter: SyncLogFilter) {
  if (filter === 'all') {
    return true;
  }

  return record.status === filter;
}

function matchesSyncDirectionFilter(record: { direction: 'push' | 'pull' | null }, filter: SyncDirectionFilter) {
  if (filter === 'all') {
    return true;
  }

  return record.direction === filter;
}

function matchesDetailHistoryStatusFilter(
  record: AgworldRecordReconciliationPayload['history'][number],
  filter: DetailHistoryStatusFilter,
) {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'issues') {
    return record.status === 'failed' || record.status === 'conflict';
  }

  return record.status === 'success';
}

function latestDirectionBlockerLabel(label: string, snapshot: AgworldSyncSnapshot | null) {
  if (!snapshot) {
    return `${label}: not attempted yet`;
  }

  const parts = [`${label}: ${formatAgworldSyncStatus(snapshot.status)}`];
  if (snapshot.syncedAt) {
    parts.push(`at ${formatAgworldDate(snapshot.syncedAt)}`);
  }

  if (snapshot.errorMessage && snapshot.status !== 'success') {
    parts.push(snapshot.errorMessage);
  }

  return parts.join(' | ');
}

function describeSyncLogRowAction(entry: AgworldSyncLogEntry, hasLinkedRecord: boolean) {
  if (entry.status === 'success') {
    return entry.direction === 'pull'
      ? 'This pull row completed cleanly. Use it as the comparison checkpoint for the selected AgWorld readback.'
      : 'This push row completed cleanly. Use it as the current shipped RanchOS-to-AgWorld checkpoint.';
  }

  if (entry.direction === 'pull') {
    return hasLinkedRecord
      ? 'Review the blocker detail, then rerun the explicit readback path for this record once the AgWorld-side issue is clear.'
      : 'This pull row is not linked to a current record selection. Focus the linked spray record before retrying readback.';
  }

  if (entry.direction === 'push') {
    return hasLinkedRecord
      ? 'Review the blocker detail, fix mapping or validation issues if needed, then rerun the existing manual push path for this record.'
      : 'This push row is not linked to a current record selection. Focus the linked spray record before retrying.';
  }

  return 'Review this persisted sync row in context before taking the next action.';
}

function buildSyncRowHandoffSummary(input: {
  entry: AgworldSyncLogEntry;
  workspace: AgworldWorkspacePayload;
  selectedRecordDetail: AgworldRecordReconciliationPayload | null;
  recentSync: AgworldRecentSync | null;
}) {
  const { entry, workspace, selectedRecordDetail, recentSync } = input;
  const lines = [
    'AgWorld sync-row handoff',
    `Organization: ${workspace.organization.name}`,
    `Row id: ${entry.id}`,
    `Direction: ${entry.direction ? entry.direction.toUpperCase() : 'Unknown'}`,
    `Status: ${formatAgworldSyncStatus(entry.status)}`,
    `Synced at: ${formatAgworldDate(entry.syncedAt)}`,
    `AgWorld id: ${entry.agworldId ?? 'Not returned'}`,
    `RanchOS record id: ${entry.ranchosId ?? 'Not linked'}`,
  ];

  if (recentSync?.productName || selectedRecordDetail) {
    lines.push(
      `Record: ${recentSync?.productName ?? selectedRecordDetail?.record.productName ?? 'Unknown record'} on ${recentSync?.blockName ?? selectedRecordDetail?.record.blockName ?? 'Unknown block'}`,
    );
  }

  if (recentSync?.appliedDate || selectedRecordDetail?.record.appliedDate) {
    lines.push(`Applied: ${formatAgworldDateOnly(recentSync?.appliedDate ?? selectedRecordDetail?.record.appliedDate ?? null)}`);
  }

  if (entry.errorMessage) {
    lines.push(`Blocker: ${entry.errorMessage}`);
  }

  lines.push(`Next action: ${describeSyncLogRowAction(entry, Boolean(entry.ranchosId))}`);
  return lines.join('\n');
}

function buildBatchReadbackHandoffSummary(input: {
  batch: AgworldBatchReadbackResponse;
  workspace: AgworldWorkspacePayload;
}) {
  const { batch, workspace } = input;
  const lines = [
    'AgWorld batch reconciliation handoff',
    `Organization: ${workspace.organization.name}`,
    `Attempted: ${batch.summary.attempted}`,
    `Successful: ${batch.summary.successful}`,
    `Failed: ${batch.summary.failed}`,
    `Conflicts: ${batch.summary.conflicts}`,
  ];

  const issueRows = batch.results.filter((result) => result.status !== 'success');
  if (issueRows.length > 0) {
    lines.push('Issue rows:');
    for (const row of issueRows.slice(0, 8)) {
      lines.push(
        `- ${row.reconciliation.record.productName} on ${row.reconciliation.record.blockName} | ${formatAgworldSyncStatus(row.status)} | ${row.errorMessage ?? 'No blocker detail'}`,
      );
    }
  }

  const mismatchHotspots = new Map<string, number>();
  for (const result of batch.results) {
    for (const field of result.comparison?.fields ?? []) {
      if (field.status === 'matched') {
        continue;
      }

      mismatchHotspots.set(field.label, (mismatchHotspots.get(field.label) ?? 0) + 1);
    }
  }

  const topHotspots = Array.from(mismatchHotspots.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 6);

  if (topHotspots.length > 0) {
    lines.push('Top reconciliation hotspots:');
    for (const hotspot of topHotspots) {
      lines.push(`- ${hotspot.label}: ${hotspot.count}`);
    }
  }

  return lines.join('\n');
}

function buildSyncRunHandoffSummary(input: {
  syncRun: AgworldSyncResponse;
  workspace: AgworldWorkspacePayload;
}) {
  const { syncRun, workspace } = input;
  const lines = [
    'AgWorld sync-run handoff',
    `Organization: ${workspace.organization.name}`,
    `Attempted: ${syncRun.summary.attempted}`,
    `Successful: ${syncRun.summary.successful}`,
    `Failed: ${syncRun.summary.failed}`,
    `Conflicts: ${syncRun.summary.conflicts}`,
  ];

  const issueRows = syncRun.results.filter((result) => result.status !== 'success');
  if (issueRows.length > 0) {
    lines.push('Issue rows:');
    for (const row of issueRows.slice(0, 8)) {
      lines.push(`- ${row.blockName} | ${formatAgworldSyncStatus(row.status)} | ${row.message}`);
    }
  }

  return lines.join('\n');
}

function describeQueueAction(detail: AgworldRecordReconciliationPayload) {
  if (!detail.record.paddockId) {
    return 'Save a paddock mapping for this block, then retry the push from the existing spray-record queue.';
  }

  if (!detail.integration.connected) {
    return 'Finish the workspace connection details before retrying this record.';
  }

  if (detail.record.lastSync?.status === 'failed') {
    return 'Review the latest failure detail below, fix the AgWorld-side validation issue if needed, then re-run the push.';
  }

  if (detail.record.lastSync?.status === 'conflict') {
    return 'Clear the current blocker, then re-run this record so the persisted sync log shows a clean success.';
  }

  if (detail.record.lastSync?.status === 'success') {
    return 'This record already has a successful sync on file. Re-run it only if the downstream AgWorld copy needs an explicit refresh.';
  }

  return 'This record is ready for a first push through the current persisted AgWorld sync path.';
}

function buildAgworldHandoffSummary(detail: AgworldRecordReconciliationPayload, workspace: AgworldWorkspacePayload) {
  const queueState = queueStateLabel(getSprayRecordQueueState(detail.record));
  const latestSyncLabel = formatAgworldDate(detail.record.lastSync?.syncedAt ?? null);
  const lines = [
    `AgWorld reconciliation handoff`,
    `Organization: ${workspace.organization.name}`,
    `Workspace: ${detail.integration.workspaceId ?? 'Not saved yet'}`,
    `Record: ${detail.record.productName} on ${detail.record.blockName} at ${detail.record.ranchName}`,
    `Applied: ${formatAgworldDateOnly(detail.record.appliedDate)}`,
    `Verified: ${formatAgworldDate(detail.record.verifiedAt)}`,
    `Queue state: ${queueState}`,
    `Mapped paddock: ${detail.record.paddockId ?? 'Missing mapping'}`,
    `Latest sync: ${formatAgworldSyncStatus(detail.record.lastSync?.status ?? null)} at ${latestSyncLabel}`,
    `Attempts: ${detail.summary.attempts} total, ${detail.summary.successful} successful, ${detail.summary.failed} failed, ${detail.summary.conflicts} conflicts`,
  ];

  if (detail.summary.latestAgworldId) {
    lines.push(`Latest AgWorld id: ${detail.summary.latestAgworldId}`);
  }

  if (detail.summary.latestErrorMessage) {
    lines.push(`Latest blocker: ${detail.summary.latestErrorMessage}`);
  }

  const recentHistory = detail.history.slice(0, 5).map((entry) => {
    const parts = [
      formatAgworldDate(entry.syncedAt),
      formatAgworldSyncStatus(entry.status),
      entry.direction ? entry.direction.toUpperCase() : 'UNKNOWN',
    ];

    if (entry.agworldId) {
      parts.push(`AgWorld ${entry.agworldId}`);
    }

    if (entry.errorMessage) {
      parts.push(entry.errorMessage);
    }

    return `- ${parts.join(' | ')}`;
  });

  if (recentHistory.length > 0) {
    lines.push('Recent history:');
    lines.push(...recentHistory);
  }

  lines.push(`Next action: ${describeQueueAction(detail)}`);
  lines.push(latestDirectionBlockerLabel('Latest push', detail.record.lastPushSync));
  lines.push(latestDirectionBlockerLabel('Latest pull', detail.record.lastPullSync));

  return lines.join('\n');
}

function buildAgworldHandoffJson(detail: AgworldRecordReconciliationPayload, workspace: AgworldWorkspacePayload) {
  return {
    generatedAt: new Date().toISOString(),
    organization: workspace.organization,
    integration: detail.integration,
    summary: detail.summary,
    record: detail.record,
    history: detail.history,
  };
}

export default function AgworldSettingsPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [workspace, setWorkspace] = useState<AgworldWorkspacePayload>(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [workspaceId, setWorkspaceId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [autoPushSprayRecords, setAutoPushSprayRecords] = useState(false);
  const [autoPullRecommendations, setAutoPullRecommendations] = useState(false);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [sprayRecordFilter, setSprayRecordFilter] = useState<SprayRecordFilter>('needs_attention');
  const [syncLogFilter, setSyncLogFilter] = useState<SyncLogFilter>('all');
  const [syncDirectionFilter, setSyncDirectionFilter] = useState<SyncDirectionFilter>('all');
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedRecordDetail, setSelectedRecordDetail] = useState<AgworldRecordReconciliationPayload | null>(null);
  const [selectedReadback, setSelectedReadback] = useState<AgworldReadbackPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [readbackLoading, setReadbackLoading] = useState(false);
  const [detailErrorMessage, setDetailErrorMessage] = useState('');
  const [handoffMessage, setHandoffMessage] = useState('');
  const [detailHistoryStatusFilter, setDetailHistoryStatusFilter] = useState<DetailHistoryStatusFilter>('all');
  const [detailHistoryDirectionFilter, setDetailHistoryDirectionFilter] = useState<SyncDirectionFilter>('all');
  const [selectedSyncLogId, setSelectedSyncLogId] = useState<string | null>(null);
  const [lastSyncRun, setLastSyncRun] = useState<AgworldSyncResponse | null>(null);
  const [lastBatchReadback, setLastBatchReadback] = useState<AgworldBatchReadbackResponse | null>(null);

  const applyWorkspace = (nextWorkspace: AgworldWorkspacePayload) => {
    setWorkspace(nextWorkspace);
    setEnabled(nextWorkspace.integration.enabled);
    setWorkspaceId(nextWorkspace.integration.workspaceId ?? '');
    setAccessToken('');
    setRefreshToken('');
    setAutoPushSprayRecords(nextWorkspace.integration.autoPushSprayRecords);
    setAutoPullRecommendations(nextWorkspace.integration.autoPullRecommendations);
    setFieldMappings(
      Object.fromEntries(
        nextWorkspace.blocks.map((block) => [block.id, block.paddockId ?? '']),
      ),
    );
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const onboardingStatus = await fetchOnboardingStatus();
        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);

        if (!onboardingStatus.profile?.orgId || !['owner', 'manager'].includes(onboardingStatus.profile.role)) {
          return;
        }

        const payload = await fetchAgworldWorkspace();
        if (cancelled) {
          return;
        }

        applyWorkspace(payload);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load AgWorld settings.');
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

  const managerAccess = status?.profile?.role === 'owner' || status?.profile?.role === 'manager';

  useEffect(() => {
    const syncableRecordIds = new Set(
      workspace.exportableSprayRecords
        .filter((record) => Boolean(record.paddockId))
        .map((record) => record.id),
    );

    setSelectedRecordIds((current) => current.filter((id) => syncableRecordIds.has(id)));
  }, [workspace.exportableSprayRecords]);

  const preferredRecordIds = useMemo(() => {
    const orderedIds = [
      ...workspace.exportableSprayRecords
        .filter((record) => getSprayRecordQueueState(record) === 'retry')
        .map((record) => record.id),
      ...workspace.exportableSprayRecords
        .filter((record) => getSprayRecordQueueState(record) === 'mapping_required')
        .map((record) => record.id),
      ...workspace.exportableSprayRecords
        .filter((record) => getSprayRecordQueueState(record) === 'ready')
        .map((record) => record.id),
      ...workspace.exportableSprayRecords
        .filter((record) => getSprayRecordQueueState(record) === 'synced')
        .map((record) => record.id),
      ...workspace.recentSyncs
        .map((record) => record.ranchosId)
        .filter((recordId): recordId is string => Boolean(recordId)),
    ];

    return Array.from(new Set(orderedIds));
  }, [workspace.exportableSprayRecords, workspace.recentSyncs]);

  useEffect(() => {
    if (preferredRecordIds.length === 0) {
      setSelectedRecordId(null);
      return;
    }

    setSelectedRecordId((current) => (current && preferredRecordIds.includes(current) ? current : preferredRecordIds[0]!));
  }, [preferredRecordIds]);

  useEffect(() => {
    setHandoffMessage('');
    setSelectedReadback(null);
    setDetailHistoryStatusFilter('all');
    setDetailHistoryDirectionFilter('all');
  }, [selectedRecordId]);

  useEffect(() => {
    const availableIds = new Set([
      ...workspace.recentSyncs.map((entry) => entry.id),
      ...(selectedRecordDetail?.history.map((entry) => entry.id) ?? []),
    ]);

    setSelectedSyncLogId((current) => {
      if (current && availableIds.has(current)) {
        return current;
      }

      if (selectedRecordDetail?.history[0]?.id) {
        return selectedRecordDetail.history[0].id;
      }

      if (workspace.recentSyncs[0]?.id) {
        return workspace.recentSyncs[0].id;
      }

      return null;
    });
  }, [selectedRecordDetail, workspace.recentSyncs]);

  useEffect(() => {
    let cancelled = false;

    if (!managerAccess || !selectedRecordId) {
      setSelectedRecordDetail(null);
      setDetailErrorMessage('');
      setDetailLoading(false);
      return;
    }

    const loadDetail = async () => {
      setDetailLoading(true);
      setDetailErrorMessage('');

      try {
        const payload = await fetchAgworldRecordReconciliation(selectedRecordId);
        if (cancelled) {
          return;
        }

        setSelectedRecordDetail(payload);
      } catch (error) {
        if (!cancelled) {
          setSelectedRecordDetail(null);
          setDetailErrorMessage(error instanceof Error ? error.message : 'Unable to load AgWorld reconciliation detail.');
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [managerAccess, selectedRecordId, workspace.exportableSprayRecords, workspace.recentSyncs]);

  const sprayRecordCounts = useMemo(
    () =>
      workspace.exportableSprayRecords.reduce(
        (summary, record) => {
          const state = getSprayRecordQueueState(record);
          summary.all += 1;
          if (state !== 'synced') {
            summary.needsAttention += 1;
          }
          if (state === 'ready') {
            summary.ready += 1;
          } else if (state === 'mapping_required') {
            summary.mappingRequired += 1;
          } else if (state === 'retry') {
            summary.retry += 1;
          } else if (state === 'synced') {
            summary.synced += 1;
          }
          return summary;
        },
        {
          all: 0,
          needsAttention: 0,
          ready: 0,
          mappingRequired: 0,
          retry: 0,
          synced: 0,
        },
      ),
    [workspace.exportableSprayRecords],
  );

  const filteredSprayRecords = useMemo(
    () =>
      workspace.exportableSprayRecords.filter((record) =>
        matchesSprayRecordFilter(record, sprayRecordFilter)),
    [sprayRecordFilter, workspace.exportableSprayRecords],
  );

  const filteredRecentSyncs = useMemo(
    () =>
      workspace.recentSyncs.filter(
        (record) =>
          matchesSyncLogFilter(record, syncLogFilter) &&
          matchesSyncDirectionFilter(record, syncDirectionFilter),
      ),
    [syncDirectionFilter, syncLogFilter, workspace.recentSyncs],
  );
  const unmappedBlocks = useMemo(
    () => workspace.blocks.filter((block) => !block.paddockId),
    [workspace.blocks],
  );
  const mappingBlockedRecords = useMemo(
    () => workspace.exportableSprayRecords.filter((record) => getSprayRecordQueueState(record) === 'mapping_required'),
    [workspace.exportableSprayRecords],
  );
  const retryRecords = useMemo(
    () => workspace.exportableSprayRecords.filter((record) => getSprayRecordQueueState(record) === 'retry'),
    [workspace.exportableSprayRecords],
  );
  const readyRecords = useMemo(
    () => workspace.exportableSprayRecords.filter((record) => getSprayRecordQueueState(record) === 'ready'),
    [workspace.exportableSprayRecords],
  );
  const readinessChecklist = useMemo(
    () => [
      {
        label: 'Workspace id saved',
        complete: Boolean(workspace.integration.workspaceId),
        detail: workspace.integration.workspaceId
          ? `Using ${workspace.integration.workspaceId}.`
          : 'Add the AgWorld workspace id before attempting a push.',
      },
      {
        label: 'Access token on file',
        complete: workspace.integration.hasAccessToken,
        detail: workspace.integration.hasAccessToken
          ? 'A token is already stored for manual push attempts.'
          : 'Save an access token so RanchOS can authenticate push attempts.',
      },
      {
        label: 'Integration enabled',
        complete: workspace.integration.enabled,
        detail: workspace.integration.enabled
          ? 'The integration is allowed to run when the workspace is fully connected.'
          : 'Enable AgWorld after the workspace and token are ready.',
      },
      {
        label: 'Block mappings complete enough to push',
        complete: unmappedBlocks.length === 0 || readyRecords.length > 0,
        detail: unmappedBlocks.length === 0
          ? 'Every current RanchOS block has a saved paddock id.'
          : `${unmappedBlocks.length} block(s) still need a paddock id, but ${readyRecords.length} verified spray record(s) are currently push-ready.`,
      },
    ],
    [
      readyRecords.length,
      unmappedBlocks.length,
      workspace.integration.enabled,
      workspace.integration.hasAccessToken,
      workspace.integration.workspaceId,
    ],
  );
  const blockedRecordsByBlock = useMemo(() => {
    const counts = new Map<string, { blockName: string; ranchName: string; count: number }>();

    for (const record of mappingBlockedRecords) {
      const current = counts.get(record.blockId);
      if (current) {
        current.count += 1;
      } else {
        counts.set(record.blockId, {
          blockName: record.blockName,
          ranchName: record.ranchName,
          count: 1,
        });
      }
    }

    return Array.from(counts.values()).sort((left, right) => right.count - left.count || left.blockName.localeCompare(right.blockName));
  }, [mappingBlockedRecords]);
  const recentFailureReasons = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const sync of filteredRecentSyncs) {
      if (sync.status !== 'failed' && sync.status !== 'conflict') {
        continue;
      }

      const key = sync.errorMessage?.trim() || (sync.status === 'conflict' ? 'Conflict without detail.' : 'Failure without detail.');
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }

    return Array.from(grouped.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((left, right) => right.count - left.count || left.message.localeCompare(right.message))
      .slice(0, 4);
  }, [filteredRecentSyncs]);
  const mappingCoverageByRanch = useMemo(() => {
    const summary = new Map<string, { ranchName: string; totalBlocks: number; mappedBlocks: number; blockedRecords: number }>();

    for (const block of workspace.blocks) {
      const current = summary.get(block.ranchName) ?? {
        ranchName: block.ranchName,
        totalBlocks: 0,
        mappedBlocks: 0,
        blockedRecords: 0,
      };
      current.totalBlocks += 1;
      if (block.paddockId) {
        current.mappedBlocks += 1;
      }
      summary.set(block.ranchName, current);
    }

    for (const record of mappingBlockedRecords) {
      const current = summary.get(record.ranchName) ?? {
        ranchName: record.ranchName,
        totalBlocks: 0,
        mappedBlocks: 0,
        blockedRecords: 0,
      };
      current.blockedRecords += 1;
      summary.set(record.ranchName, current);
    }

    return Array.from(summary.values()).sort(
      (left, right) =>
        right.blockedRecords - left.blockedRecords ||
        left.mappedBlocks / Math.max(left.totalBlocks, 1) - right.mappedBlocks / Math.max(right.totalBlocks, 1) ||
        left.ranchName.localeCompare(right.ranchName),
    );
  }, [mappingBlockedRecords, workspace.blocks]);
  const selectedQueueState = selectedRecordDetail ? getSprayRecordQueueState(selectedRecordDetail.record) : null;
  const handoffSummary = selectedRecordDetail ? buildAgworldHandoffSummary(selectedRecordDetail, workspace) : '';
  const readbackReady =
    Boolean(selectedRecordDetail?.integration.connected) && Boolean(selectedRecordDetail?.summary.latestAgworldId);
  const comparisonIssues =
    selectedReadback?.comparison?.fields.filter((field) => field.status !== 'matched') ?? [];
  const filteredSelectedHistory = useMemo(
    () =>
      selectedRecordDetail?.history.filter(
        (entry) =>
          matchesDetailHistoryStatusFilter(entry, detailHistoryStatusFilter) &&
          matchesSyncDirectionFilter(entry, detailHistoryDirectionFilter),
      ) ?? [],
    [detailHistoryDirectionFilter, detailHistoryStatusFilter, selectedRecordDetail],
  );
  const selectedLatestPushSync = selectedRecordDetail?.record.lastPushSync ?? null;
  const selectedLatestPullSync = selectedRecordDetail?.record.lastPullSync ?? null;
  const selectedSyncLogEntry = useMemo(
    () =>
      (selectedRecordDetail?.history.find((entry) => entry.id === selectedSyncLogId) ??
        workspace.recentSyncs.find((entry) => entry.id === selectedSyncLogId)) ??
      null,
    [selectedRecordDetail, selectedSyncLogId, workspace.recentSyncs],
  );
  const selectedSyncLogRecentContext = useMemo(
    () => workspace.recentSyncs.find((entry) => entry.id === selectedSyncLogId) ?? null,
    [selectedSyncLogId, workspace.recentSyncs],
  );
  const syncRowHandoffSummary = selectedSyncLogEntry
    ? buildSyncRowHandoffSummary({
        entry: selectedSyncLogEntry,
        workspace,
        selectedRecordDetail,
        recentSync: selectedSyncLogRecentContext,
      })
    : '';
  const selectedQueueSummary = useMemo(
    () =>
      selectedRecordIds.reduce(
        (summary, recordId) => {
          const record = workspace.exportableSprayRecords.find((entry) => entry.id === recordId);
          if (!record) {
            return summary;
          }

          summary.total += 1;
          const state = getSprayRecordQueueState(record);
          if (state === 'mapping_required') {
            summary.mappingRequired += 1;
          } else if (state === 'retry') {
            summary.retry += 1;
          } else if (state === 'ready') {
            summary.ready += 1;
          } else if (state === 'synced') {
            summary.synced += 1;
          }

          if (record.lastSync?.agworldId) {
            summary.readbackReady += 1;
          }

          return summary;
        },
        {
          total: 0,
          mappingRequired: 0,
          retry: 0,
          ready: 0,
          synced: 0,
          readbackReady: 0,
        },
      ),
    [selectedRecordIds, workspace.exportableSprayRecords],
  );
  const batchHotspots = useMemo(() => {
    if (!lastBatchReadback) {
      return [];
    }

    const grouped = new Map<string, number>();
    for (const result of lastBatchReadback.results) {
      for (const field of result.comparison?.fields ?? []) {
        if (field.status === 'matched') {
          continue;
        }

        grouped.set(field.label, (grouped.get(field.label) ?? 0) + 1);
      }
    }

    return Array.from(grouped.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 8);
  }, [lastBatchReadback]);
  const batchIssueRows = useMemo(
    () => lastBatchReadback?.results.filter((result) => result.status !== 'success') ?? [],
    [lastBatchReadback],
  );
  const batchReadbackSummary = lastBatchReadback
    ? buildBatchReadbackHandoffSummary({ batch: lastBatchReadback, workspace })
    : '';
  const syncRunIssueRows = useMemo(
    () => lastSyncRun?.results.filter((result) => result.status !== 'success') ?? [],
    [lastSyncRun],
  );
  const syncRunHotspots = useMemo(() => {
    if (!lastSyncRun) {
      return [];
    }

    const grouped = new Map<string, number>();
    for (const row of lastSyncRun.results) {
      if (row.status === 'success') {
        continue;
      }

      grouped.set(row.message, (grouped.get(row.message) ?? 0) + 1);
    }

    return Array.from(grouped.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((left, right) => right.count - left.count || left.message.localeCompare(right.message))
      .slice(0, 8);
  }, [lastSyncRun]);
  const syncRunSummary = lastSyncRun
    ? buildSyncRunHandoffSummary({ syncRun: lastSyncRun, workspace })
    : '';
  const selectedReadbackableRecordIds = useMemo(
    () =>
      selectedRecordIds.filter((recordId) =>
        workspace.exportableSprayRecords.some(
          (record) => record.id === recordId && Boolean(record.lastSync?.agworldId),
        )),
    [selectedRecordIds, workspace.exportableSprayRecords],
  );

  const selectableFilteredRecordIds = useMemo(
    () =>
      filteredSprayRecords
        .filter((record) => Boolean(record.paddockId))
        .map((record) => record.id),
    [filteredSprayRecords],
  );

  const allFilteredSelected =
    selectableFilteredRecordIds.length > 0 &&
    selectableFilteredRecordIds.every((id) => selectedRecordIds.includes(id));

  const handleSave = async () => {
    if (!managerAccess) {
      return;
    }

    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    setHandoffMessage('');
    setLastSyncRun(null);
    setLastBatchReadback(null);

    try {
      const payload = await updateAgworldWorkspace({
        enabled,
        workspaceId,
        ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
        ...(refreshToken.trim() ? { refreshToken: refreshToken.trim() } : {}),
        autoPushSprayRecords,
        autoPullRecommendations,
        fieldMappings: workspace.blocks
          .map((block) => ({
            ranchosBlockId: block.id,
            agworldPaddockId: fieldMappings[block.id]?.trim() ?? '',
          }))
          .filter((entry) => entry.agworldPaddockId),
      });

      applyWorkspace(payload);
      setSuccessMessage('AgWorld settings saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save AgWorld settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (recordIds?: string[]) => {
    setSyncing(true);
    setErrorMessage('');
    setSuccessMessage('');
    setHandoffMessage('');
    setLastBatchReadback(null);

    try {
      const payload = await syncAgworldSprayRecords(recordIds);
      applyWorkspace(payload.workspace);
      setLastSyncRun(payload);
      setSelectedRecordIds([]);
      setSuccessMessage(
        `AgWorld sync ran for ${payload.summary.attempted} record(s): ${payload.summary.successful} succeeded, ${payload.summary.failed} failed, ${payload.summary.conflicts} conflicted.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sync AgWorld spray records.');
    } finally {
      setSyncing(false);
    }
  };

  const toggleRecordSelection = (recordId: string) => {
    setSelectedRecordId(recordId);
    setSelectedRecordIds((current) =>
      current.includes(recordId)
        ? current.filter((id) => id !== recordId)
        : [...current, recordId],
    );
  };

  const toggleAllFilteredRecords = () => {
    setSelectedRecordIds((current) => {
      if (allFilteredSelected) {
        return current.filter((id) => !selectableFilteredRecordIds.includes(id));
      }

      return Array.from(new Set([...current, ...selectableFilteredRecordIds]));
    });
  };

  const handleCopy = async (label: string, value: string) => {
    setErrorMessage('');

    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this browser.');
      }

      await navigator.clipboard.writeText(value);
      setHandoffMessage(`${label} copied to your clipboard.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const handleDownloadHandoff = () => {
    if (!selectedRecordDetail) {
      return;
    }

    setErrorMessage('');

    try {
      if (typeof window === 'undefined') {
        throw new Error('Download is unavailable in this environment.');
      }

      const blob = new Blob([JSON.stringify(buildAgworldHandoffJson(selectedRecordDetail, workspace), null, 2)], {
        type: 'application/json',
      });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      const recordLabel = selectedRecordDetail.record.blockName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'spray-record';

      link.href = blobUrl;
      link.download = `agworld-reconciliation-${recordLabel}-${stamp}.json`;
      link.click();

      window.URL.revokeObjectURL(blobUrl);
      setHandoffMessage('Selected AgWorld reconciliation detail downloaded as JSON.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download the current reconciliation detail.');
    }
  };

  const handleReadback = async () => {
    if (!selectedRecordId) {
      return;
    }

    setReadbackLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    setHandoffMessage('');
    setLastSyncRun(null);
    setLastBatchReadback(null);

    try {
      const payload = await readbackAgworldSprayRecord(selectedRecordId);
      applyWorkspace(payload.workspace);
      setSelectedRecordDetail(payload.reconciliation);
      setSelectedReadback(payload);
      if (payload.status === 'success') {
        setSuccessMessage('AgWorld readback completed and logged a successful pull attempt for the selected record.');
      } else {
        setErrorMessage(payload.errorMessage ?? 'AgWorld readback completed with a logged reconciliation blocker.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to read back the AgWorld spray record.');
      setSelectedReadback(null);
    } finally {
      setReadbackLoading(false);
    }
  };

  const handleBatchReadback = async () => {
    if (selectedReadbackableRecordIds.length === 0) {
      return;
    }

    setReadbackLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    setHandoffMessage('');
    setLastSyncRun(null);

    try {
      const payload = await readbackAgworldSprayRecords(selectedReadbackableRecordIds);
      applyWorkspace(payload.workspace);
      setLastBatchReadback(payload);

      const firstResult = payload.results[0];
      if (firstResult) {
        setSelectedRecordId(firstResult.recordId);
        setSelectedRecordDetail(firstResult.reconciliation);
        setSelectedReadback(firstResult);
      }

      setSuccessMessage(
        `AgWorld batch readback ran for ${payload.summary.attempted} record(s): ${payload.summary.successful} succeeded, ${payload.summary.failed} failed, ${payload.summary.conflicts} conflicted.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to run the AgWorld batch readback.');
    } finally {
      setReadbackLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading AgWorld settings...</div>;
  }

  if (!status?.profile?.orgId) {
    return (
      <div className="p-8 max-w-4xl mx-auto w-full">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">AgWorld integration</h1>
          <p className="mt-2 text-sm text-gray-600">
            Finish onboarding before connecting AgWorld.
          </p>
          <Link href="/onboarding" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            Return to onboarding
          </Link>
        </div>
      </div>
    );
  }

  if (!managerAccess) {
    return (
      <div className="p-8 max-w-4xl mx-auto w-full">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">AgWorld integration</h1>
          <p className="mt-2 text-sm text-gray-700">
            Crew roles can use RanchOS operations, but only managers or owners can connect external AgWorld access and field mappings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex flex-col gap-8 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Settings / AgWorld</p>
          <h1 className="text-3xl font-bold text-gray-900">AgWorld spray sync</h1>
          <p className="max-w-3xl text-sm text-gray-600">
            This first AgWorld slice persists workspace credentials, stores RanchOS block-to-paddock mappings, and pushes verified pesticide application records while logging every sync attempt.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSync(selectableFilteredRecordIds)}
            disabled={syncing || !workspace.integration.connected || selectableFilteredRecordIds.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className="h-4 w-4" />
            {syncing ? 'Syncing...' : 'Sync visible queue'}
          </button>
          <button
            type="button"
            onClick={() => void handleSync(selectedRecordIds)}
            disabled={syncing || !workspace.integration.connected || selectedRecordIds.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className="h-4 w-4" />
            {syncing ? 'Syncing...' : `Sync selected${selectedRecordIds.length ? ` (${selectedRecordIds.length})` : ''}`}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save AgWorld settings'}
          </button>
        </div>
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

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <div>
            <h2 className="font-semibold text-gray-900">AgWorld readiness</h2>
            <p className="mt-1 text-sm text-gray-500">
              Keep this integration grounded in the current persisted push and sync-log architecture. These checks show what still blocks a clean manual run.
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {readinessChecklist.map((item) => (
              <div key={item.label} className={`rounded-xl border px-4 py-4 text-sm ${checklistTone(item.complete)}`}>
                <p className="font-semibold">{item.complete ? 'Ready' : 'Needs setup'}: {item.label}</p>
                <p className="mt-2">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <div>
            <h2 className="font-semibold text-gray-900">Immediate reconciliation pressure</h2>
            <p className="mt-1 text-sm text-gray-500">
              Use the existing queue filters and persisted sync rows to work the next highest-value issue first.
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            <button
              type="button"
              onClick={() => setSprayRecordFilter('mapping_required')}
              className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100"
            >
              <span>
                <span className="block font-semibold">Mapping blockers</span>
                <span className="mt-1 block">{mappingBlockedRecords.length} verified spray record(s) are blocked by missing paddock mappings.</span>
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-amber-900">Focus queue</span>
            </button>

              <button
                type="button"
                onClick={() => {
                  setSprayRecordFilter('retry');
                  setSyncLogFilter('failed');
                  setSyncDirectionFilter('push');
                }}
                className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-900 hover:bg-red-100"
              >
                <span>
                  <span className="block font-semibold">Retry candidates</span>
                  <span className="mt-1 block">{workspace.summary.openPushBlockers} record(s) currently have an unresolved push blocker in the persisted log, with {retryRecords.length} visible queue candidate(s).</span>
                </span>
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-red-900">Review retries</span>
              </button>

            <button
              type="button"
              onClick={() => setSprayRecordFilter('ready')}
              className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm text-sky-900 hover:bg-sky-100"
            >
              <span>
                <span className="block font-semibold">Push-ready now</span>
                <span className="mt-1 block">{readyRecords.length} record(s) are currently mapped and ready for a first or repeat manual push.</span>
              </span>
              <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-sky-900">Show ready</span>
            </button>

              <button
                type="button"
                onClick={() => {
                  setSprayRecordFilter('synced');
                  setSyncLogFilter('all');
                  setSyncDirectionFilter('pull');
                }}
                className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-left text-sm text-violet-900 hover:bg-violet-100"
              >
                <span>
                  <span className="block font-semibold">Readback-ready records</span>
                  <span className="mt-1 block">{workspace.summary.readbackEligibleRecords} record(s) can use the explicit readback path, and {workspace.summary.openPullBlockers} currently show an unresolved pull blocker.</span>
                </span>
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-violet-900">Review pulls</span>
              </button>
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Mapped Blocks" value={workspace.summary.mappedBlocks} detail={`${workspace.summary.totalBlocks} total RanchOS blocks in the current org`} />
        <MetricCard label="Verified Spray Records" value={workspace.summary.exportableSprayRecords} detail="Eligible pesticide records ready for the current push path" />
        <MetricCard label="Readback Ready" value={workspace.summary.readbackEligibleRecords} detail="Records with a persisted AgWorld id available for manual pull/readback" />
        <MetricCard label="Push Success" value={workspace.summary.successfulPushSyncs} detail="Persisted push attempts that completed successfully" />
        <MetricCard label="Open Push Blockers" value={workspace.summary.openPushBlockers} detail={`${workspace.summary.failedPushSyncs + workspace.summary.conflictPushSyncs} failed/conflicted push rows logged overall`} />
        <MetricCard label="Open Pull Blockers" value={workspace.summary.openPullBlockers} detail={`${workspace.summary.failedPullSyncs + workspace.summary.conflictPullSyncs} failed/conflicted readback rows logged overall`} />
      </div>

      <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-sky-700" />
              <div>
                <h2 className="font-semibold text-gray-900">Connection</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Save the AgWorld workspace id and tokens RanchOS should use for manual spray pushes.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <label className="flex items-start gap-3 rounded-xl border border-ranch-border bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span>
                  <span className="font-semibold text-gray-900">Enable AgWorld</span>
                  <span className="mt-1 block text-gray-600">Keep the integration off until the workspace id, token, and paddock mappings are ready.</span>
                </span>
              </label>

              <label className="space-y-2 text-sm font-medium text-gray-700">
                <span>AgWorld workspace id</span>
                <input
                  type="text"
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  placeholder="wilbur-ellis-central-valley"
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-gray-700">
                  <span>Access token</span>
                  <input
                    type="password"
                    value={accessToken}
                    onChange={(event) => setAccessToken(event.target.value)}
                    placeholder={workspace.integration.hasAccessToken ? 'Saved token on file' : 'Paste AgWorld access token'}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                  <p className="text-xs text-gray-500">
                    {workspace.integration.hasAccessToken ? 'A token is already saved. Leave blank to keep it.' : 'Used for manual push attempts from RanchOS.'}
                  </p>
                </label>
                <label className="space-y-2 text-sm font-medium text-gray-700">
                  <span>Refresh token</span>
                  <input
                    type="password"
                    value={refreshToken}
                    onChange={(event) => setRefreshToken(event.target.value)}
                    placeholder={workspace.integration.hasRefreshToken ? 'Saved refresh token on file' : 'Optional refresh token'}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                  <p className="text-xs text-gray-500">
                    {workspace.integration.hasRefreshToken ? 'A refresh token is already saved. Leave blank to keep it.' : 'Stored now so later OAuth hardening has a persisted place to live.'}
                  </p>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-xl border border-ranch-border bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={autoPushSprayRecords}
                    onChange={(event) => setAutoPushSprayRecords(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span>
                    <span className="font-semibold text-gray-900">Auto-push spray records</span>
                    <span className="mt-1 block text-gray-600">Persist the intent now, even though this first slice still triggers pushes manually.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-ranch-border bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={autoPullRecommendations}
                    onChange={(event) => setAutoPullRecommendations(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span>
                    <span className="font-semibold text-gray-900">Auto-pull PCA recommendations</span>
                    <span className="mt-1 block text-gray-600">Stored now so a later task can wire AgWorld recommendation pull into manager-approved RanchOS work.</span>
                  </span>
                </label>
              </div>

              <div className="rounded-2xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
                <p><span className="font-semibold">Current state:</span> {workspace.integration.connected ? 'Connected for push attempts' : 'Not ready for push attempts yet'}</p>
                <p><span className="font-semibold">Created:</span> {formatAgworldDate(workspace.integration.createdAt)}</p>
                <p><span className="font-semibold">Token saved:</span> {workspace.integration.hasAccessToken ? 'Yes' : 'No'}</p>
                <p><span className="font-semibold">Workspace:</span> {workspace.integration.workspaceId ?? 'Not saved yet'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
            <div>
              <h2 className="font-semibold text-gray-900">Block to paddock mapping</h2>
              <p className="mt-1 text-sm text-gray-500">
                RanchOS stores these field mappings in the current org integration settings and uses them during spray pushes.
              </p>
            </div>

            <div className="mt-5 rounded-2xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
              <p><span className="font-semibold text-gray-900">Coverage:</span> {workspace.summary.mappedBlocks} of {workspace.summary.totalBlocks} blocks mapped</p>
              <p className="mt-1">
                <span className="font-semibold text-gray-900">Unmapped blocks:</span> {unmappedBlocks.length === 0 ? 'None' : unmappedBlocks.length}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-gray-900">Blocked verified spray records:</span> {mappingBlockedRecords.length}
              </p>
            </div>

            {mappingCoverageByRanch.length > 0 ? (
              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">Coverage by ranch</h3>
                  <p className="text-xs text-gray-500">Use this to finish mappings where the queue is actually blocked.</p>
                </div>
                <div className="mt-3 grid gap-3">
                  {mappingCoverageByRanch.map((entry) => (
                    <div key={entry.ranchName} className="rounded-xl border border-ranch-border bg-white px-4 py-3 text-sm text-gray-700">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{entry.ranchName}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {entry.mappedBlocks} of {entry.totalBlocks} block(s) mapped
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                            {entry.totalBlocks - entry.mappedBlocks} unmapped
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            entry.blockedRecords > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {entry.blockedRecords} blocked record(s)
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              {workspace.blocks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-ranch-border px-4 py-6 text-sm text-gray-600">
                  No blocks exist yet. Add blocks before mapping AgWorld paddocks.
                </div>
              ) : workspace.blocks.map((block) => (
                <div key={block.id} className="grid gap-3 rounded-xl border border-ranch-border bg-gray-50 px-4 py-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <p className="font-semibold text-gray-900">{block.name}</p>
                    <p className="text-sm text-gray-600">{block.ranchName}</p>
                    <p className="mt-1 text-xs text-gray-500">{block.active === false ? 'Inactive block' : 'Active block'}</p>
                  </div>
                  <label className="space-y-2 text-sm font-medium text-gray-700">
                    <span>AgWorld paddock id</span>
                    <input
                      type="text"
                      value={fieldMappings[block.id] ?? ''}
                      onChange={(event) => setFieldMappings((current) => ({
                        ...current,
                        [block.id]: event.target.value,
                      }))}
                      placeholder="AGW-12345"
                      className="w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Verified spray records ready now</h2>
              <p className="mt-1 text-sm text-gray-500">
                This first sync path uses verified pesticide application records only, so the AgWorld log stays grounded in reviewed compliance data.
              </p>
            </div>

            {workspace.exportableSprayRecords.length > 0 ? (
              <div className="flex flex-col gap-4 border-b border-ranch-border px-6 py-4">
                <div className="flex flex-wrap gap-2">
                  {sprayRecordFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSprayRecordFilter(option.value)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        sprayRecordFilter === option.value
                          ? 'bg-sky-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <span>{sprayRecordCounts.needsAttention} needing attention</span>
                  <span>{sprayRecordCounts.ready} ready first-push</span>
                  <span>{sprayRecordCounts.retry} retry candidates</span>
                    <span>{sprayRecordCounts.mappingRequired} missing mapping</span>
                    <span>{sprayRecordCounts.synced} already synced</span>
                  </div>
                  {blockedRecordsByBlock.length > 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-semibold">Current mapping blockers</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {blockedRecordsByBlock.map((entry) => (
                          <span key={`${entry.ranchName}-${entry.blockName}`} className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-amber-900">
                            {entry.blockName} ({entry.ranchName}) x {entry.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={toggleAllFilteredRecords}
                    disabled={selectableFilteredRecordIds.length === 0}
                    className="rounded-lg border border-ranch-border px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {allFilteredSelected ? 'Clear visible selection' : `Select visible syncable (${selectableFilteredRecordIds.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSync(selectedRecordIds)}
                    disabled={syncing || selectedRecordIds.length === 0 || !workspace.integration.connected}
                    className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {syncing ? 'Syncing selection...' : `Run selected sync (${selectedRecordIds.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBatchReadback()}
                    disabled={readbackLoading || selectedReadbackableRecordIds.length === 0 || !workspace.integration.connected}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {readbackLoading
                      ? 'Reading back selection...'
                      : `Read back selected (${selectedReadbackableRecordIds.length})`}
                  </button>
                </div>

                {selectedRecordIds.length > 0 || lastSyncRun || lastBatchReadback ? (
                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">Selection workbench</h3>
                          <p className="mt-1 text-xs text-gray-500">
                            Summarize the currently selected persisted spray queue before syncing or running batch readback.
                          </p>
                        </div>
                        {selectedRecordIds.length > 0 ? (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                            {selectedQueueSummary.total} selected
                          </span>
                        ) : null}
                      </div>
                      {selectedRecordIds.length === 0 ? (
                        <div className="mt-4 rounded-xl border border-dashed border-ranch-border px-4 py-6 text-sm text-gray-600">
                          Select one or more syncable records to see queue-state and readback readiness rollups here.
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Ready Now</p>
                            <p className="mt-2 text-2xl font-bold text-sky-900">{selectedQueueSummary.ready}</p>
                          </div>
                          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Retry</p>
                            <p className="mt-2 text-2xl font-bold text-red-900">{selectedQueueSummary.retry}</p>
                          </div>
                          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Readback Ready</p>
                            <p className="mt-2 text-2xl font-bold text-violet-900">{selectedQueueSummary.readbackReady}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-ranch-border bg-white p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">Latest sync run</h3>
                          <p className="mt-1 text-xs text-gray-500">
                            Summarize the most recent manual push run using the existing persisted sync results.
                          </p>
                        </div>
                        {lastSyncRun ? (
                          <button
                            type="button"
                            onClick={() => void handleCopy('AgWorld sync-run summary', syncRunSummary)}
                            className="inline-flex items-center gap-2 rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            <Copy className="h-4 w-4" />
                            Copy sync summary
                          </button>
                        ) : null}
                      </div>

                      {!lastSyncRun ? (
                        <div className="mt-4 rounded-xl border border-dashed border-ranch-border px-4 py-6 text-sm text-gray-600">
                          Run `Sync selected` or `Sync visible queue` to populate a push-run summary and blocker groups.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-4">
                          <div className="grid gap-3 md:grid-cols-4">
                            <div className="rounded-lg border border-ranch-border bg-gray-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Attempted</p>
                              <p className="mt-2 text-2xl font-bold text-gray-900">{lastSyncRun.summary.attempted}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Success</p>
                              <p className="mt-2 text-2xl font-bold text-emerald-900">{lastSyncRun.summary.successful}</p>
                            </div>
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Failed</p>
                              <p className="mt-2 text-2xl font-bold text-red-900">{lastSyncRun.summary.failed}</p>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Conflicts</p>
                              <p className="mt-2 text-2xl font-bold text-amber-900">{lastSyncRun.summary.conflicts}</p>
                            </div>
                          </div>

                          {syncRunHotspots.length > 0 ? (
                            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                              <p className="font-semibold text-gray-900">Top push blockers</p>
                              <div className="mt-3 grid gap-2">
                                {syncRunHotspots.map((hotspot) => (
                                  <div key={hotspot.message} className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
                                    <span>{hotspot.message}</span>
                                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{hotspot.count}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                              The latest manual push run completed without persisted blockers.
                            </div>
                          )}

                          {syncRunIssueRows.length > 0 ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                              <p className="font-semibold text-red-900">Rows still needing attention</p>
                              <div className="mt-3 grid gap-2">
                                {syncRunIssueRows.slice(0, 6).map((result) => (
                                  <button
                                    key={result.recordId}
                                    type="button"
                                    onClick={() => setSelectedRecordId(result.recordId)}
                                    className="rounded-lg bg-white px-3 py-3 text-left text-sm text-gray-700 hover:bg-red-100"
                                  >
                                    <p className="font-semibold text-gray-900">{result.blockName}</p>
                                    <p className="mt-1 text-xs text-red-700">
                                      {formatAgworldSyncStatus(result.status)} | {result.message}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <pre className="max-h-[14rem] overflow-auto rounded-xl bg-gray-900 p-4 text-xs text-sky-100">{syncRunSummary}</pre>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-ranch-border bg-white p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">Latest batch readback</h3>
                          <p className="mt-1 text-xs text-gray-500">
                            Aggregate the most recent batch readback using the existing explicit pull path and comparison results.
                          </p>
                        </div>
                        {lastBatchReadback ? (
                          <button
                            type="button"
                            onClick={() => void handleCopy('AgWorld batch handoff summary', batchReadbackSummary)}
                            className="inline-flex items-center gap-2 rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            <Copy className="h-4 w-4" />
                            Copy batch summary
                          </button>
                        ) : null}
                      </div>

                      {!lastBatchReadback ? (
                        <div className="mt-4 rounded-xl border border-dashed border-ranch-border px-4 py-6 text-sm text-gray-600">
                          Run `Read back selected` to populate a batch-level reconciliation summary and mismatch hotspots.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-4">
                          <div className="grid gap-3 md:grid-cols-4">
                            <div className="rounded-lg border border-ranch-border bg-gray-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Attempted</p>
                              <p className="mt-2 text-2xl font-bold text-gray-900">{lastBatchReadback.summary.attempted}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Success</p>
                              <p className="mt-2 text-2xl font-bold text-emerald-900">{lastBatchReadback.summary.successful}</p>
                            </div>
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Failed</p>
                              <p className="mt-2 text-2xl font-bold text-red-900">{lastBatchReadback.summary.failed}</p>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Conflicts</p>
                              <p className="mt-2 text-2xl font-bold text-amber-900">{lastBatchReadback.summary.conflicts}</p>
                            </div>
                          </div>

                          {batchHotspots.length > 0 ? (
                            <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                              <p className="font-semibold text-gray-900">Top mismatch hotspots</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {batchHotspots.map((hotspot) => (
                                  <span key={hotspot.label} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                                    {hotspot.label} x {hotspot.count}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                              No mismatch hotspots were found in the latest batch readback.
                            </div>
                          )}

                          {batchIssueRows.length > 0 ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                              <p className="font-semibold text-red-900">Rows still needing attention</p>
                              <div className="mt-3 grid gap-2">
                                {batchIssueRows.slice(0, 6).map((result) => (
                                  <button
                                    key={result.recordId}
                                    type="button"
                                    onClick={() => setSelectedRecordId(result.recordId)}
                                    className="rounded-lg bg-white px-3 py-3 text-left text-sm text-gray-700 hover:bg-red-100"
                                  >
                                    <p className="font-semibold text-gray-900">
                                      {result.reconciliation.record.productName} on {result.reconciliation.record.blockName}
                                    </p>
                                    <p className="mt-1 text-xs text-red-700">
                                      {formatAgworldSyncStatus(result.status)} | {result.errorMessage ?? 'No blocker detail'}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <pre className="max-h-[14rem] overflow-auto rounded-xl bg-gray-900 p-4 text-xs text-sky-100">{batchReadbackSummary}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {workspace.exportableSprayRecords.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">
                No verified pesticide application records are ready to sync yet.
              </div>
            ) : filteredSprayRecords.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">
                No verified spray records match this queue filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ranch-border text-sm">
                  <thead className="bg-white text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    <tr>
                      <th className="px-6 py-3">Select</th>
                      <th className="px-6 py-3">Record</th>
                      <th className="px-6 py-3">Queue State</th>
                      <th className="px-6 py-3">Mapped Paddock</th>
                      <th className="px-6 py-3">Last Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ranch-border bg-white">
                    {filteredSprayRecords.map((record) => {
                      const queueState = getSprayRecordQueueState(record);
                      const canSelect = Boolean(record.paddockId);

                      return (
                      <tr
                        key={record.id}
                        onClick={() => setSelectedRecordId(record.id)}
                        className={`align-top cursor-pointer ${
                          selectedRecordId === record.id ? 'bg-sky-50/70' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-6 py-4 text-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedRecordIds.includes(record.id)}
                            onChange={() => toggleRecordSelection(record.id)}
                            disabled={!canSelect}
                            className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          <p className="font-semibold text-gray-900">{record.productName}</p>
                          <p>{record.blockName} at {record.ranchName}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Applied {formatAgworldDateOnly(record.appliedDate)} | Verified {formatAgworldDate(record.verifiedAt)} | {record.acresTreated ?? '0.00'} acres
                          </p>
                          {record.targetPest ? <p className="mt-1 text-xs text-gray-500">Target pest: {record.targetPest}</p> : null}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            queueState === 'synced'
                              ? 'bg-emerald-50 text-emerald-700'
                              : queueState === 'retry'
                                ? 'bg-red-50 text-red-700'
                                : queueState === 'mapping_required'
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-sky-50 text-sky-700'
                          }`}>
                            {queueStateLabel(queueState)}
                          </span>
                          {!canSelect ? (
                            <p className="mt-2 text-xs text-amber-700">
                              Save a paddock mapping before this record can be selected for sync.
                            </p>
                          ) : null}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {record.paddockId ? (
                            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">{record.paddockId}</span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Mapping required</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${syncTone(record.lastSync?.status ?? null)}`}>
                            {formatAgworldSyncStatus(record.lastSync?.status ?? null)}
                          </span>
                          <p className="mt-2 text-xs text-gray-500">{formatAgworldDate(record.lastSync?.syncedAt ?? null)}</p>
                          {record.lastPushSync ? (
                            <p className="mt-1 text-xs text-gray-500">
                              Push: {formatAgworldSyncStatus(record.lastPushSync.status)} at {formatAgworldDate(record.lastPushSync.syncedAt)}
                            </p>
                          ) : null}
                          {record.lastPullSync ? (
                            <p className="mt-1 text-xs text-gray-500">
                              Pull: {formatAgworldSyncStatus(record.lastPullSync.status)} at {formatAgworldDate(record.lastPullSync.syncedAt)}
                            </p>
                          ) : null}
                          {record.lastSync?.errorMessage ? (
                            <p className="mt-1 text-xs text-red-600">{record.lastSync.errorMessage}</p>
                          ) : null}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Selected record reconciliation</h2>
              <p className="mt-1 text-sm text-gray-500">
                Drill into one verified spray record at a time using the existing persisted sync log and mapping state.
              </p>
            </div>

            {!selectedRecordId ? (
              <div className="px-6 py-8 text-sm text-gray-600">
                Select a verified spray record or a sync-log row to inspect its reconciliation history.
              </div>
            ) : detailLoading ? (
              <div className="px-6 py-8 text-sm text-gray-600">Loading reconciliation detail...</div>
            ) : detailErrorMessage ? (
              <div className="px-6 py-8 text-sm text-red-700">{detailErrorMessage}</div>
            ) : !selectedRecordDetail ? (
              <div className="px-6 py-8 text-sm text-gray-600">
                No persisted reconciliation detail is available for this record yet.
              </div>
            ) : (
              <div className="space-y-6 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-gray-900">{selectedRecordDetail.record.productName}</p>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        selectedQueueState === 'synced'
                          ? 'bg-emerald-50 text-emerald-700'
                          : selectedQueueState === 'retry'
                            ? 'bg-red-50 text-red-700'
                            : selectedQueueState === 'mapping_required'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-sky-50 text-sky-700'
                      }`}>
                        {queueStateLabel(selectedQueueState ?? 'ready')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {selectedRecordDetail.record.blockName} at {selectedRecordDetail.record.ranchName}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      <span>Applied {formatAgworldDateOnly(selectedRecordDetail.record.appliedDate)}</span>
                      <span>Verified {formatAgworldDate(selectedRecordDetail.record.verifiedAt)}</span>
                      <span>{selectedRecordDetail.record.acresTreated ?? '0.00'} acres</span>
                      <span>Paddock {selectedRecordDetail.record.paddockId ?? 'Not mapped'}</span>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:min-w-[22rem] lg:grid-cols-2">
                    <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      <p><span className="font-semibold text-gray-900">Latest sync:</span> {formatAgworldSyncStatus(selectedRecordDetail.record.lastSync?.status ?? null)}</p>
                      <p className="mt-1"><span className="font-semibold text-gray-900">At:</span> {formatAgworldDate(selectedRecordDetail.record.lastSync?.syncedAt ?? null)}</p>
                      <p className="mt-1"><span className="font-semibold text-gray-900">AgWorld id:</span> {selectedRecordDetail.summary.latestAgworldId ?? 'Not returned yet'}</p>
                    </div>
                    <div className="rounded-xl border border-ranch-border bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      <p><span className="font-semibold text-gray-900">Latest push:</span> {formatAgworldSyncStatus(selectedLatestPushSync?.status ?? null)}</p>
                      <p className="mt-1"><span className="font-semibold text-gray-900">Latest pull:</span> {formatAgworldSyncStatus(selectedLatestPullSync?.status ?? null)}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Push {formatAgworldDate(selectedLatestPushSync?.syncedAt ?? null)} | Pull {formatAgworldDate(selectedLatestPullSync?.syncedAt ?? null)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Attempts</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{selectedRecordDetail.summary.attempts}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Successful</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-900">{selectedRecordDetail.summary.successful}</p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Failed</p>
                    <p className="mt-2 text-2xl font-bold text-red-900">{selectedRecordDetail.summary.failed}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">Conflicts</p>
                    <p className="mt-2 text-2xl font-bold text-amber-900">{selectedRecordDetail.summary.conflicts}</p>
                  </div>
                </div>

                <div className={`rounded-xl border p-4 text-sm ${
                  selectedQueueState === 'mapping_required'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : selectedQueueState === 'retry'
                      ? 'border-red-200 bg-red-50 text-red-900'
                      : 'border-sky-200 bg-sky-50 text-sky-900'
                }`}>
                  <p className="font-semibold">Next action</p>
                  <p className="mt-2">{describeQueueAction(selectedRecordDetail)}</p>
                  {selectedRecordDetail.summary.latestErrorMessage ? (
                    <p className="mt-3 text-xs">
                      Latest blocker: {selectedRecordDetail.summary.latestErrorMessage}
                    </p>
                  ) : null}
                  {(selectedLatestPushSync?.errorMessage && selectedLatestPushSync.status !== 'success') || (selectedLatestPullSync?.errorMessage && selectedLatestPullSync.status !== 'success') ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div className="rounded-lg bg-white/70 px-3 py-3 text-xs">
                        <p className="font-semibold">Push blocker</p>
                        <p className="mt-1">{selectedLatestPushSync?.errorMessage ?? 'No unresolved push blocker.'}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 px-3 py-3 text-xs">
                        <p className="font-semibold">Pull blocker</p>
                        <p className="mt-1">{selectedLatestPullSync?.errorMessage ?? 'No unresolved pull blocker.'}</p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-ranch-border bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">Manual readback</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        Pull the latest AgWorld copy for this record using the most recent persisted AgWorld id, then log that readback as a pull attempt.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleReadback()}
                      disabled={readbackLoading || !readbackReady}
                      className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      {readbackLoading ? 'Reading back...' : 'Read latest AgWorld copy'}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-ranch-border bg-gray-50 p-3 text-sm text-gray-700">
                      <p><span className="font-semibold text-gray-900">Workspace connected:</span> {selectedRecordDetail.integration.connected ? 'Yes' : 'No'}</p>
                      <p className="mt-1"><span className="font-semibold text-gray-900">Latest AgWorld id:</span> {selectedRecordDetail.summary.latestAgworldId ?? 'Not on file yet'}</p>
                    </div>
                    <div className="rounded-lg border border-ranch-border bg-gray-50 p-3 text-sm text-gray-700">
                      <p><span className="font-semibold text-gray-900">Last pull status:</span> {selectedReadback ? formatAgworldSyncStatus(selectedReadback.status) : 'Not run in this session'}</p>
                      <p className="mt-1"><span className="font-semibold text-gray-900">Pulled at:</span> {selectedReadback ? formatAgworldDate(selectedReadback.syncedAt) : 'Not yet'}</p>
                    </div>
                    <div className="rounded-lg border border-ranch-border bg-gray-50 p-3 text-sm text-gray-700">
                      <p className="font-semibold text-gray-900">Readback prerequisites</p>
                      <p className="mt-1 text-xs text-gray-600">
                        This stays disabled until the record has a persisted AgWorld id and the current workspace is connected for authenticated reads.
                      </p>
                    </div>
                  </div>

                  {selectedReadback?.errorMessage ? (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {selectedReadback.errorMessage}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-xl border border-ranch-border bg-white shadow-sm">
                    <div className="border-b border-ranch-border bg-gray-50 px-4 py-3">
                      <h3 className="font-semibold text-gray-900">Current RanchOS outbound payload</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        The payload RanchOS would send today using the current persisted mapping and verified spray record.
                      </p>
                    </div>
                    <div className="p-4">
                      <pre className="max-h-[18rem] overflow-auto rounded-xl bg-gray-900 p-4 text-xs text-sky-100">
                        {JSON.stringify(selectedReadback?.outboundPayload ?? null, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div className="rounded-xl border border-ranch-border bg-white shadow-sm">
                    <div className="border-b border-ranch-border bg-gray-50 px-4 py-3">
                      <h3 className="font-semibold text-gray-900">Latest AgWorld readback</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        The most recent remote copy fetched through this session&apos;s explicit manual readback action.
                      </p>
                    </div>
                    <div className="p-4">
                      {selectedReadback?.remoteRecord ? (
                        <pre className="max-h-[18rem] overflow-auto rounded-xl bg-gray-900 p-4 text-xs text-sky-100">
                          {JSON.stringify(selectedReadback.remoteRecord, null, 2)}
                        </pre>
                      ) : (
                        <div className="rounded-xl border border-dashed border-ranch-border px-4 py-6 text-sm text-gray-600">
                          Run a manual readback to fetch the latest AgWorld copy for this spray record.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-ranch-border bg-white shadow-sm">
                  <div className="border-b border-ranch-border bg-gray-50 px-4 py-3">
                    <h3 className="font-semibold text-gray-900">Reconciliation comparison</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Field-by-field comparison between the current RanchOS outbound payload and the latest AgWorld readback.
                    </p>
                  </div>

                  {!selectedReadback?.comparison ? (
                    <div className="px-4 py-6 text-sm text-gray-600">
                      Run a manual readback to generate a structured comparison.
                    </div>
                  ) : (
                    <div className="space-y-4 p-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Matched</p>
                          <p className="mt-2 text-2xl font-bold text-emerald-900">{selectedReadback.comparison.summary.matched}</p>
                        </div>
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Mismatched</p>
                          <p className="mt-2 text-2xl font-bold text-red-900">{selectedReadback.comparison.summary.mismatched}</p>
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Missing Remote</p>
                          <p className="mt-2 text-2xl font-bold text-amber-900">{selectedReadback.comparison.summary.missingRemote}</p>
                        </div>
                        <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">Missing Local</p>
                          <p className="mt-2 text-2xl font-bold text-stone-900">{selectedReadback.comparison.summary.missingLocal}</p>
                        </div>
                      </div>

                      {comparisonIssues.length === 0 ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                          The latest AgWorld readback matches the current RanchOS payload across the tracked comparison fields.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-ranch-border text-sm">
                            <thead className="bg-white text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                              <tr>
                                <th className="px-3 py-2">Field</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">RanchOS</th>
                                <th className="px-3 py-2">AgWorld</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-ranch-border bg-white">
                              {comparisonIssues.map((field) => (
                                <tr key={field.path} className="align-top">
                                  <td className="px-3 py-3 font-medium text-gray-900">{field.label}</td>
                                  <td className="px-3 py-3">
                                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                      field.status === 'mismatch'
                                        ? 'bg-red-50 text-red-700'
                                        : field.status === 'missing_remote'
                                          ? 'bg-amber-50 text-amber-800'
                                          : 'bg-stone-100 text-stone-700'
                                    }`}>
                                      {formatAgworldSyncStatus(field.status)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-gray-700">{field.localValue ?? 'Not set'}</td>
                                  <td className="px-3 py-3 text-gray-700">{field.remoteValue ?? 'Not set'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">External handoff</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        Copy or download this persisted reconciliation trail without creating a second AgWorld access route.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleCopy('AgWorld handoff summary', handoffSummary)}
                        className="inline-flex items-center gap-2 rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Copy className="h-4 w-4" />
                        Copy summary
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadHandoff}
                        className="inline-flex items-center gap-2 rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Download className="h-4 w-4" />
                        Download JSON
                      </button>
                    </div>
                  </div>

                  {handoffMessage ? (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {handoffMessage}
                    </div>
                  ) : null}

                  <pre className="mt-4 max-h-[16rem] overflow-auto rounded-xl bg-gray-900 p-4 text-xs text-sky-100">{handoffSummary}</pre>
                </div>

                <div className="rounded-xl border border-ranch-border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">Selected sync row</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        Focus one persisted sync row at a time for handoff and blocker review.
                      </p>
                    </div>
                    {selectedSyncLogEntry ? (
                      <button
                        type="button"
                        onClick={() => void handleCopy('AgWorld sync row summary', syncRowHandoffSummary)}
                        className="inline-flex items-center gap-2 rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Copy className="h-4 w-4" />
                        Copy row summary
                      </button>
                    ) : null}
                  </div>

                  {!selectedSyncLogEntry ? (
                    <div className="mt-4 rounded-xl border border-dashed border-ranch-border px-4 py-6 text-sm text-gray-600">
                      Select a sync-history row or recent sync-log row to inspect a specific persisted attempt.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${syncTone(selectedSyncLogEntry.status)}`}>
                          {formatAgworldSyncStatus(selectedSyncLogEntry.status)}
                        </span>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                          {selectedSyncLogEntry.direction ? selectedSyncLogEntry.direction.toUpperCase() : 'Unknown direction'}
                        </span>
                        <span className="text-sm text-gray-600">{formatAgworldDate(selectedSyncLogEntry.syncedAt)}</span>
                        {selectedSyncLogEntry.agworldId ? (
                          <span className="text-xs text-gray-500">AgWorld id {selectedSyncLogEntry.agworldId}</span>
                        ) : null}
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-ranch-border bg-gray-50 p-3 text-sm text-gray-700">
                          <p className="font-semibold text-gray-900">Linked record</p>
                          <p className="mt-1">
                            {selectedSyncLogRecentContext?.productName ?? selectedRecordDetail?.record.productName ?? 'Unknown record'}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {selectedSyncLogRecentContext?.blockName ?? selectedRecordDetail?.record.blockName ?? 'Unknown block'}
                          </p>
                        </div>
                        <div className="rounded-lg border border-ranch-border bg-gray-50 p-3 text-sm text-gray-700">
                          <p className="font-semibold text-gray-900">Persisted row id</p>
                          <p className="mt-1 break-all">{selectedSyncLogEntry.id}</p>
                          <p className="mt-1 text-xs text-gray-500">RanchOS record {selectedSyncLogEntry.ranchosId ?? 'not linked'}</p>
                        </div>
                        <div className="rounded-lg border border-ranch-border bg-gray-50 p-3 text-sm text-gray-700">
                          <p className="font-semibold text-gray-900">Next action</p>
                          <p className="mt-1 text-xs text-gray-600">
                            {describeSyncLogRowAction(selectedSyncLogEntry, Boolean(selectedSyncLogEntry.ranchosId))}
                          </p>
                        </div>
                      </div>

                      {selectedSyncLogEntry.errorMessage ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                          {selectedSyncLogEntry.errorMessage}
                        </div>
                      ) : null}

                      <pre className="max-h-[14rem] overflow-auto rounded-xl bg-gray-900 p-4 text-xs text-sky-100">{syncRowHandoffSummary}</pre>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">Sync history</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        Drill into this record&apos;s persisted log by direction and issue state.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {detailHistoryStatusFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setDetailHistoryStatusFilter(option.value)}
                          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                            detailHistoryStatusFilter === option.value
                              ? 'bg-sky-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {syncDirectionFilterOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDetailHistoryDirectionFilter(option.value)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                          detailHistoryDirectionFilter === option.value
                            ? 'bg-violet-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    Showing {filteredSelectedHistory.length} of {selectedRecordDetail.history.length} persisted sync row(s).
                  </p>
                  <div className="mt-3 divide-y divide-ranch-border rounded-xl border border-ranch-border">
                    {selectedRecordDetail.history.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-gray-600">
                        No persisted sync rows exist for this record yet.
                      </div>
                    ) : filteredSelectedHistory.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-gray-600">
                        No persisted sync rows match the current direction and status filters.
                      </div>
                    ) : (
                      filteredSelectedHistory.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setSelectedSyncLogId(entry.id)}
                          className={`block w-full px-4 py-4 text-left text-sm text-gray-700 ${
                            selectedSyncLogId === entry.id ? 'bg-sky-50/70' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${syncTone(entry.status)}`}>
                              {formatAgworldSyncStatus(entry.status)}
                            </span>
                            <span>{entry.direction ? entry.direction.toUpperCase() : 'Unknown direction'}</span>
                            <span>{formatAgworldDate(entry.syncedAt)}</span>
                            {entry.agworldId ? <span className="text-xs text-gray-500">AgWorld id {entry.agworldId}</span> : null}
                          </div>
                          {entry.errorMessage ? (
                            <p className="mt-2 text-xs text-red-600">{entry.errorMessage}</p>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Recent AgWorld sync log</h2>
              <p className="mt-1 text-sm text-gray-500">
                Every push attempt writes a persisted row so the integration can be audited without relying on transient client state.
              </p>
            </div>

            {workspace.recentSyncs.length > 0 ? (
              <div className="border-b border-ranch-border px-6 py-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {syncLogFilterOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSyncLogFilter(option.value)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                          syncLogFilter === option.value
                            ? 'bg-sky-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {syncDirectionFilterOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSyncDirectionFilter(option.value)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                          syncDirectionFilter === option.value
                            ? 'bg-violet-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {recentFailureReasons.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-ranch-border bg-gray-50 p-4 text-sm text-gray-700">
                    <p className="font-semibold text-gray-900">Top recent failure reasons</p>
                    <div className="mt-3 grid gap-2">
                      {recentFailureReasons.map((reason) => (
                        <div key={reason.message} className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2">
                          <span className="text-gray-700">{reason.message}</span>
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{reason.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {workspace.recentSyncs.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">
                No AgWorld sync attempts have been logged yet.
              </div>
            ) : filteredRecentSyncs.length === 0 ? (
              <div className="px-6 py-8 text-sm text-gray-600">
                No sync log rows match the current status and direction filters.
              </div>
            ) : (
              <div className="divide-y divide-ranch-border">
                {filteredRecentSyncs.map((sync) => (
                  <button
                    key={sync.id}
                    type="button"
                    onClick={() => {
                      if (sync.ranchosId) {
                        setSelectedRecordId(sync.ranchosId);
                      }
                      setSelectedSyncLogId(sync.id);
                    }}
                    className={`block w-full px-6 py-4 text-left text-sm text-gray-700 ${
                      selectedSyncLogId === sync.id || (sync.ranchosId && selectedRecordId === sync.ranchosId)
                        ? 'bg-sky-50/70'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${syncTone(sync.status)}`}>
                        {formatAgworldSyncStatus(sync.status)}
                      </span>
                      <span>{sync.direction ? sync.direction.toUpperCase() : 'Unknown direction'}</span>
                      <span>{formatAgworldDate(sync.syncedAt)}</span>
                      {sync.agworldId ? <span className="text-xs text-gray-500">AgWorld id {sync.agworldId}</span> : null}
                    </div>
                    <p className="mt-2 font-medium text-gray-900">
                      {sync.productName ?? 'Unnamed spray record'}{sync.blockName ? ` on ${sync.blockName}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {sync.appliedDate ? `Applied ${formatAgworldDateOnly(sync.appliedDate)}` : 'No applied date recorded'}
                    </p>
                    {sync.errorMessage ? (
                      <p className="mt-2 text-xs text-red-600">{sync.errorMessage}</p>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
