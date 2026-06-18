import { Hono } from 'hono';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  agworldSyncLog,
  applicationRecords,
  blocks,
  orgIntegrations,
  organizations,
  products,
  ranches,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import {
  buildAgworldFieldMappingMap,
  buildAgworldSprayPayload,
  compareAgworldSprayPayloads,
  fetchAgworldSprayRecord,
  parseAgworldSettings,
  pushAgworldSprayRecord,
  serializeAgworldSettings,
  type AgworldFieldMapping,
} from '../services/agworld';

const app = new Hono<{ Variables: { orgId: string; profileId: string; userRole: string } }>();

app.use('*', orgScopeMiddleware);

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  return null;
}

function normalizeSecretField(value: unknown) {
  if (value === undefined) {
    return { provided: false, value: null };
  }

  if (value === null) {
    return { provided: true, value: null };
  }

  const normalized = normalizeText(value);
  return {
    provided: true,
    value: normalized,
  };
}

function normalizeFieldMappings(value: unknown, validBlockIds: Set<string>) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error('Field mappings must be an array.');
  }

  const deduped = new Map<string, AgworldFieldMapping>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Field mappings must use block and paddock ids.');
    }

    const row = entry as Record<string, unknown>;
    const ranchosBlockId = normalizeText(row.ranchosBlockId);
    const agworldPaddockId = normalizeText(row.agworldPaddockId);

    if (!ranchosBlockId || !agworldPaddockId) {
      throw new Error('Each field mapping requires a RanchOS block and AgWorld paddock id.');
    }

    if (!validBlockIds.has(ranchosBlockId)) {
      throw new Error('Field mappings must stay inside the current organization.');
    }

    deduped.set(ranchosBlockId, {
      ranchosBlockId,
      agworldPaddockId,
    });
  }

  return Array.from(deduped.values());
}

function normalizeRecordIds(value: unknown) {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error('Record ids must be an array.');
  }

  const ids = Array.from(
    new Set(
      value
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );

  if (ids.length === 0) {
    throw new Error('At least one record id is required.');
  }

  return ids;
}

function requireManagerAccess(userRole: string) {
  if (userRole === 'owner' || userRole === 'manager') {
    return null;
  }

  return { error: 'Manager or owner access is required.' } as const;
}

function buildLatestSyncSnapshot(row: {
  status: string | null;
  syncedAt: Date | null;
  errorMessage: string | null;
  agworldId: string | null;
} | null) {
  if (!row) {
    return null;
  }

  return {
    status: row.status,
    syncedAt: row.syncedAt,
    errorMessage: row.errorMessage,
    agworldId: row.agworldId,
  };
}

function buildDirectionSyncMaps(
  rows: Array<{
    ranchosId: string | null;
    direction: string | null;
    status: string | null;
    syncedAt: Date | null;
    errorMessage: string | null;
    agworldId: string | null;
  }>,
) {
  const latestSyncByRecordId = new Map<string, ReturnType<typeof buildLatestSyncSnapshot>>();
  const latestPushSyncByRecordId = new Map<string, ReturnType<typeof buildLatestSyncSnapshot>>();
  const latestPullSyncByRecordId = new Map<string, ReturnType<typeof buildLatestSyncSnapshot>>();

  for (const row of rows) {
    if (!row.ranchosId) {
      continue;
    }

    const latestSync = buildLatestSyncSnapshot(row);
    if (!latestSync) {
      continue;
    }

    if (!latestSyncByRecordId.has(row.ranchosId)) {
      latestSyncByRecordId.set(row.ranchosId, latestSync);
    }

    if (row.direction === 'push' && !latestPushSyncByRecordId.has(row.ranchosId)) {
      latestPushSyncByRecordId.set(row.ranchosId, latestSync);
    }

    if (row.direction === 'pull' && !latestPullSyncByRecordId.has(row.ranchosId)) {
      latestPullSyncByRecordId.set(row.ranchosId, latestSync);
    }
  }

  return {
    latestSyncByRecordId,
    latestPushSyncByRecordId,
    latestPullSyncByRecordId,
  };
}

