import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  blocks,
  crewMembers,
  laborEntries,
  profiles,
  tasks,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';
import { calculateGrossPay, calculateHoursWorked } from '../utils/payrollExport';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

type CrewMemberInsert = typeof crewMembers.$inferInsert;
type LaborEntryInsert = typeof laborEntries.$inferInsert;
type CrewPayType = NonNullable<CrewMemberInsert['payType']>;
type PieceRateType = NonNullable<LaborEntryInsert['pieceRateType']>;

const crewPayTypeOptions: CrewPayType[] = ['hourly', 'piece_rate', 'salary'];
const pieceRateTypeOptions: PieceRateType[] = ['bins', 'boxes', 'trees', 'lbs'];

function normalizeText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
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
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`${fieldName} is invalid.`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return parsed;
}

function normalizeDecimal(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; scale?: number } = {},
) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  const min = options.min ?? 0;
  if (!Number.isFinite(parsed) || parsed < min || (options.max !== undefined && parsed > options.max)) {
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

function roundNumber(value: number, scale = 2) {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

function toNumber(value: string | number | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDecimal(value: number | null, scale = 2) {
  return value === null ? null : value.toFixed(scale);
}

function sanitizeCrewMemberInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const fullName = !isPartial || 'fullName' in body ? normalizeText(body.fullName) : undefined;
  const phone = 'phone' in body ? normalizeText(body.phone) : undefined;
  const employeeId = 'employeeId' in body ? normalizeText(body.employeeId) : undefined;
  const hireDate = 'hireDate' in body ? normalizeDate(body.hireDate, 'Hire date') : undefined;
  const position = 'position' in body ? normalizeText(body.position) : undefined;
  const payType = !isPartial || 'payType' in body ? normalizeEnum(body.payType, crewPayTypeOptions, 'Pay type') : undefined;
  const hourlyRate = 'hourlyRate' in body ? normalizeDecimal(body.hourlyRate, 'Hourly rate', { min: 0, scale: 2 }) : undefined;
  const profileId = 'profileId' in body ? normalizeText(body.profileId) : undefined;
  const h2aWorker = 'h2aWorker' in body ? normalizeBoolean(body.h2aWorker, 'H-2A worker') : undefined;
  const h2aDisclaimerAcknowledged =
    'h2aDisclaimerAcknowledged' in body
      ? normalizeBoolean(body.h2aDisclaimerAcknowledged, 'H-2A disclaimer')
      : undefined;
  const active = 'active' in body ? normalizeBoolean(body.active, 'Active status') : undefined;

  if (!isPartial) {
    if (!fullName) {
      throw new Error('Crew member name is required.');
    }

    if (!payType) {
      throw new Error('Pay type is required.');
    }

    if (payType === 'hourly' && !hourlyRate) {
      throw new Error('Hourly crew members need an hourly rate.');
    }
  } else {
    if ('fullName' in body && !fullName) {
      throw new Error('Crew member name is required.');
    }

    if ('payType' in body && !payType) {
      throw new Error('Pay type is required.');
    }
  }

  return {
    fullName,
    phone,
    employeeId,
    hireDate,
    position,
    payType,
    hourlyRate,
    profileId,
    h2aWorker,
    h2aDisclaimerAcknowledged,
    active,
  };
}

function sanitizeLaborEntryInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const crewMemberId = !isPartial || 'crewMemberId' in body ? normalizeText(body.crewMemberId) : undefined;
  const taskId = 'taskId' in body ? normalizeText(body.taskId) : undefined;
  const blockId = 'blockId' in body ? normalizeText(body.blockId) : undefined;
  const workDate = !isPartial || 'workDate' in body ? normalizeDate(body.workDate, 'Work date') : undefined;
  const clockIn = 'clockIn' in body ? normalizeTimestamp(body.clockIn, 'Clock in') : undefined;
  const clockOut = 'clockOut' in body ? normalizeTimestamp(body.clockOut, 'Clock out') : undefined;
  const hoursWorked = 'hoursWorked' in body ? normalizeDecimal(body.hoursWorked, 'Hours worked', { min: 0, scale: 2 }) : undefined;
  const pieceRateType =
    'pieceRateType' in body ? normalizeEnum(body.pieceRateType, pieceRateTypeOptions, 'Piece-rate type') : undefined;
  const pieceRateQuantity =
    'pieceRateQuantity' in body
      ? normalizeDecimal(body.pieceRateQuantity, 'Piece-rate quantity', { min: 0, scale: 2 })
      : undefined;
  const pieceRatePerUnit =
    'pieceRatePerUnit' in body
      ? normalizeDecimal(body.pieceRatePerUnit, 'Piece-rate rate', { min: 0, scale: 4 })
      : undefined;
  const grossPay = 'grossPay' in body ? normalizeDecimal(body.grossPay, 'Gross pay', { min: 0, scale: 2 }) : undefined;
  const notes = 'notes' in body ? normalizeText(body.notes) : undefined;

  if (!isPartial) {
    if (!crewMemberId) {
      throw new Error('Crew member is required.');
    }

    if (!workDate) {
      throw new Error('Work date is required.');
    }
  } else {
    if ('crewMemberId' in body && !crewMemberId) {
      throw new Error('Crew member is required.');
    }

    if ('workDate' in body && !workDate) {
      throw new Error('Work date is required.');
    }
  }

  return {
    crewMemberId,
    taskId,
    blockId,
    workDate,
    clockIn,
    clockOut,
    hoursWorked,
    pieceRateType,
    pieceRateQuantity,
    pieceRatePerUnit,
    grossPay,
    notes,
  };
}

async function requireOwnedProfile(orgId: string, profileId: string) {
  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, profileId), eq(profiles.orgId, orgId)),
  });

  if (!profile) {
    throw new Error('Linked profile not found for this organization.');
  }

  return profile;
}

