import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  applicationRecords,
  blockIrrigationConfig,
  blocks,
  irrigationEvents,
  pestSpecies,
  products,
  scoutingLogs,
  taskBlocks,
  tasks,
} from '@ranchos/db/src/schema';
import {
  buildRecommendationSummary,
  CandidateRecommendation,
  formatDateLabel,
  loadRecommendationHistory,
  parseTimestamp,
  pushCandidate,
  sortRecommendations,
  SourceCategory,
  syncGeneratedRecommendations,
} from './intelligenceRecommendations';

function resolveEffectiveTaskStatus(task: Pick<typeof tasks.$inferSelect, 'status' | 'dueDate'>, today: string) {
  if (task.status === 'completed') {
    return 'completed' as const;
  }

  return task.dueDate < today ? ('overdue' as const) : task.status;
}

function buildOperationalCandidates(input: {
  blockRows: Array<{
    id: string;
    orgId: string;
    name: string;
    ranchId: string;
    cropType: string;
    variety: string;
    acreage: string | null;
    isOrganic: boolean;
    active: boolean | null;
  }>;
  taskRows: Array<{
    blockId: string;
    taskId: string;
    title: string;
    dueDate: string;
    status: string;
    priority: string;
  }>;
  scoutingRows: Array<{
    blockId: string;
    id: string;
    scoutedAt: Date;
    rating: string | null;
    pestNameCustom: string | null;
    pestSpeciesName: string | null;
    observationNotes: string | null;
  }>;
  irrigationConfigRows: Array<{
    blockId: string;
    cimisStationId: number | null;
    soilType: string | null;
    deficitTriggerInches: string | null;
  }>;
  irrigationEventRows: Array<{
    blockId: string;
    id: string;
    scheduledDate: string;
    status: string;
    etDeficitInches: string | null;
    plannedRuntimeHours: string;
  }>;
  applicationRows: Array<{
    blockId: string;
    id: string;
    appliedDate: string;
    reiExpiry: Date | null;
    phiExpiry: string | null;
    isOrganicBlock: boolean;
    omriConfirmed: boolean | null;
    recordType: string;
    targetPest: string | null;
    productName: string | null;
    productNameManual: string | null;
  }>;
  today: string;
  now: Date;
}) {
  const candidates: CandidateRecommendation[] = [];
  const recentScoutingCutoff = new Date(input.now);
  recentScoutingCutoff.setDate(recentScoutingCutoff.getDate() - 14);
  const irrigationRecentCutoff = new Date(input.now);
  irrigationRecentCutoff.setDate(irrigationRecentCutoff.getDate() - 7);
  const irrigationRecentCutoffDate = irrigationRecentCutoff.toISOString().slice(0, 10);

  const tasksByBlockId = new Map<string, typeof input.taskRows>();
  const scoutingByBlockId = new Map<string, typeof input.scoutingRows>();
  const irrigationConfigByBlockId = new Map<string, (typeof input.irrigationConfigRows)[number]>();
  const irrigationEventsByBlockId = new Map<string, typeof input.irrigationEventRows>();
  const applicationsByBlockId = new Map<string, typeof input.applicationRows>();

  for (const taskRow of input.taskRows) {
    const existing = tasksByBlockId.get(taskRow.blockId) ?? [];
    existing.push(taskRow);
    tasksByBlockId.set(taskRow.blockId, existing);
  }

  for (const scoutingRow of input.scoutingRows) {
    const existing = scoutingByBlockId.get(scoutingRow.blockId) ?? [];
    existing.push(scoutingRow);
    scoutingByBlockId.set(scoutingRow.blockId, existing);
  }

  for (const configRow of input.irrigationConfigRows) {
    irrigationConfigByBlockId.set(configRow.blockId, configRow);
  }

  for (const irrigationEventRow of input.irrigationEventRows) {
    const existing = irrigationEventsByBlockId.get(irrigationEventRow.blockId) ?? [];
    existing.push(irrigationEventRow);
    irrigationEventsByBlockId.set(irrigationEventRow.blockId, existing);
  }

  for (const applicationRow of input.applicationRows) {
    const existing = applicationsByBlockId.get(applicationRow.blockId) ?? [];
    existing.push(applicationRow);
    applicationsByBlockId.set(applicationRow.blockId, existing);
  }

  for (const block of input.blockRows) {
    const blockTasks = tasksByBlockId.get(block.id) ?? [];
    const overdueTasks = blockTasks.filter(
      (taskRow) =>
        resolveEffectiveTaskStatus(
          { status: taskRow.status as typeof tasks.$inferSelect['status'], dueDate: taskRow.dueDate },
          input.today,
        ) === 'overdue',
    );

    if (overdueTasks.length > 0) {
      const topTask = overdueTasks[0];
      const urgentCount = overdueTasks.filter((taskRow) => taskRow.priority === 'urgent').length;
      const titleEn =
        overdueTasks.length === 1
          ? `Resolve overdue work in ${block.name}`
          : `Resolve ${overdueTasks.length} overdue tasks in ${block.name}`;

      pushCandidate(candidates, {
        blockId: block.id,
        recommendationType: 'general',
        titleEn,
        titleEs:
          overdueTasks.length === 1
            ? `Resolver trabajo vencido en ${block.name}`
            : `Resolver ${overdueTasks.length} tareas vencidas en ${block.name}`,
        bodyEn: `${overdueTasks.length} task${overdueTasks.length === 1 ? '' : 's'} are past due in ${block.name}. Start with ${topTask.title} and clear the backlog before it spills into scouting, irrigation, or compliance work.`,
        bodyEs: `${overdueTasks.length} tarea${overdueTasks.length === 1 ? '' : 's'} ya vencio en ${block.name}. Empieza con ${topTask.title} y limpia el atraso antes de que afecte monitoreo, riego o cumplimiento.`,
        urgency: urgentCount > 0 ? 'urgent' : 'warning',
        dataInputs: {
          sourceCategory: 'tasks' satisfies SourceCategory,
          overdueCount: overdueTasks.length,
          taskIds: overdueTasks.map((taskRow) => taskRow.taskId),
          nextDueDate: topTask.dueDate,
          nextTaskTitle: topTask.title,
        },
      });
    }

    const recentPestAlert = (scoutingByBlockId.get(block.id) ?? [])
      .filter((log) => {
        const scoutedAt = parseTimestamp(log.scoutedAt);
        return Boolean(scoutedAt) && scoutedAt! >= recentScoutingCutoff && (log.rating === 'action' || log.rating === 'high');
      })
      .sort((left, right) => right.scoutedAt.getTime() - left.scoutedAt.getTime())[0];

    if (recentPestAlert) {
      const pestName = recentPestAlert.pestSpeciesName ?? recentPestAlert.pestNameCustom ?? 'recent pest pressure';
      const isUrgent = recentPestAlert.rating === 'action';

      pushCandidate(candidates, {
        blockId: block.id,
        recommendationType: 'pest_action',
        titleEn: `${pestName} pressure needs follow-up in ${block.name}`,
        titleEs: `${pestName} necesita seguimiento en ${block.name}`,
        bodyEn: `${pestName} was logged at ${recentPestAlert.rating ?? 'elevated'} pressure on ${formatDateLabel(
          recentPestAlert.scoutedAt.toISOString().slice(0, 10),
        )}. Re-scout this block and line up treatment or monitor-only work now.`,
        bodyEs: `${pestName} se registro con presion ${recentPestAlert.rating ?? 'elevada'} el ${formatDateLabel(
          recentPestAlert.scoutedAt.toISOString().slice(0, 10),
        )}. Vuelve a monitorear este bloque y prepara accion o seguimiento hoy.`,
        urgency: isUrgent ? 'urgent' : 'warning',
        dataInputs: {
          sourceCategory: 'pest' satisfies SourceCategory,
          scoutingLogId: recentPestAlert.id,
          pestName,
          rating: recentPestAlert.rating,
          scoutedAt: recentPestAlert.scoutedAt.toISOString(),
        },
      });
    }

    const irrigationConfig = irrigationConfigByBlockId.get(block.id);
    if (!irrigationConfig) {
      pushCandidate(candidates, {
        blockId: block.id,
        recommendationType: 'irrigation',
        titleEn: `Set irrigation assumptions for ${block.name}`,
        titleEs: `Configura riego base para ${block.name}`,
        bodyEn: `This block has no CIMIS or emitter setup yet. Add irrigation assumptions so RanchOS can start flagging ET gaps and upcoming runtime needs.`,
        bodyEs: `Este bloque todavia no tiene estacion CIMIS ni configuracion de emisores. Agrega esos datos para que RanchOS pueda marcar deficit ET y necesidades de riego.`,
        urgency: 'suggestion',
        dataInputs: {
          sourceCategory: 'irrigation' satisfies SourceCategory,
          hasConfig: false,
        },
      });
    } else {
      const blockEvents = (irrigationEventsByBlockId.get(block.id) ?? []).sort((left, right) =>
        right.scheduledDate.localeCompare(left.scheduledDate),
      );
      const upcomingOrRunningEvent = blockEvents.find(
        (eventRow) =>
          eventRow.scheduledDate >= input.today &&
          (eventRow.status === 'scheduled' || eventRow.status === 'running'),
      );
      const latestCompletedEvent = blockEvents.find((eventRow) => eventRow.status === 'completed');

      if (!upcomingOrRunningEvent && !latestCompletedEvent) {
        pushCandidate(candidates, {
          blockId: block.id,
          recommendationType: 'irrigation',
          titleEn: `Schedule the first irrigation pass for ${block.name}`,
          titleEs: `Programa el primer riego para ${block.name}`,
          bodyEn: `This block has irrigation settings but no events on the calendar yet. Add the first planned run so the crew has something concrete to execute.`,
          bodyEs: `Este bloque ya tiene configuracion de riego pero todavia no tiene eventos programados. Agrega el primer riego para que el equipo tenga una pasada concreta.`,
          urgency: 'suggestion',
          dataInputs: {
            sourceCategory: 'irrigation' satisfies SourceCategory,
            hasConfig: true,
            hasEvents: false,
          },
        });
      } else if (
        !upcomingOrRunningEvent &&
        latestCompletedEvent &&
        latestCompletedEvent.scheduledDate < irrigationRecentCutoffDate
      ) {
        pushCandidate(candidates, {
          blockId: block.id,
          recommendationType: 'irrigation',
          titleEn: `No irrigation is queued for ${block.name}`,
          titleEs: `No hay riego en cola para ${block.name}`,
          bodyEn: `The latest completed irrigation event was ${formatDateLabel(
            latestCompletedEvent.scheduledDate,
          )} and nothing new is scheduled. Review ET deficit and add the next run if the block still needs water.`,
          bodyEs: `El ultimo riego completado fue el ${formatDateLabel(
            latestCompletedEvent.scheduledDate,
          )} y no hay otro programado. Revisa el deficit ET y agenda la siguiente corrida si el bloque todavia necesita agua.`,
          urgency: 'warning',
          dataInputs: {
            sourceCategory: 'irrigation' satisfies SourceCategory,
            hasConfig: true,
            latestCompletedDate: latestCompletedEvent.scheduledDate,
            latestCompletedEventId: latestCompletedEvent.id,
          },
        });
      }
    }

    const blockApplications = (applicationsByBlockId.get(block.id) ?? []).sort((left, right) =>
      right.appliedDate.localeCompare(left.appliedDate),
    );
    const organicRiskRecord = blockApplications.find(
      (record) => record.isOrganicBlock && record.omriConfirmed === false,
    );
    const activeReiRecord = blockApplications.find((record) => {
      const reiExpiry = parseTimestamp(record.reiExpiry);
      return Boolean(reiExpiry) && reiExpiry! > input.now;
    });
    const activePhiRecord = blockApplications.find(
      (record) => Boolean(record.phiExpiry) && String(record.phiExpiry) >= input.today,
    );

    if (organicRiskRecord) {
      const productName =
        organicRiskRecord.productName ?? organicRiskRecord.productNameManual ?? 'the latest product';
      pushCandidate(candidates, {
        blockId: block.id,
        recommendationType: 'general',
        titleEn: `Review organic handling in ${block.name}`,
        titleEs: `Revisa manejo organico en ${block.name}`,
        bodyEn: `${productName} was logged on an organic block without OMRI confirmation. Double-check the record and certifier notes before more work happens here.`,
        bodyEs: `${productName} se registro en un bloque organico sin confirmacion OMRI. Revisa el registro y notas del certificador antes de seguir con mas trabajo aqui.`,
        urgency: 'urgent',
        dataInputs: {
          sourceCategory: 'compliance' satisfies SourceCategory,
          applicationRecordId: organicRiskRecord.id,
          productName,
          appliedDate: organicRiskRecord.appliedDate,
        },
      });
    } else if (activeReiRecord) {
      const productName =
        activeReiRecord.productName ?? activeReiRecord.productNameManual ?? 'recent application';
      pushCandidate(candidates, {
        blockId: block.id,
        recommendationType: 'general',
        titleEn: `Honor the active REI in ${block.name}`,
        titleEs: `Respeta la REI activa en ${block.name}`,
        bodyEn: `${productName} still carries a live restricted-entry interval in ${block.name}. Keep field work aligned with the posted re-entry timing.`,
        bodyEs: `${productName} todavia tiene un intervalo de reingreso activo en ${block.name}. Mantiene el trabajo de campo alineado con ese tiempo de reentrada.`,
        urgency: 'warning',
        dataInputs: {
          sourceCategory: 'compliance' satisfies SourceCategory,
          applicationRecordId: activeReiRecord.id,
          reiExpiry: activeReiRecord.reiExpiry?.toISOString() ?? null,
          productName,
        },
      });
    } else if (activePhiRecord) {
      const productName =
        activePhiRecord.productName ?? activePhiRecord.productNameManual ?? 'recent application';
      pushCandidate(candidates, {
        blockId: block.id,
        recommendationType: 'general',
        titleEn: `Respect the PHI window in ${block.name}`,
        titleEs: `Respeta la ventana PHI en ${block.name}`,
        bodyEn: `${productName} still carries a pre-harvest interval through ${formatDateLabel(
          String(activePhiRecord.phiExpiry),
        )}. Hold harvest plans on this block until that window clears.`,
        bodyEs: `${productName} todavia tiene un intervalo pre-cosecha hasta ${formatDateLabel(
          String(activePhiRecord.phiExpiry),
        )}. Deten planes de cosecha en este bloque hasta que esa ventana termine.`,
        urgency: 'warning',
        dataInputs: {
          sourceCategory: 'compliance' satisfies SourceCategory,
          applicationRecordId: activePhiRecord.id,
          phiExpiry: activePhiRecord.phiExpiry,
          productName,
        },
      });
    }
  }

  return candidates;
}