async function loadAgworldWorkspace(orgId: string) {
  const [organization, integration, blockRows, exportableCountRows, syncSummaryRows, latestBlockerRows] =
    await Promise.all([
      db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      }),
      db.query.orgIntegrations.findFirst({
        where: and(eq(orgIntegrations.orgId, orgId), eq(orgIntegrations.integrationType, 'agworld')),
      }),
      db
        .select({
          id: blocks.id,
          name: blocks.name,
          ranchName: ranches.name,
          active: blocks.active,
        })
        .from(blocks)
        .innerJoin(ranches, eq(blocks.ranchId, ranches.id))
        .where(eq(blocks.orgId, orgId))
        .orderBy(ranches.name, blocks.name),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(applicationRecords)
        .where(
          and(
            eq(applicationRecords.orgId, orgId),
            eq(applicationRecords.recordType, 'pesticide'),
            isNotNull(applicationRecords.verifiedAt),
          ),
        ),
      db
        .select({
          successfulSpraySyncs: sql<number>`count(*) filter (where ${agworldSyncLog.syncType} = 'spray_record' and ${agworldSyncLog.status} = 'success')::int`,
          failedSpraySyncs: sql<number>`count(*) filter (where ${agworldSyncLog.syncType} = 'spray_record' and ${agworldSyncLog.status} = 'failed')::int`,
          conflictSpraySyncs: sql<number>`count(*) filter (where ${agworldSyncLog.syncType} = 'spray_record' and ${agworldSyncLog.status} = 'conflict')::int`,
          successfulPushSyncs: sql<number>`count(*) filter (where ${agworldSyncLog.syncType} = 'spray_record' and ${agworldSyncLog.direction} = 'push' and ${agworldSyncLog.status} = 'success')::int`,
          failedPushSyncs: sql<number>`count(*) filter (where ${agworldSyncLog.syncType} = 'spray_record' and ${agworldSyncLog.direction} = 'push' and ${agworldSyncLog.status} = 'failed')::int`,
          conflictPushSyncs: sql<number>`count(*) filter (where ${agworldSyncLog.syncType} = 'spray_record' and ${agworldSyncLog.direction} = 'push' and ${agworldSyncLog.status} = 'conflict')::int`,
          successfulPullSyncs: sql<number>`count(*) filter (where ${agworldSyncLog.syncType} = 'spray_record' and ${agworldSyncLog.direction} = 'pull' and ${agworldSyncLog.status} = 'success')::int`,
          failedPullSyncs: sql<number>`count(*) filter (where ${agworldSyncLog.syncType} = 'spray_record' and ${agworldSyncLog.direction} = 'pull' and ${agworldSyncLog.status} = 'failed')::int`,
          conflictPullSyncs: sql<number>`count(*) filter (where ${agworldSyncLog.syncType} = 'spray_record' and ${agworldSyncLog.direction} = 'pull' and ${agworldSyncLog.status} = 'conflict')::int`,
        })
        .from(agworldSyncLog)
        .where(eq(agworldSyncLog.orgId, orgId)),
      db
        .select({
          ranchosId: agworldSyncLog.ranchosId,
          direction: agworldSyncLog.direction,
          status: agworldSyncLog.status,
          syncedAt: agworldSyncLog.syncedAt,
          errorMessage: agworldSyncLog.errorMessage,
          agworldId: agworldSyncLog.agworldId,
        })
        .from(agworldSyncLog)
        .where(
          and(
            eq(agworldSyncLog.orgId, orgId),
            eq(agworldSyncLog.syncType, 'spray_record'),
            isNotNull(agworldSyncLog.ranchosId),
          ),
        )
        .orderBy(desc(agworldSyncLog.syncedAt)),
    ]);

  if (!organization) {
    throw new Error('Organization not found.');
  }

  const settings = parseAgworldSettings(integration?.settings ?? null);
  const mappingByBlockId = buildAgworldFieldMappingMap(settings.fieldMappings);

  const exportableRows = await db
    .select({
      id: applicationRecords.id,
      blockId: applicationRecords.blockId,
      appliedDate: applicationRecords.appliedDate,
      verifiedAt: applicationRecords.verifiedAt,
      acresTreated: applicationRecords.acresTreated,
      targetPest: applicationRecords.targetPest,
      blockName: blocks.name,
      ranchName: ranches.name,
      productName: sql<string>`coalesce(${products.productName}, ${applicationRecords.productNameManual}, 'Unnamed product')`,
    })
    .from(applicationRecords)
    .innerJoin(blocks, eq(applicationRecords.blockId, blocks.id))
    .innerJoin(ranches, eq(blocks.ranchId, ranches.id))
    .leftJoin(products, eq(applicationRecords.productId, products.id))
    .where(
      and(
        eq(applicationRecords.orgId, orgId),
        eq(applicationRecords.recordType, 'pesticide'),
        isNotNull(applicationRecords.verifiedAt),
      ),
    )
    .orderBy(desc(applicationRecords.appliedDate), desc(applicationRecords.verifiedAt))
    .limit(10);

  const exportableRecordIds = exportableRows.map((row) => row.id);
  const latestSyncRows = exportableRecordIds.length
    ? await db
        .select({
          ranchosId: agworldSyncLog.ranchosId,
          direction: agworldSyncLog.direction,
          status: agworldSyncLog.status,
          syncedAt: agworldSyncLog.syncedAt,
          errorMessage: agworldSyncLog.errorMessage,
          agworldId: agworldSyncLog.agworldId,
        })
        .from(agworldSyncLog)
        .where(
          and(
            eq(agworldSyncLog.orgId, orgId),
            eq(agworldSyncLog.syncType, 'spray_record'),
            inArray(agworldSyncLog.ranchosId, exportableRecordIds),
          ),
        )
        .orderBy(desc(agworldSyncLog.syncedAt))
    : [];

  const { latestSyncByRecordId, latestPushSyncByRecordId, latestPullSyncByRecordId } =
    buildDirectionSyncMaps(latestSyncRows);
  const latestBlockerMaps = buildDirectionSyncMaps(latestBlockerRows);
  const openPushBlockers = Array.from(latestBlockerMaps.latestPushSyncByRecordId.values()).filter(
    (entry) => entry?.status === 'failed' || entry?.status === 'conflict',
  ).length;
  const openPullBlockers = Array.from(latestBlockerMaps.latestPullSyncByRecordId.values()).filter(
    (entry) => entry?.status === 'failed' || entry?.status === 'conflict',
  ).length;

  const recentSyncRows = await db
    .select({
      id: agworldSyncLog.id,
      syncType: agworldSyncLog.syncType,
      direction: agworldSyncLog.direction,
      status: agworldSyncLog.status,
      agworldId: agworldSyncLog.agworldId,
      ranchosId: agworldSyncLog.ranchosId,
      errorMessage: agworldSyncLog.errorMessage,
      syncedAt: agworldSyncLog.syncedAt,
      blockName: blocks.name,
      appliedDate: applicationRecords.appliedDate,
      productName: sql<string | null>`coalesce(${products.productName}, ${applicationRecords.productNameManual})`,
    })
    .from(agworldSyncLog)
    .leftJoin(applicationRecords, eq(agworldSyncLog.ranchosId, applicationRecords.id))
    .leftJoin(blocks, eq(applicationRecords.blockId, blocks.id))
    .leftJoin(products, eq(applicationRecords.productId, products.id))
    .where(and(eq(agworldSyncLog.orgId, orgId), eq(agworldSyncLog.syncType, 'spray_record')))
    .orderBy(desc(agworldSyncLog.syncedAt))
    .limit(12);

  return {
    organization: {
      id: organization.id,
      name: organization.name,
    },
    integration: {
      enabled: integration?.isActive ?? false,
      connected: Boolean(integration?.isActive && integration?.accessToken && integration?.realmId),
      hasAccessToken: Boolean(integration?.accessToken),
      hasRefreshToken: Boolean(integration?.refreshToken),
      workspaceId: integration?.realmId ?? null,
      autoPushSprayRecords: settings.autoPushSprayRecords,
      autoPullRecommendations: settings.autoPullRecommendations,
      fieldMappings: settings.fieldMappings,
      createdAt: integration?.createdAt ?? null,
    },
    summary: {
      totalBlocks: blockRows.length,
      mappedBlocks: blockRows.filter((row) => mappingByBlockId.has(row.id)).length,
      exportableSprayRecords: exportableCountRows[0]?.count ?? 0,
      readbackEligibleRecords: exportableRows.filter((row) => {
        const latestSync = latestSyncByRecordId.get(row.id);
        return Boolean(latestSync?.agworldId);
      }).length,
      successfulSpraySyncs: syncSummaryRows[0]?.successfulSpraySyncs ?? 0,
      failedSpraySyncs: syncSummaryRows[0]?.failedSpraySyncs ?? 0,
      conflictSpraySyncs: syncSummaryRows[0]?.conflictSpraySyncs ?? 0,
      successfulPushSyncs: syncSummaryRows[0]?.successfulPushSyncs ?? 0,
      failedPushSyncs: syncSummaryRows[0]?.failedPushSyncs ?? 0,
      conflictPushSyncs: syncSummaryRows[0]?.conflictPushSyncs ?? 0,
      successfulPullSyncs: syncSummaryRows[0]?.successfulPullSyncs ?? 0,
      failedPullSyncs: syncSummaryRows[0]?.failedPullSyncs ?? 0,
      conflictPullSyncs: syncSummaryRows[0]?.conflictPullSyncs ?? 0,
      openPushBlockers,
      openPullBlockers,
    },
    blocks: blockRows.map((row) => ({
      ...row,
      paddockId: mappingByBlockId.get(row.id) ?? null,
    })),
    exportableSprayRecords: exportableRows.map((row) => ({
      ...row,
      paddockId: mappingByBlockId.get(row.blockId) ?? null,
      lastSync: latestSyncByRecordId.get(row.id) ?? null,
      lastPushSync: latestPushSyncByRecordId.get(row.id) ?? null,
      lastPullSync: latestPullSyncByRecordId.get(row.id) ?? null,
    })),
    recentSyncs: recentSyncRows,
  };
}