async function ensureCrewProfileAvailable(orgId: string, profileId: string, currentCrewId: string | null) {
  const existing = await db.query.crewMembers.findFirst({
    where:
      currentCrewId === null
        ? and(eq(crewMembers.orgId, orgId), eq(crewMembers.profileId, profileId))
        : and(eq(crewMembers.orgId, orgId), eq(crewMembers.profileId, profileId), ne(crewMembers.id, currentCrewId)),
  });

  if (existing) {
    throw new Error('That profile is already linked to another crew member.');
  }
}

async function ensureEmployeeIdAvailable(orgId: string, employeeId: string, currentCrewId: string | null) {
  const existing = await db.query.crewMembers.findFirst({
    where:
      currentCrewId === null
        ? and(eq(crewMembers.orgId, orgId), eq(crewMembers.employeeId, employeeId))
        : and(eq(crewMembers.orgId, orgId), eq(crewMembers.employeeId, employeeId), ne(crewMembers.id, currentCrewId)),
  });

  if (existing) {
    throw new Error('Employee ID already exists for this organization.');
  }
}

async function requireCrewMember(orgId: string, crewMemberId: string) {
  const crewMember = await db.query.crewMembers.findFirst({
    where: and(eq(crewMembers.id, crewMemberId), eq(crewMembers.orgId, orgId)),
  });

  if (!crewMember) {
    throw new Error('Crew member not found for this organization.');
  }

  return crewMember;
}

async function requireOwnedBlock(orgId: string, blockId: string) {
  const block = await db.query.blocks.findFirst({
    where: and(eq(blocks.id, blockId), eq(blocks.orgId, orgId), eq(blocks.active, true)),
  });

  if (!block) {
    throw new Error('Block not found for this organization.');
  }

  return block;
}

async function requireOwnedTask(orgId: string, taskId: string) {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)),
  });

  if (!task) {
    throw new Error('Task not found for this organization.');
  }

  return task;
}

async function requireLaborEntry(orgId: string, laborEntryId: string) {
  const entry = await db.query.laborEntries.findFirst({
    where: and(eq(laborEntries.id, laborEntryId), eq(laborEntries.orgId, orgId)),
  });

  if (!entry) {
    throw new Error('Labor entry not found for this organization.');
  }

  return entry;
}