export async function refreshOperationalRecommendations(options: { orgId: string; ranchId?: string } ) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const blockRows = await db
    .select({
      id: blocks.id,
      orgId: blocks.orgId,
      name: blocks.name,
      ranchId: blocks.ranchId,
      cropType: blocks.cropType,
      variety: blocks.variety,
      acreage: blocks.acreage,
      isOrganic: blocks.isOrganic,
      active: blocks.active,
    })
    .from(blocks)
    .where(
      options.ranchId
        ? and(eq(blocks.orgId, options.orgId), eq(blocks.ranchId, options.ranchId), eq(blocks.active, true))
        : and(eq(blocks.orgId, options.orgId), eq(blocks.active, true)),
    )
    .orderBy(asc(blocks.name));

  const blockIds = blockRows.map((block) => block.id);
  if (blockIds.length === 0) {
    return { candidates: 0, inserted: 0, updated: 0, deleted: 0 };
  }

  const [taskRows, scoutingRows, irrigationConfigRows, irrigationEventRows, applicationRows, recommendationHistoryRows] =
    await Promise.all([
      db
        .select({
          blockId: taskBlocks.blockId,
          taskId: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          status: tasks.status,
          priority: tasks.priority,
        })
        .from(taskBlocks)
        .innerJoin(tasks, eq(taskBlocks.taskId, tasks.id))
        .where(and(eq(tasks.orgId, options.orgId), inArray(taskBlocks.blockId, blockIds)))
        .orderBy(asc(tasks.dueDate), desc(tasks.createdAt)),
      db
        .select({
          blockId: scoutingLogs.blockId,
          id: scoutingLogs.id,
          scoutedAt: scoutingLogs.scoutedAt,
          rating: scoutingLogs.rating,
          pestNameCustom: scoutingLogs.pestNameCustom,
          pestSpeciesName: pestSpecies.nameEn,
          observationNotes: scoutingLogs.observationNotes,
        })
        .from(scoutingLogs)
        .leftJoin(pestSpecies, eq(scoutingLogs.pestSpeciesId, pestSpecies.id))
        .where(and(eq(scoutingLogs.orgId, options.orgId), inArray(scoutingLogs.blockId, blockIds)))
        .orderBy(desc(scoutingLogs.scoutedAt)),
      db
        .select({
          blockId: blockIrrigationConfig.blockId,
          cimisStationId: blockIrrigationConfig.cimisStationId,
          soilType: blockIrrigationConfig.soilType,
          deficitTriggerInches: blockIrrigationConfig.deficitTriggerInches,
        })
        .from(blockIrrigationConfig)
        .where(inArray(blockIrrigationConfig.blockId, blockIds)),
      db
        .select({
          blockId: irrigationEvents.blockId,
          id: irrigationEvents.id,
          scheduledDate: irrigationEvents.scheduledDate,
          status: irrigationEvents.status,
          etDeficitInches: irrigationEvents.etDeficitInches,
          plannedRuntimeHours: irrigationEvents.plannedRuntimeHours,
        })
        .from(irrigationEvents)
        .where(and(eq(irrigationEvents.orgId, options.orgId), inArray(irrigationEvents.blockId, blockIds)))
        .orderBy(desc(irrigationEvents.scheduledDate), desc(irrigationEvents.createdAt)),
      db
        .select({
          blockId: applicationRecords.blockId,
          id: applicationRecords.id,
          appliedDate: applicationRecords.appliedDate,
          reiExpiry: applicationRecords.reiExpiry,
          phiExpiry: applicationRecords.phiExpiry,
          isOrganicBlock: applicationRecords.isOrganicBlock,
          omriConfirmed: applicationRecords.omriConfirmed,
          recordType: applicationRecords.recordType,
          targetPest: applicationRecords.targetPest,
          productName: products.productName,
          productNameManual: applicationRecords.productNameManual,
        })
        .from(applicationRecords)
        .leftJoin(products, eq(applicationRecords.productId, products.id))
        .where(and(eq(applicationRecords.orgId, options.orgId), inArray(applicationRecords.blockId, blockIds)))
        .orderBy(desc(applicationRecords.appliedDate), desc(applicationRecords.createdAt)),
      loadRecommendationHistory(options.orgId, blockIds),
    ]);

  const candidates = buildOperationalCandidates({
    blockRows,
    taskRows,
    scoutingRows,
    irrigationConfigRows,
    irrigationEventRows,
    applicationRows,
    today,
    now,
  });

  const blockOrgById = new Map(blockRows.map((block) => [block.id, block.orgId]));
  return syncGeneratedRecommendations({
    candidates,
    recommendationHistoryRows,
    blockOrgById,
    sourceCategories: ['tasks', 'pest', 'irrigation', 'compliance'],
  });
}

export async function loadActiveOperationalRecommendations(options: { orgId: string; ranchId?: string }) {
  const blockRows = await db
    .select({
      id: blocks.id,
      name: blocks.name,
      ranchId: blocks.ranchId,
      cropType: blocks.cropType,
      variety: blocks.variety,
      acreage: blocks.acreage,
      isOrganic: blocks.isOrganic,
      active: blocks.active,
    })
    .from(blocks)
    .where(
      options.ranchId
        ? and(eq(blocks.orgId, options.orgId), eq(blocks.ranchId, options.ranchId), eq(blocks.active, true))
        : and(eq(blocks.orgId, options.orgId), eq(blocks.active, true)),
    )
    .orderBy(asc(blocks.name));

  const blockIds = blockRows.map((block) => block.id);
  const recommendationHistoryRows = await loadRecommendationHistory(options.orgId, blockIds);
  const recommendations = sortRecommendations(
    recommendationHistoryRows.filter((recommendation) => !recommendation.dismissedAt && !recommendation.actedOnAt),
  );

  return {
    blocks: blockRows,
    recommendations,
    summary: buildRecommendationSummary(recommendations),
  };
}