async function loadAgworldSprayRecordReconciliation(orgId: string, recordId: string) {
  const [integration, recordRow, historyRows] = await Promise.all([
    db.query.orgIntegrations.findFirst({
      where: and(eq(orgIntegrations.orgId, orgId), eq(orgIntegrations.integrationType, 'agworld')),
    }),
    db
      .select({
        id: applicationRecords.id,
        blockId: applicationRecords.blockId,
        appliedDate: applicationRecords.appliedDate,
        verifiedAt: applicationRecords.verifiedAt,
        acresTreated: applicationRecords.acresTreated,
        targetPest: applicationRecords.targetPest,
        blockName: blocks.name,
        ranchName: ranches.name,
        productName: sql<string>`coalesce(${products.productName}, ${applicationRecords.productNameManual}, 'Unnamed product')`,
      })
      .from(applicationRecords)
      .innerJoin(blocks, eq(applicationRecords.blockId, blocks.id))
      .innerJoin(ranches, eq(blocks.ranchId, ranches.id))
      .leftJoin(products, eq(applicationRecords.productId, products.id))
      .where(
        and(
          eq(applicationRecords.orgId, orgId),
          eq(applicationRecords.recordType, 'pesticide'),
          eq(applicationRecords.id, recordId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        id: agworldSyncLog.id,
        syncType: agworldSyncLog.syncType,
        direction: agworldSyncLog.direction,
        status: agworldSyncLog.status,
        agworldId: agworldSyncLog.agworldId,
        ranchosId: agworldSyncLog.ranchosId,
        errorMessage: agworldSyncLog.errorMessage,
        syncedAt: agworldSyncLog.syncedAt,
      })
      .from(agworldSyncLog)
      .where(
        and(
          eq(agworldSyncLog.orgId, orgId),
          eq(agworldSyncLog.syncType, 'spray_record'),
          eq(agworldSyncLog.ranchosId, recordId),
        ),
      )
      .orderBy(desc(agworldSyncLog.syncedAt)),
  ]);

  if (!recordRow) {
    throw new Error('Spray record not found for this organization.');
  }

  const settings = parseAgworldSettings(integration?.settings ?? null);
  const mappingByBlockId = buildAgworldFieldMappingMap(settings.fieldMappings);
  const { latestSyncByRecordId, latestPushSyncByRecordId, latestPullSyncByRecordId } =
    buildDirectionSyncMaps(historyRows);
  const latestSync = latestSyncByRecordId.get(recordId) ?? null;
  const summary = historyRows.reduce(
    (current, row) => {
      current.attempts += 1;
      if (row.status === 'success') {
        current.successful += 1;
      } else if (row.status === 'failed') {
        current.failed += 1;
      } else if (row.status === 'conflict') {
        current.conflicts += 1;
      }

      return current;
    },
    {
      attempts: 0,
      successful: 0,
      failed: 0,
      conflicts: 0,
    },
  );

  return {
    integration: {
      enabled: integration?.isActive ?? false,
      connected: Boolean(integration?.isActive && integration?.accessToken && integration?.realmId),
      hasAccessToken: Boolean(integration?.accessToken),
      workspaceId: integration?.realmId ?? null,
    },
    record: {
      ...recordRow,
      paddockId: mappingByBlockId.get(recordRow.blockId) ?? null,
      lastSync: latestSync,
      lastPushSync: latestPushSyncByRecordId.get(recordId) ?? null,
      lastPullSync: latestPullSyncByRecordId.get(recordId) ?? null,
    },
    summary: {
      ...summary,
      latestErrorMessage: latestSync?.status === 'success' ? null : latestSync?.errorMessage ?? null,
      latestAgworldId: latestSync?.agworldId ?? null,
    },
    history: historyRows,
  };
}

async function loadAgworldSprayRecordForSync(orgId: string, recordId: string) {
  return db
    .select({
      id: applicationRecords.id,
      blockId: applicationRecords.blockId,
      appliedDate: applicationRecords.appliedDate,
      appliedStartTime: applicationRecords.appliedStartTime,
      appliedEndTime: applicationRecords.appliedEndTime,
      applicatorName: applicationRecords.applicatorName,
      applicatorLicense: applicationRecords.applicatorLicense,
      acresTreated: applicationRecords.acresTreated,
      ratePerAcre: applicationRecords.ratePerAcre,
      rateUnit: applicationRecords.rateUnit,
      totalProductUsed: applicationRecords.totalProductUsed,
      totalProductUnit: applicationRecords.totalProductUnit,
      waterVolumeGpa: applicationRecords.waterVolumeGpa,
      targetPest: applicationRecords.targetPest,
      notes: applicationRecords.notes,
      verifiedAt: applicationRecords.verifiedAt,
      reiExpiry: applicationRecords.reiExpiry,
      windSpeedMph: applicationRecords.windSpeedMph,
      windDirection: applicationRecords.windDirection,
      tempF: applicationRecords.tempF,
      isOrganicBlock: applicationRecords.isOrganicBlock,
      omriConfirmed: applicationRecords.omriConfirmed,
      certifierNotified: applicationRecords.certifierNotified,
      blockName: blocks.name,
      ranchName: ranches.name,
      productName: sql<string>`coalesce(${products.productName}, ${applicationRecords.productNameManual}, 'Unnamed product')`,
      epaRegNumber: sql<string | null>`coalesce(${products.epaRegNumber}, ${applicationRecords.epaRegNumber})`,
    })
    .from(applicationRecords)
    .innerJoin(blocks, eq(applicationRecords.blockId, blocks.id))
    .innerJoin(ranches, eq(blocks.ranchId, ranches.id))
    .leftJoin(products, eq(applicationRecords.productId, products.id))
    .where(
      and(
        eq(applicationRecords.orgId, orgId),
        eq(applicationRecords.recordType, 'pesticide'),
        eq(applicationRecords.id, recordId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function runAgworldSprayRecordReadback(input: {
  orgId: string;
  recordId: string;
  accessToken: string;
  workspaceId: string;
  mappingByBlockId: Map<string, string>;
}) {
  const recordRow = await loadAgworldSprayRecordForSync(input.orgId, input.recordId);
  if (!recordRow) {
    throw new Error('Spray record not found for this organization.');
  }

  const paddockId = input.mappingByBlockId.get(recordRow.blockId);
  const outboundPayload = buildAgworldSprayPayload({
    workspaceId: input.workspaceId,
    paddockId: paddockId ?? 'missing-mapping',
    ranchosRecordId: recordRow.id,
    appliedDate: recordRow.appliedDate,
    appliedStartTime: recordRow.appliedStartTime,
    appliedEndTime: recordRow.appliedEndTime,
    applicatorName: recordRow.applicatorName,
    applicatorLicense: recordRow.applicatorLicense,
    blockName: recordRow.blockName,
    ranchName: recordRow.ranchName,
    productName: recordRow.productName,
    epaRegNumber: recordRow.epaRegNumber,
    acresTreated: recordRow.acresTreated,
    ratePerAcre: recordRow.ratePerAcre,
    rateUnit: recordRow.rateUnit,
    totalProductUsed: recordRow.totalProductUsed,
    totalProductUnit: recordRow.totalProductUnit,
    waterVolumeGpa: recordRow.waterVolumeGpa,
    targetPest: recordRow.targetPest,
    notes: recordRow.notes,
    verifiedAt: recordRow.verifiedAt,
    reiExpiry: recordRow.reiExpiry,
    windSpeedMph: recordRow.windSpeedMph,
    windDirection: recordRow.windDirection,
    tempF: recordRow.tempF,
    isOrganicBlock: recordRow.isOrganicBlock,
    omriConfirmed: recordRow.omriConfirmed,
    certifierNotified: recordRow.certifierNotified,
  });

  const latestSyncedRow = await db
    .select({
      agworldId: agworldSyncLog.agworldId,
    })
    .from(agworldSyncLog)
    .where(
      and(
        eq(agworldSyncLog.orgId, input.orgId),
        eq(agworldSyncLog.syncType, 'spray_record'),
        eq(agworldSyncLog.ranchosId, input.recordId),
        isNotNull(agworldSyncLog.agworldId),
      ),
    )
    .orderBy(desc(agworldSyncLog.syncedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!latestSyncedRow?.agworldId) {
    const [logRow] = await db
      .insert(agworldSyncLog)
      .values({
        orgId: input.orgId,
        syncType: 'spray_record',
        ranchosId: input.recordId,
        direction: 'pull',
        status: 'conflict',
        errorMessage: 'No AgWorld id is on file for this spray record yet.',
      })
      .returning({
        syncedAt: agworldSyncLog.syncedAt,
        status: agworldSyncLog.status,
        errorMessage: agworldSyncLog.errorMessage,
      });

    return {
      recordId: input.recordId,
      agworldId: null,
      syncedAt: logRow?.syncedAt ?? null,
      status: logRow?.status ?? 'conflict',
      errorMessage: logRow?.errorMessage ?? 'No AgWorld id is on file for this spray record yet.',
      outboundPayload,
      remoteRecord: null,
      comparison: null,
      reconciliation: await loadAgworldSprayRecordReconciliation(input.orgId, input.recordId),
    };
  }

  try {
    const readback = await fetchAgworldSprayRecord({
      accessToken: input.accessToken,
      agworldId: latestSyncedRow.agworldId,
    });

    const [logRow] = await db
      .insert(agworldSyncLog)
      .values({
        orgId: input.orgId,
        syncType: 'spray_record',
        ranchosId: input.recordId,
        agworldId: readback.agworldId,
        direction: 'pull',
        status: 'success',
      })
      .returning({
        syncedAt: agworldSyncLog.syncedAt,
        status: agworldSyncLog.status,
        errorMessage: agworldSyncLog.errorMessage,
      });

    return {
      recordId: input.recordId,
      agworldId: readback.agworldId,
      syncedAt: logRow?.syncedAt ?? null,
      status: logRow?.status ?? 'success',
      errorMessage: logRow?.errorMessage ?? null,
      outboundPayload,
      remoteRecord: readback.response,
      comparison: compareAgworldSprayPayloads(outboundPayload, readback.response),
      reconciliation: await loadAgworldSprayRecordReconciliation(input.orgId, input.recordId),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read back the AgWorld spray record.';

    const [logRow] = await db
      .insert(agworldSyncLog)
      .values({
        orgId: input.orgId,
        syncType: 'spray_record',
        ranchosId: input.recordId,
        agworldId: latestSyncedRow.agworldId,
        direction: 'pull',
        status: 'failed',
        errorMessage: message,
      })
      .returning({
        syncedAt: agworldSyncLog.syncedAt,
        status: agworldSyncLog.status,
        errorMessage: agworldSyncLog.errorMessage,
      });

    return {
      recordId: input.recordId,
      agworldId: latestSyncedRow.agworldId,
      syncedAt: logRow?.syncedAt ?? null,
      status: logRow?.status ?? 'failed',
      errorMessage: logRow?.errorMessage ?? message,
      outboundPayload,
      remoteRecord: null,
      comparison: null,
      reconciliation: await loadAgworldSprayRecordReconciliation(input.orgId, input.recordId),
    };
  }
}

app.get('/', async (c) => {
  const accessError = requireManagerAccess(c.get('userRole'));
  if (accessError) {
    return c.json(accessError, 403);
  }

  try {
    return c.json(await loadAgworldWorkspace(c.get('orgId')));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load AgWorld workspace.';
    return c.json({ error: message }, 400);
  }
});

app.get('/spray-records/:recordId/reconciliation', async (c) => {
  const accessError = requireManagerAccess(c.get('userRole'));
  if (accessError) {
    return c.json(accessError, 403);
  }

  const recordId = normalizeText(c.req.param('recordId'));
  if (!recordId) {
    return c.json({ error: 'A spray record id is required.' }, 400);
  }

  try {
    return c.json(await loadAgworldSprayRecordReconciliation(c.get('orgId'), recordId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load AgWorld reconciliation detail.';
    return c.json({ error: message }, 400);
  }
});

app.post('/spray-records/:recordId/readback', async (c) => {
  const accessError = requireManagerAccess(c.get('userRole'));
  if (accessError) {
    return c.json(accessError, 403);
  }

  const orgId = c.get('orgId');
  const recordId = normalizeText(c.req.param('recordId'));
  if (!recordId) {
    return c.json({ error: 'A spray record id is required.' }, 400);
  }

  const integration = await db.query.orgIntegrations.findFirst({
    where: and(eq(orgIntegrations.orgId, orgId), eq(orgIntegrations.integrationType, 'agworld')),
  });

  if (!integration?.isActive || !integration.accessToken || !integration.realmId) {
    return c.json({ error: 'Finish the AgWorld workspace connection before running a readback.' }, 400);
  }

  const settings = parseAgworldSettings(integration.settings ?? null);
  const mappingByBlockId = buildAgworldFieldMappingMap(settings.fieldMappings);
  try {
    return c.json({
      ...(await runAgworldSprayRecordReadback({
        orgId,
        recordId,
        accessToken: integration.accessToken,
        workspaceId: integration.realmId,
        mappingByBlockId,
      })),
      workspace: await loadAgworldWorkspace(orgId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read back the AgWorld spray record.';
    return c.json({ error: message }, 400);
  }
});

app.post('/readback/spray-records', async (c) => {
  const accessError = requireManagerAccess(c.get('userRole'));
  if (accessError) {
    return c.json(accessError, 403);
  }

  const orgId = c.get('orgId');

  try {
    const body = await c.req
      .json<Record<string, unknown>>()
      .catch(() => ({} as Record<string, unknown>));
    const recordIds = normalizeRecordIds(body.recordIds);
    if (!recordIds) {
      throw new Error('At least one spray record id is required.');
    }

    const integration = await db.query.orgIntegrations.findFirst({
      where: and(eq(orgIntegrations.orgId, orgId), eq(orgIntegrations.integrationType, 'agworld')),
    });

    if (!integration?.isActive || !integration.accessToken || !integration.realmId) {
      throw new Error('Finish the AgWorld workspace connection before running a batch readback.');
    }

    const settings = parseAgworldSettings(integration.settings ?? null);
    const mappingByBlockId = buildAgworldFieldMappingMap(settings.fieldMappings);
    const results = [];

    for (const recordId of recordIds) {
      results.push(
        await runAgworldSprayRecordReadback({
          orgId,
          recordId,
          accessToken: integration.accessToken,
          workspaceId: integration.realmId,
          mappingByBlockId,
        }),
      );
    }

    return c.json({
      summary: {
        attempted: results.length,
        successful: results.filter((result) => result.status === 'success').length,
        failed: results.filter((result) => result.status === 'failed').length,
        conflicts: results.filter((result) => result.status === 'conflict').length,
      },
      results,
      workspace: await loadAgworldWorkspace(orgId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to run the AgWorld batch readback.';
    return c.json({ error: message }, 400);
  }
});

app.patch('/', async (c) => {
  const accessError = requireManagerAccess(c.get('userRole'));
  if (accessError) {
    return c.json(accessError, 403);
  }

  const orgId = c.get('orgId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const currentIntegration = await db.query.orgIntegrations.findFirst({
      where: and(eq(orgIntegrations.orgId, orgId), eq(orgIntegrations.integrationType, 'agworld')),
    });
    const currentSettings = parseAgworldSettings(currentIntegration?.settings ?? null);
    const orgBlocks = await db
      .select({ id: blocks.id })
      .from(blocks)
      .where(eq(blocks.orgId, orgId));
    const validBlockIds = new Set(orgBlocks.map((row) => row.id));

    const fieldMappings = normalizeFieldMappings(body.fieldMappings, validBlockIds) ?? currentSettings.fieldMappings;
    const enabled = normalizeBoolean(body.enabled) ?? currentIntegration?.isActive ?? true;
    const autoPushSprayRecords =
      normalizeBoolean(body.autoPushSprayRecords) ?? currentSettings.autoPushSprayRecords;
    const autoPullRecommendations =
      normalizeBoolean(body.autoPullRecommendations) ?? currentSettings.autoPullRecommendations;

    const workspaceField = normalizeSecretField(body.workspaceId);
    const accessTokenField = normalizeSecretField(body.accessToken);
    const refreshTokenField = normalizeSecretField(body.refreshToken);

    const realmId = workspaceField.provided ? workspaceField.value : currentIntegration?.realmId ?? null;
    const accessToken = accessTokenField.provided
      ? accessTokenField.value
      : currentIntegration?.accessToken ?? null;
    const refreshToken = refreshTokenField.provided
      ? refreshTokenField.value
      : currentIntegration?.refreshToken ?? null;

    const settings = serializeAgworldSettings({
      fieldMappings,
      autoPushSprayRecords,
      autoPullRecommendations,
    });

    if (currentIntegration) {
      await db
        .update(orgIntegrations)
        .set({
          isActive: enabled,
          realmId,
          accessToken,
          refreshToken,
          settings,
        })
        .where(eq(orgIntegrations.id, currentIntegration.id));
    } else {
      await db.insert(orgIntegrations).values({
        orgId,
        integrationType: 'agworld',
        isActive: enabled,
        realmId,
        accessToken,
        refreshToken,
        settings,
      });
    }

    return c.json(await loadAgworldWorkspace(orgId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save AgWorld settings.';
    return c.json({ error: message }, 400);
  }
});

app.post('/sync/spray-records', async (c) => {
  const accessError = requireManagerAccess(c.get('userRole'));
  if (accessError) {
    return c.json(accessError, 403);
  }

  const orgId = c.get('orgId');

  try {
    const body = await c.req
      .json<Record<string, unknown>>()
      .catch(() => ({} as Record<string, unknown>));
    const recordIds = normalizeRecordIds(body.recordIds);
    const integration = await db.query.orgIntegrations.findFirst({
      where: and(eq(orgIntegrations.orgId, orgId), eq(orgIntegrations.integrationType, 'agworld')),
    });

    if (!integration || !integration.isActive) {
      throw new Error('Enable AgWorld before running a sync.');
    }

    if (!integration.accessToken) {
      throw new Error('An AgWorld access token is required before syncing.');
    }

    if (!integration.realmId) {
      throw new Error('An AgWorld workspace id is required before syncing.');
    }

    const settings = parseAgworldSettings(integration.settings ?? null);
    const mappingByBlockId = buildAgworldFieldMappingMap(settings.fieldMappings);

    const filters = [
      eq(applicationRecords.orgId, orgId),
      eq(applicationRecords.recordType, 'pesticide'),
      isNotNull(applicationRecords.verifiedAt),
    ];

    if (recordIds) {
      filters.push(inArray(applicationRecords.id, recordIds));
    }

    const rows = await db
      .select({
        id: applicationRecords.id,
        blockId: applicationRecords.blockId,
        appliedDate: applicationRecords.appliedDate,
        appliedStartTime: applicationRecords.appliedStartTime,
        appliedEndTime: applicationRecords.appliedEndTime,
        applicatorName: applicationRecords.applicatorName,
        applicatorLicense: applicationRecords.applicatorLicense,
        acresTreated: applicationRecords.acresTreated,
        ratePerAcre: applicationRecords.ratePerAcre,
        rateUnit: applicationRecords.rateUnit,
        totalProductUsed: applicationRecords.totalProductUsed,
        totalProductUnit: applicationRecords.totalProductUnit,
        waterVolumeGpa: applicationRecords.waterVolumeGpa,
        targetPest: applicationRecords.targetPest,
        notes: applicationRecords.notes,
        verifiedAt: applicationRecords.verifiedAt,
        reiExpiry: applicationRecords.reiExpiry,
        windSpeedMph: applicationRecords.windSpeedMph,
        windDirection: applicationRecords.windDirection,
        tempF: applicationRecords.tempF,
        isOrganicBlock: applicationRecords.isOrganicBlock,
        omriConfirmed: applicationRecords.omriConfirmed,
        certifierNotified: applicationRecords.certifierNotified,
        blockName: blocks.name,
        ranchName: ranches.name,
        productName: sql<string>`coalesce(${products.productName}, ${applicationRecords.productNameManual}, 'Unnamed product')`,
        epaRegNumber: sql<string | null>`coalesce(${products.epaRegNumber}, ${applicationRecords.epaRegNumber})`,
      })
      .from(applicationRecords)
      .innerJoin(blocks, eq(applicationRecords.blockId, blocks.id))
      .innerJoin(ranches, eq(blocks.ranchId, ranches.id))
      .leftJoin(products, eq(applicationRecords.productId, products.id))
      .where(and(...filters))
      .orderBy(desc(applicationRecords.appliedDate), desc(applicationRecords.verifiedAt));

    if (rows.length === 0) {
      throw new Error('No verified spray records matched this sync.');
    }

    const results: Array<{
      recordId: string;
      blockName: string;
      status: 'success' | 'failed' | 'conflict';
      agworldId: string | null;
      message: string;
    }> = [];

    for (const row of rows) {
      const paddockId = mappingByBlockId.get(row.blockId);

      if (!paddockId) {
        await db.insert(agworldSyncLog).values({
          orgId,
          syncType: 'spray_record',
          ranchosId: row.id,
          direction: 'push',
          status: 'conflict',
          errorMessage: 'Missing AgWorld paddock mapping for this block.',
        });

        results.push({
          recordId: row.id,
          blockName: row.blockName,
          status: 'conflict',
          agworldId: null,
          message: 'Missing AgWorld paddock mapping for this block.',
        });
        continue;
      }

      try {
        const payload = buildAgworldSprayPayload({
          workspaceId: integration.realmId,
          paddockId,
          ranchosRecordId: row.id,
          appliedDate: row.appliedDate,
          appliedStartTime: row.appliedStartTime,
          appliedEndTime: row.appliedEndTime,
          applicatorName: row.applicatorName,
          applicatorLicense: row.applicatorLicense,
          blockName: row.blockName,
          ranchName: row.ranchName,
          productName: row.productName,
          epaRegNumber: row.epaRegNumber,
          acresTreated: row.acresTreated,
          ratePerAcre: row.ratePerAcre,
          rateUnit: row.rateUnit,
          totalProductUsed: row.totalProductUsed,
          totalProductUnit: row.totalProductUnit,
          waterVolumeGpa: row.waterVolumeGpa,
          targetPest: row.targetPest,
          notes: row.notes,
          verifiedAt: row.verifiedAt,
          reiExpiry: row.reiExpiry,
          windSpeedMph: row.windSpeedMph,
          windDirection: row.windDirection,
          tempF: row.tempF,
          isOrganicBlock: row.isOrganicBlock,
          omriConfirmed: row.omriConfirmed,
          certifierNotified: row.certifierNotified,
        });
        const pushResult = await pushAgworldSprayRecord({
          accessToken: integration.accessToken,
          payload,
        });

        await db.insert(agworldSyncLog).values({
          orgId,
          syncType: 'spray_record',
          ranchosId: row.id,
          agworldId: pushResult.agworldId,
          direction: 'push',
          status: 'success',
        });

        results.push({
          recordId: row.id,
          blockName: row.blockName,
          status: 'success',
          agworldId: pushResult.agworldId,
          message: pushResult.agworldId ? `Synced as ${pushResult.agworldId}.` : 'Synced successfully.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AgWorld sync failed.';

        await db.insert(agworldSyncLog).values({
          orgId,
          syncType: 'spray_record',
          ranchosId: row.id,
          direction: 'push',
          status: 'failed',
          errorMessage: message,
        });

        results.push({
          recordId: row.id,
          blockName: row.blockName,
          status: 'failed',
          agworldId: null,
          message,
        });
      }
    }

    return c.json({
      summary: {
        attempted: results.length,
        successful: results.filter((result) => result.status === 'success').length,
        failed: results.filter((result) => result.status === 'failed').length,
        conflicts: results.filter((result) => result.status === 'conflict').length,
      },
      results,
      workspace: await loadAgworldWorkspace(orgId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sync AgWorld spray records.';
    return c.json({ error: message }, 400);
  }
});

export default app;