async function buildCrewMemberPayloads(crewRows: (typeof crewMembers.$inferSelect)[]) {
  if (crewRows.length === 0) {
    return [];
  }

  const profileIds = Array.from(
    new Set(crewRows.map((crewMember) => crewMember.profileId).filter((value): value is string => Boolean(value))),
  );

  const profileRows =
    profileIds.length === 0
      ? []
      : await db
          .select({
            id: profiles.id,
            fullName: profiles.fullName,
            role: profiles.role,
            phone: profiles.phone,
          })
          .from(profiles)
          .where(inArray(profiles.id, profileIds));

  const profilesById = new Map(profileRows.map((profile) => [profile.id, profile]));

  return crewRows.map((crewMember) => ({
    ...crewMember,
    profile: crewMember.profileId ? profilesById.get(crewMember.profileId) ?? null : null,
  }));
}

async function buildLaborEntryPayloads(entryRows: (typeof laborEntries.$inferSelect)[]) {
  if (entryRows.length === 0) {
    return [];
  }

  const crewIds = Array.from(new Set(entryRows.map((entry) => entry.crewMemberId)));
  const blockIds = Array.from(
    new Set(entryRows.map((entry) => entry.blockId).filter((value): value is string => Boolean(value))),
  );
  const taskIds = Array.from(
    new Set(entryRows.map((entry) => entry.taskId).filter((value): value is string => Boolean(value))),
  );
  const approverIds = Array.from(
    new Set(entryRows.map((entry) => entry.approvedBy).filter((value): value is string => Boolean(value))),
  );

  const [crewRows, blockRows, taskRows, approverRows] = await Promise.all([
    db
      .select({
        id: crewMembers.id,
        profileId: crewMembers.profileId,
        fullName: crewMembers.fullName,
        employeeId: crewMembers.employeeId,
        position: crewMembers.position,
        payType: crewMembers.payType,
        hourlyRate: crewMembers.hourlyRate,
        h2aWorker: crewMembers.h2aWorker,
        active: crewMembers.active,
      })
      .from(crewMembers)
      .where(inArray(crewMembers.id, crewIds)),
    blockIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: blocks.id,
            name: blocks.name,
            ranchId: blocks.ranchId,
            cropType: blocks.cropType,
            variety: blocks.variety,
            acreage: blocks.acreage,
          })
          .from(blocks)
          .where(inArray(blocks.id, blockIds)),
    taskIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            dueDate: tasks.dueDate,
          })
          .from(tasks)
          .where(inArray(tasks.id, taskIds)),
    approverIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: profiles.id,
            fullName: profiles.fullName,
            role: profiles.role,
          })
          .from(profiles)
          .where(inArray(profiles.id, approverIds)),
  ]);

  const crewById = new Map(crewRows.map((crewMember) => [crewMember.id, crewMember]));
  const blocksById = new Map(blockRows.map((block) => [block.id, block]));
  const tasksById = new Map(taskRows.map((task) => [task.id, task]));
  const approversById = new Map(approverRows.map((profile) => [profile.id, profile]));

  return entryRows.map((entry) => ({
    ...entry,
    crewMember: crewById.get(entry.crewMemberId) ?? null,
    block: entry.blockId ? blocksById.get(entry.blockId) ?? null : null,
    task: entry.taskId ? tasksById.get(entry.taskId) ?? null : null,
    approvedByProfile: entry.approvedBy ? approversById.get(entry.approvedBy) ?? null : null,
  }));
}

function summarizeRecentLabor(entries: Awaited<ReturnType<typeof buildLaborEntryPayloads>>) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  return entries
    .filter((entry) => entry.workDate >= cutoffDate)
    .reduce(
      (summary, entry) => ({
        hoursLast7Days: summary.hoursLast7Days + Number(entry.hoursWorked ?? 0),
        grossPayLast7Days: summary.grossPayLast7Days + Number(entry.grossPay ?? 0),
      }),
      { hoursLast7Days: 0, grossPayLast7Days: 0 },
    );
}

function summarizePayroll(entries: Awaited<ReturnType<typeof buildLaborEntryPayloads>>) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  return entries.reduce(
    (summary, entry) => {
      const hoursWorked = toNumber(entry.hoursWorked);
      const grossPay = toNumber(entry.grossPay);
      const approved = Boolean(entry.approvedAt);

      if (approved) {
        summary.approvedEntries += 1;
        summary.approvedGrossPay += grossPay;
        if (entry.workDate >= cutoffDate) {
          summary.approvedGrossPayLast7Days += grossPay;
        }
      } else {
        summary.pendingApprovals += 1;
        summary.pendingHours += hoursWorked;
        summary.pendingGrossPay += grossPay;
      }

      return summary;
    },
    {
      pendingApprovals: 0,
      approvedEntries: 0,
      pendingHours: 0,
      pendingGrossPay: 0,
      approvedGrossPay: 0,
      approvedGrossPayLast7Days: 0,
    },
  );
}

function daysSinceWorkDate(workDate: string) {
  const date = new Date(`${workDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const elapsedMs = Date.now() - date.getTime();
  return elapsedMs < 0 ? 0 : Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
}

function buildCrewPayrollRollups(entries: Awaited<ReturnType<typeof buildLaborEntryPayloads>>) {
  const rollups = entries.reduce(
    (map, entry) => {
      if (!entry.crewMember) {
        return map;
      }

      const existing = map.get(entry.crewMemberId) ?? {
        crewMemberId: entry.crewMemberId,
        crewMemberName: entry.crewMember.fullName,
        employeeId: entry.crewMember.employeeId,
        position: entry.crewMember.position,
        payType: entry.crewMember.payType,
        active: entry.crewMember.active,
        h2aWorker: entry.crewMember.h2aWorker,
        totalEntries: 0,
        approvedEntries: 0,
        pendingEntries: 0,
        totalHours: 0,
        approvedHours: 0,
        pendingHours: 0,
        totalGrossPay: 0,
        approvedGrossPay: 0,
        pendingGrossPay: 0,
        lastWorkDate: null as string | null,
        lastApprovedAt: null as Date | null,
      };

      const hoursWorked = toNumber(entry.hoursWorked);
      const grossPay = toNumber(entry.grossPay);
      const approved = Boolean(entry.approvedAt);

      existing.totalEntries += 1;
      existing.totalHours += hoursWorked;
      existing.totalGrossPay += grossPay;

      if (approved) {
        existing.approvedEntries += 1;
        existing.approvedHours += hoursWorked;
        existing.approvedGrossPay += grossPay;
        if (!existing.lastApprovedAt || (entry.approvedAt && entry.approvedAt > existing.lastApprovedAt)) {
          existing.lastApprovedAt = entry.approvedAt;
        }
      } else {
        existing.pendingEntries += 1;
        existing.pendingHours += hoursWorked;
        existing.pendingGrossPay += grossPay;
      }

      if (!existing.lastWorkDate || entry.workDate > existing.lastWorkDate) {
        existing.lastWorkDate = entry.workDate;
      }

      map.set(entry.crewMemberId, existing);
      return map;
    },
    new Map<
      string,
      {
        crewMemberId: string;
        crewMemberName: string;
        employeeId: string | null;
        position: string | null;
        payType: CrewPayType | null;
        active: boolean | null;
        h2aWorker: boolean | null;
        totalEntries: number;
        approvedEntries: number;
        pendingEntries: number;
        totalHours: number;
        approvedHours: number;
        pendingHours: number;
        totalGrossPay: number;
        approvedGrossPay: number;
        pendingGrossPay: number;
        lastWorkDate: string | null;
        lastApprovedAt: Date | null;
      }
    >(),
  );

  return Array.from(rollups.values())
    .map((rollup) => ({
      ...rollup,
      totalHours: roundNumber(rollup.totalHours, 2),
      approvedHours: roundNumber(rollup.approvedHours, 2),
      pendingHours: roundNumber(rollup.pendingHours, 2),
      totalGrossPay: roundNumber(rollup.totalGrossPay, 2),
      approvedGrossPay: roundNumber(rollup.approvedGrossPay, 2),
      pendingGrossPay: roundNumber(rollup.pendingGrossPay, 2),
      lastApprovedAt: rollup.lastApprovedAt?.toISOString() ?? null,
    }))
    .sort((left, right) => {
      if (right.pendingGrossPay !== left.pendingGrossPay) {
        return right.pendingGrossPay - left.pendingGrossPay;
      }

      if (right.totalGrossPay !== left.totalGrossPay) {
        return right.totalGrossPay - left.totalGrossPay;
      }

      return left.crewMemberName.localeCompare(right.crewMemberName);
    });
}

function buildApprovalQueue(entries: Awaited<ReturnType<typeof buildLaborEntryPayloads>>) {
  return entries
    .filter((entry) => !entry.approvedAt)
    .sort((left, right) => {
      const dateDiff = left.workDate.localeCompare(right.workDate);
      if (dateDiff !== 0) {
        return dateDiff;
      }

      const leftCreatedAt = left.createdAt?.getTime() ?? 0;
      const rightCreatedAt = right.createdAt?.getTime() ?? 0;
      return leftCreatedAt - rightCreatedAt;
    })
    .map((entry) => ({
      laborEntryId: entry.id,
      crewMemberId: entry.crewMemberId,
      crewMemberName: entry.crewMember?.fullName ?? 'Crew member',
      payType: entry.crewMember?.payType ?? null,
      workDate: entry.workDate,
      blockName: entry.block?.name ?? null,
      taskTitle: entry.task?.title ?? null,
      hoursWorked: roundNumber(toNumber(entry.hoursWorked), 2),
      grossPay: roundNumber(toNumber(entry.grossPay), 2),
      pieceRateType: entry.pieceRateType,
      pieceRateQuantity: entry.pieceRateQuantity,
      pieceRatePerUnit: entry.pieceRatePerUnit,
      notes: entry.notes,
      createdAt: entry.createdAt?.toISOString() ?? null,
      ageDays: daysSinceWorkDate(entry.workDate),
    }))
    .slice(0, 12);
}

function shouldRecomputeCompensation(body: Record<string, unknown>) {
  return [
    'crewMemberId',
    'clockIn',
    'clockOut',
    'hoursWorked',
    'pieceRateType',
    'pieceRateQuantity',
    'pieceRatePerUnit',
    'grossPay',
  ].some((field) => field in body);
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');

  const [crewRows, entryRows, profileRows, blockRows, taskRows] = await Promise.all([
    db
      .select()
      .from(crewMembers)
      .where(eq(crewMembers.orgId, orgId))
      .orderBy(desc(crewMembers.active), asc(crewMembers.fullName)),
    db
      .select()
      .from(laborEntries)
      .where(eq(laborEntries.orgId, orgId))
      .orderBy(desc(laborEntries.workDate), desc(laborEntries.createdAt))
      .limit(200),
    db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        role: profiles.role,
        phone: profiles.phone,
      })
      .from(profiles)
      .where(eq(profiles.orgId, orgId))
      .orderBy(asc(profiles.fullName)),
    db
      .select({
        id: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        active: blocks.active,
      })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.active, true)))
      .orderBy(asc(blocks.name)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
      })
      .from(tasks)
      .where(and(eq(tasks.orgId, orgId), ne(tasks.status, 'completed')))
      .orderBy(asc(tasks.dueDate), desc(tasks.createdAt))
      .limit(50),
  ]);

  const crewPayload = await buildCrewMemberPayloads(crewRows);
  const entryPayload = await buildLaborEntryPayloads(entryRows);
  const recentSummary = summarizeRecentLabor(entryPayload);
  const payrollSummary = summarizePayroll(entryPayload);
  const crewPayroll = buildCrewPayrollRollups(entryPayload);
  const approvalQueue = buildApprovalQueue(entryPayload);

  return c.json({
    crewMembers: crewPayload,
    laborEntries: entryPayload,
    availableProfiles: profileRows,
    blocks: blockRows,
    tasks: taskRows,
    crewPayroll,
    approvalQueue,
    summary: {
      totalCrewMembers: crewPayload.length,
      activeCrewMembers: crewPayload.filter((crewMember) => crewMember.active).length,
      h2aWorkers: crewPayload.filter((crewMember) => crewMember.active && crewMember.h2aWorker).length,
      laborEntries: entryPayload.length,
      hoursLast7Days: roundNumber(recentSummary.hoursLast7Days, 2),
      grossPayLast7Days: roundNumber(recentSummary.grossPayLast7Days, 2),
      pendingApprovals: payrollSummary.pendingApprovals,
      approvedEntries: payrollSummary.approvedEntries,
      pendingHours: roundNumber(payrollSummary.pendingHours, 2),
      pendingGrossPay: roundNumber(payrollSummary.pendingGrossPay, 2),
      approvedGrossPay: roundNumber(payrollSummary.approvedGrossPay, 2),
      approvedGrossPayLast7Days: roundNumber(payrollSummary.approvedGrossPayLast7Days, 2),
    },
  });
});

app.post('/crew-members', async (c) => {
  const orgId = c.get('orgId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeCrewMemberInput(body);

    if (values.profileId) {
      await requireOwnedProfile(orgId, values.profileId);
      await ensureCrewProfileAvailable(orgId, values.profileId, null);
    }

    if (values.employeeId) {
      await ensureEmployeeIdAvailable(orgId, values.employeeId, null);
    }

    const [crewMember] = await db
      .insert(crewMembers)
      .values({
        orgId,
        profileId: values.profileId ?? null,
        fullName: values.fullName!,
        phone: values.phone ?? null,
        employeeId: values.employeeId ?? null,
        hireDate: values.hireDate ?? null,
        position: values.position ?? null,
        payType: values.payType!,
        hourlyRate: values.payType === 'hourly' ? values.hourlyRate! : null,
        h2aWorker: values.h2aWorker ?? false,
        h2aDisclaimerAcknowledged: values.h2aWorker ? (values.h2aDisclaimerAcknowledged ?? false) : false,
        active: values.active ?? true,
      })
      .returning();

    const [payload] = await buildCrewMemberPayloads([crewMember]);
    return c.json(payload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create crew member.';
    return c.json({ error: message }, 400);
  }
});

app.patch('/crew-members/:id', async (c) => {
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  try {
    const existingCrewMember = await requireCrewMember(orgId, id);
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeCrewMemberInput(body, { partial: true });

    if (values.profileId) {
      await requireOwnedProfile(orgId, values.profileId);
      await ensureCrewProfileAvailable(orgId, values.profileId, id);
    }

    if (values.employeeId) {
      await ensureEmployeeIdAvailable(orgId, values.employeeId, id);
    }

    const effectivePayType = values.payType ?? existingCrewMember.payType;
    const effectiveHourlyRate =
      values.hourlyRate !== undefined
        ? values.hourlyRate
        : effectivePayType === 'hourly'
          ? existingCrewMember.hourlyRate
          : null;

    if (effectivePayType === 'hourly' && !effectiveHourlyRate) {
      throw new Error('Hourly crew members need an hourly rate.');
    }

    const updateValues: Partial<CrewMemberInsert> = {
      updatedAt: new Date(),
    };

    if (values.fullName !== undefined) updateValues.fullName = values.fullName!;
    if (values.phone !== undefined) updateValues.phone = values.phone ?? null;
    if (values.employeeId !== undefined) updateValues.employeeId = values.employeeId ?? null;
    if (values.hireDate !== undefined) updateValues.hireDate = values.hireDate ?? null;
    if (values.position !== undefined) updateValues.position = values.position ?? null;
    if (values.profileId !== undefined) updateValues.profileId = values.profileId ?? null;
    if (values.active !== undefined) updateValues.active = values.active;

    if (values.payType !== undefined) {
      updateValues.payType = values.payType;
      updateValues.hourlyRate = values.payType === 'hourly' ? effectiveHourlyRate : null;
    } else if (values.hourlyRate !== undefined) {
      updateValues.hourlyRate = values.hourlyRate ?? null;
    }

    if (values.h2aWorker !== undefined) {
      updateValues.h2aWorker = values.h2aWorker;
      if (!values.h2aWorker && values.h2aDisclaimerAcknowledged === undefined) {
        updateValues.h2aDisclaimerAcknowledged = false;
      }
    }

    if (values.h2aDisclaimerAcknowledged !== undefined) {
      updateValues.h2aDisclaimerAcknowledged = values.h2aDisclaimerAcknowledged;
    }

    const [crewMember] = await db
      .update(crewMembers)
      .set(updateValues)
      .where(and(eq(crewMembers.id, id), eq(crewMembers.orgId, orgId)))
      .returning();

    const [payload] = await buildCrewMemberPayloads([crewMember]);
    return c.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update crew member.';
    const status = message === 'Crew member not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.post('/entries', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeLaborEntryInput(body);

    const crewMember = await requireCrewMember(orgId, values.crewMemberId!);
    if (values.blockId) {
      await requireOwnedBlock(orgId, values.blockId);
    }
    if (values.taskId) {
      await requireOwnedTask(orgId, values.taskId);
    }

    const hoursWorkedNumber = calculateHoursWorked({
      clockIn: values.clockIn ?? null,
      clockOut: values.clockOut ?? null,
      hoursWorked: values.hoursWorked ? Number(values.hoursWorked) : null,
    });
    const grossPayNumber = calculateGrossPay({
      payType: crewMember.payType,
      hourlyRate: crewMember.hourlyRate ? Number(crewMember.hourlyRate) : null,
      hoursWorked: hoursWorkedNumber,
      pieceRateQuantity: values.pieceRateQuantity ? Number(values.pieceRateQuantity) : null,
      pieceRatePerUnit: values.pieceRatePerUnit ? Number(values.pieceRatePerUnit) : null,
      grossPayOverride: values.grossPay ? Number(values.grossPay) : null,
    });

    const [entry] = await db
      .insert(laborEntries)
      .values({
        orgId,
        crewMemberId: values.crewMemberId!,
        taskId: values.taskId ?? null,
        blockId: values.blockId ?? null,
        workDate: values.workDate!,
        clockIn: values.clockIn ?? null,
        clockOut: values.clockOut ?? null,
        hoursWorked: formatDecimal(hoursWorkedNumber, 2),
        pieceRateType: values.pieceRateType ?? null,
        pieceRateQuantity: values.pieceRateQuantity ?? null,
        pieceRatePerUnit: values.pieceRatePerUnit ?? null,
        grossPay: formatDecimal(grossPayNumber, 2),
        notes: values.notes ?? null,
        updatedBy: profileId,
      })
      .returning();

    const [payload] = await buildLaborEntryPayloads([entry]);
    return c.json(payload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create labor entry.';
    const status =
      message === 'Crew member not found for this organization.' ||
      message === 'Block not found for this organization.' ||
      message === 'Task not found for this organization.'
        ? 404
        : 400;
    return c.json({ error: message }, status);
  }
});

app.patch('/entries/:id', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  const id = c.req.param('id');

  try {
    const existingEntry = await requireLaborEntry(orgId, id);
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeLaborEntryInput(body, { partial: true });

    const resolvedCrewMemberId = values.crewMemberId ?? existingEntry.crewMemberId;
    const crewMember = await requireCrewMember(orgId, resolvedCrewMemberId);

    const resolvedBlockId = values.blockId !== undefined ? values.blockId : existingEntry.blockId;
    const resolvedTaskId = values.taskId !== undefined ? values.taskId : existingEntry.taskId;

    if (resolvedBlockId) {
      await requireOwnedBlock(orgId, resolvedBlockId);
    }
    if (resolvedTaskId) {
      await requireOwnedTask(orgId, resolvedTaskId);
    }

    const updateValues: Partial<LaborEntryInsert> = {
      updatedAt: new Date(),
      updatedBy: profileId,
    };
    const invalidatesApproval = [
      'crewMemberId',
      'taskId',
      'blockId',
      'workDate',
      'clockIn',
      'clockOut',
      'hoursWorked',
      'pieceRateType',
      'pieceRateQuantity',
      'pieceRatePerUnit',
      'grossPay',
      'notes',
    ].some((field) => field in body);

    if (values.crewMemberId !== undefined) updateValues.crewMemberId = values.crewMemberId!;
    if (values.taskId !== undefined) updateValues.taskId = values.taskId ?? null;
    if (values.blockId !== undefined) updateValues.blockId = values.blockId ?? null;
    if (values.workDate !== undefined) updateValues.workDate = values.workDate!;
    if (values.notes !== undefined) updateValues.notes = values.notes ?? null;

    if (shouldRecomputeCompensation(body)) {
      const clockIn = values.clockIn !== undefined ? values.clockIn : existingEntry.clockIn;
      const clockOut = values.clockOut !== undefined ? values.clockOut : existingEntry.clockOut;
      const hoursWorkedValue =
        values.hoursWorked !== undefined
          ? (values.hoursWorked ? Number(values.hoursWorked) : null)
          : existingEntry.hoursWorked
            ? Number(existingEntry.hoursWorked)
            : null;
      const pieceRateQuantityValue =
        values.pieceRateQuantity !== undefined
          ? (values.pieceRateQuantity ? Number(values.pieceRateQuantity) : null)
          : existingEntry.pieceRateQuantity
            ? Number(existingEntry.pieceRateQuantity)
            : null;
      const pieceRatePerUnitValue =
        values.pieceRatePerUnit !== undefined
          ? (values.pieceRatePerUnit ? Number(values.pieceRatePerUnit) : null)
          : existingEntry.pieceRatePerUnit
            ? Number(existingEntry.pieceRatePerUnit)
            : null;
      const grossPayOverrideValue =
        values.grossPay !== undefined
          ? (values.grossPay ? Number(values.grossPay) : null)
          : crewMember.payType === 'salary' && existingEntry.grossPay
            ? Number(existingEntry.grossPay)
            : null;

      const hoursWorkedNumber = calculateHoursWorked({
        clockIn,
        clockOut,
        hoursWorked: hoursWorkedValue,
      });
      const grossPayNumber = calculateGrossPay({
        payType: crewMember.payType,
        hourlyRate: crewMember.hourlyRate ? Number(crewMember.hourlyRate) : null,
        hoursWorked: hoursWorkedNumber,
        pieceRateQuantity: pieceRateQuantityValue,
        pieceRatePerUnit: pieceRatePerUnitValue,
        grossPayOverride: grossPayOverrideValue,
      });

      updateValues.clockIn = clockIn ?? null;
      updateValues.clockOut = clockOut ?? null;
      updateValues.hoursWorked = formatDecimal(hoursWorkedNumber, 2);
      updateValues.pieceRateType =
        values.pieceRateType !== undefined ? values.pieceRateType ?? null : existingEntry.pieceRateType;
      updateValues.pieceRateQuantity = formatDecimal(pieceRateQuantityValue, 2);
      updateValues.pieceRatePerUnit = formatDecimal(pieceRatePerUnitValue, 4);
      updateValues.grossPay = formatDecimal(grossPayNumber, 2);
    }

    if (invalidatesApproval) {
      updateValues.approvedBy = null;
      updateValues.approvedAt = null;
    }

    const [entry] = await db
      .update(laborEntries)
      .set(updateValues)
      .where(and(eq(laborEntries.id, id), eq(laborEntries.orgId, orgId)))
      .returning();

    const [payload] = await buildLaborEntryPayloads([entry]);
    return c.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update labor entry.';
    const status =
      message === 'Labor entry not found for this organization.' ||
      message === 'Crew member not found for this organization.' ||
      message === 'Block not found for this organization.' ||
      message === 'Task not found for this organization.'
        ? 404
        : 400;
    return c.json({ error: message }, status);
  }
});

app.patch('/entries/:id/approval', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');
  const id = c.req.param('id');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const approved = normalizeBoolean(body.approved, 'Approved status');
    await requireLaborEntry(orgId, id);

    if (approved) {
      await requireOwnedProfile(orgId, profileId);
    }

    const [entry] = await db
      .update(laborEntries)
      .set({
        approvedBy: approved ? profileId : null,
        approvedAt: approved ? new Date() : null,
        updatedAt: new Date(),
        updatedBy: profileId,
      })
      .where(and(eq(laborEntries.id, id), eq(laborEntries.orgId, orgId)))
      .returning();

    const [payload] = await buildLaborEntryPayloads([entry]);
    return c.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update labor approval.';
    const status =
      message === 'Labor entry not found for this organization.' ||
      message === 'Linked profile not found for this organization.'
        ? 404
        : 400;
    return c.json({ error: message }, status);
  }
});

export default app;
