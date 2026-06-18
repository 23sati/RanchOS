import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  blockSeasons,
  blocks,
  crewMembers,
  handlerTicketImports,
  harvestEvents,
} from '@ranchos/db/src/schema';
import { orgScopeMiddleware } from '../middleware/auth';

const app = new Hono<{ Variables: { orgId: string; profileId: string } }>();

app.use('*', orgScopeMiddleware);

type HarvestInsert = typeof harvestEvents.$inferInsert;
type HarvestEventRow = typeof harvestEvents.$inferSelect;
type HandlerTicketInsert = typeof handlerTicketImports.$inferInsert;
type HandlerTicketRow = typeof handlerTicketImports.$inferSelect;
type HarvestMethod = NonNullable<HarvestInsert['harvestMethod']>;
type HandlerTicketStatus = NonNullable<HandlerTicketInsert['status']>;

const harvestMethodOptions: HarvestMethod[] = ['mechanical', 'hand', 'shake_catch'];
const handlerTicketStatusOptions: HandlerTicketStatus[] = ['unmatched', 'matched', 'discrepancy'];

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

function normalizeInteger(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number } = {},
) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  const min = options.min ?? 0;
  if (!Number.isFinite(parsed) || parsed < min || (options.max !== undefined && parsed > options.max)) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return parsed;
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

function normalizeStringArray(value: unknown, fieldName: string) {
  if (value === null || value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be a list.`);
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is string => Boolean(entry)),
      ),
  );
}

function normalizeTicketKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function getHandlerTicketStatus(status: HandlerTicketRow['status']) {
  return status ?? 'unmatched';
}

function sanitizeHarvestInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const blockId = !isPartial || 'blockId' in body ? normalizeText(body.blockId) : undefined;
  const harvestDate = !isPartial || 'harvestDate' in body ? normalizeDate(body.harvestDate, 'Harvest date') : undefined;
  const harvestMethod =
    'harvestMethod' in body ? normalizeEnum(body.harvestMethod, harvestMethodOptions, 'Harvest method') : undefined;
  const totalPounds = 'totalPounds' in body ? normalizeDecimal(body.totalPounds, 'Total pounds', { min: 0, scale: 2 }) : undefined;
  const totalBins = 'totalBins' in body ? normalizeInteger(body.totalBins, 'Total bins', { min: 0 }) : undefined;
  const binWeightLbs =
    'binWeightLbs' in body ? normalizeDecimal(body.binWeightLbs, 'Bin weight', { min: 0, scale: 2 }) : undefined;
  const pickerCount = 'pickerCount' in body ? normalizeInteger(body.pickerCount, 'Picker count', { min: 0 }) : undefined;
  const crewIds = 'crewIds' in body ? normalizeStringArray(body.crewIds, 'Crew assignments') : undefined;
  const hulledWeightLbs =
    'hulledWeightLbs' in body
      ? normalizeDecimal(body.hulledWeightLbs, 'Hulled weight', { min: 0, scale: 2 })
      : undefined;
  const hullSplitPct =
    'hullSplitPct' in body ? normalizeDecimal(body.hullSplitPct, 'Hull split', { min: 0, max: 100, scale: 2 }) : undefined;
  const brix = 'brix' in body ? normalizeDecimal(body.brix, 'Brix', { min: 0, max: 100, scale: 2 }) : undefined;
  const acidRatio =
    'acidRatio' in body ? normalizeDecimal(body.acidRatio, 'Acid ratio', { min: 0, max: 100, scale: 3 }) : undefined;
  const handlerName = 'handlerName' in body ? normalizeText(body.handlerName) : undefined;
  const loadTicket = 'loadTicket' in body ? normalizeText(body.loadTicket) : undefined;
  const handlerTicketReconciled =
    'handlerTicketReconciled' in body
      ? normalizeBoolean(body.handlerTicketReconciled, 'Handler ticket reconciled')
      : undefined;
  const notes = 'notes' in body ? normalizeText(body.notes) : undefined;

  if (!isPartial) {
    if (!blockId) {
      throw new Error('Block is required.');
    }

    if (!harvestDate) {
      throw new Error('Harvest date is required.');
    }
  } else {
    if ('blockId' in body && !blockId) {
      throw new Error('Block is required.');
    }

    if ('harvestDate' in body && !harvestDate) {
      throw new Error('Harvest date is required.');
    }
  }

  return {
    blockId,
    harvestDate,
    harvestMethod,
    totalPounds,
    totalBins,
    binWeightLbs,
    pickerCount,
    crewIds,
    hulledWeightLbs,
    hullSplitPct,
    brix,
    acidRatio,
    handlerName,
    loadTicket,
    handlerTicketReconciled,
    notes,
  };
}

function sanitizeHandlerTicketInput(body: Record<string, unknown>, options: { partial?: boolean } = {}) {
  const isPartial = options.partial ?? false;
  const harvestEventId = 'harvestEventId' in body ? normalizeText(body.harvestEventId) : undefined;
  const handlerName = !isPartial || 'handlerName' in body ? normalizeText(body.handlerName) : undefined;
  const loadTicket = !isPartial || 'loadTicket' in body ? normalizeText(body.loadTicket) : undefined;
  const ticketDate = 'ticketDate' in body ? normalizeDate(body.ticketDate, 'Ticket date') : undefined;
  const netPounds = 'netPounds' in body ? normalizeDecimal(body.netPounds, 'Net pounds', { min: 0, scale: 2 }) : undefined;
  const grossPounds =
    'grossPounds' in body ? normalizeDecimal(body.grossPounds, 'Gross pounds', { min: 0, scale: 2 }) : undefined;
  const moisturePct =
    'moisturePct' in body ? normalizeDecimal(body.moisturePct, 'Moisture', { min: 0, max: 100, scale: 2 }) : undefined;
  const hulledWeightLbs =
    'hulledWeightLbs' in body
      ? normalizeDecimal(body.hulledWeightLbs, 'Hulled weight', { min: 0, scale: 2 })
      : undefined;
  const pricePerPound =
    'pricePerPound' in body
      ? normalizeDecimal(body.pricePerPound, 'Price per pound', { min: 0, scale: 4 })
      : undefined;
  const grossValue =
    'grossValue' in body ? normalizeDecimal(body.grossValue, 'Gross value', { min: 0, scale: 2 }) : undefined;
  const status =
    'status' in body ? normalizeEnum(body.status, handlerTicketStatusOptions, 'Handler ticket status') : undefined;
  const discrepancyNotes = 'discrepancyNotes' in body ? normalizeText(body.discrepancyNotes) : undefined;

  if (!isPartial) {
    if (!handlerName) {
      throw new Error('Handler name is required.');
    }

    if (!loadTicket) {
      throw new Error('Load ticket is required.');
    }
  } else {
    if ('handlerName' in body && !handlerName) {
      throw new Error('Handler name is required.');
    }

    if ('loadTicket' in body && !loadTicket) {
      throw new Error('Load ticket is required.');
    }

    if ('status' in body && !status) {
      throw new Error('Handler ticket status is required.');
    }
  }

  return {
    harvestEventId,
    handlerName,
    loadTicket,
    ticketDate,
    netPounds,
    grossPounds,
    moisturePct,
    hulledWeightLbs,
    pricePerPound,
    grossValue,
    status,
    discrepancyNotes,
  };
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

async function requireCrewMembers(orgId: string, crewIds: string[]) {
  if (crewIds.length === 0) {
    return [];
  }

  const crewRows = await db
    .select({
      id: crewMembers.id,
      fullName: crewMembers.fullName,
      position: crewMembers.position,
      active: crewMembers.active,
    })
    .from(crewMembers)
    .where(and(eq(crewMembers.orgId, orgId), inArray(crewMembers.id, crewIds)));

  if (crewRows.length !== crewIds.length) {
    throw new Error('One or more crew assignments are invalid.');
  }

  return crewRows;
}

async function requireHarvestEvent(orgId: string, harvestEventId: string) {
  const event = await db.query.harvestEvents.findFirst({
    where: and(eq(harvestEvents.id, harvestEventId), eq(harvestEvents.orgId, orgId)),
  });

  if (!event) {
    throw new Error('Harvest event not found for this organization.');
  }

  return event;
}

async function requireHandlerTicketImport(orgId: string, importId: string) {
  const importRow = await db.query.handlerTicketImports.findFirst({
    where: and(eq(handlerTicketImports.id, importId), eq(handlerTicketImports.orgId, orgId)),
  });

  if (!importRow) {
    throw new Error('Handler ticket import not found for this organization.');
  }

  return importRow;
}

async function resolveBlockSeasonId(blockId: string, harvestDate: string) {
  const seasonYear = Number.parseInt(harvestDate.slice(0, 4), 10);
  if (!Number.isFinite(seasonYear)) {
    return null;
  }

  const blockSeason = await db.query.blockSeasons.findFirst({
    where: and(eq(blockSeasons.blockId, blockId), eq(blockSeasons.seasonYear, seasonYear)),
  });

  return blockSeason?.id ?? null;
}

async function buildHarvestPayloads(eventRows: HarvestEventRow[]) {
  if (eventRows.length === 0) {
    return [];
  }

  const blockIds = Array.from(new Set(eventRows.map((event) => event.blockId)));
  const blockSeasonIds = Array.from(
    new Set(eventRows.map((event) => event.blockSeasonId).filter((value): value is string => Boolean(value))),
  );
  const crewIds = Array.from(
    new Set(eventRows.flatMap((event) => event.crewIds ?? []).filter((value): value is string => Boolean(value))),
  );

  const [blockRows, blockSeasonRows, crewRows] = await Promise.all([
    db
      .select({
        id: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        isOrganic: blocks.isOrganic,
      })
      .from(blocks)
      .where(inArray(blocks.id, blockIds)),
    blockSeasonIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: blockSeasons.id,
            blockId: blockSeasons.blockId,
            seasonYear: blockSeasons.seasonYear,
            harvestStart: blockSeasons.harvestStart,
            harvestEnd: blockSeasons.harvestEnd,
            totalYieldLbs: blockSeasons.totalYieldLbs,
            yieldPerAcre: blockSeasons.yieldPerAcre,
          })
          .from(blockSeasons)
          .where(inArray(blockSeasons.id, blockSeasonIds)),
    crewIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: crewMembers.id,
            fullName: crewMembers.fullName,
            employeeId: crewMembers.employeeId,
            position: crewMembers.position,
            active: crewMembers.active,
          })
          .from(crewMembers)
          .where(inArray(crewMembers.id, crewIds)),
  ]);

  const blocksById = new Map(blockRows.map((block) => [block.id, block]));
  const seasonsById = new Map(blockSeasonRows.map((season) => [season.id, season]));
  const crewById = new Map(crewRows.map((crewMember) => [crewMember.id, crewMember]));

  return eventRows.map((event) => {
    const block = blocksById.get(event.blockId) ?? null;
    const crew = (event.crewIds ?? [])
      .map((crewId) => crewById.get(crewId))
      .filter((crewMember): crewMember is NonNullable<typeof crewMember> => Boolean(crewMember));
    const totalPounds = event.totalPounds ? Number(event.totalPounds) : null;
    const blockAcres = block?.acreage ? Number(block.acreage) : null;

    return {
      ...event,
      block,
      blockSeason: event.blockSeasonId ? seasonsById.get(event.blockSeasonId) ?? null : null,
      crewMembers: crew,
      crewCount: crew.length,
      poundsPerAcre: totalPounds !== null && blockAcres ? Number((totalPounds / blockAcres).toFixed(2)) : null,
    };
  });
}

async function buildHandlerTicketPayloads(importRows: HandlerTicketRow[]) {
  if (importRows.length === 0) {
    return [];
  }

  const harvestEventIds = Array.from(
    new Set(importRows.map((row) => row.harvestEventId).filter((value): value is string => Boolean(value))),
  );

  const matchedEventRows =
    harvestEventIds.length === 0
      ? []
      : await db
          .select()
          .from(harvestEvents)
          .where(inArray(harvestEvents.id, harvestEventIds));
  const matchedEventPayloads = await buildHarvestPayloads(matchedEventRows);
  const harvestEventById = new Map(matchedEventPayloads.map((event) => [event.id, event]));

  return importRows.map((row) => ({
    ...row,
    status: getHandlerTicketStatus(row.status),
    harvestEvent: row.harvestEventId ? harvestEventById.get(row.harvestEventId) ?? null : null,
  }));
}

async function findMatchingHarvestEvent(orgId: string, handlerName: string | null, loadTicket: string | null) {
  if (!loadTicket) {
    return null;
  }

  const candidates = await db
    .select()
    .from(harvestEvents)
    .where(and(eq(harvestEvents.orgId, orgId), eq(harvestEvents.loadTicket, loadTicket)))
    .orderBy(desc(harvestEvents.harvestDate), desc(harvestEvents.createdAt))
    .limit(10);

  if (candidates.length === 0) {
    return null;
  }

  const normalizedHandlerName = normalizeTicketKey(handlerName);
  const handlerMatches = normalizedHandlerName
    ? candidates.filter((event) => normalizeTicketKey(event.handlerName) === normalizedHandlerName)
    : [];

  if (handlerMatches.length === 1) {
    return handlerMatches[0];
  }

  if (handlerMatches.length > 1) {
    return null;
  }

  return candidates.length === 1 ? candidates[0] : null;
}

async function markHarvestEventReconciled(
  orgId: string,
  harvestEventId: string,
  values: {
    handlerName?: string | null;
    loadTicket?: string | null;
    hulledWeightLbs?: string | null;
  },
) {
  const existingEvent = await requireHarvestEvent(orgId, harvestEventId);
  const updateValues: Partial<HarvestInsert> = {};

  if (existingEvent.handlerTicketReconciled !== true) {
    updateValues.handlerTicketReconciled = true;
  }

  if (!existingEvent.handlerName && values.handlerName) {
    updateValues.handlerName = values.handlerName;
  }

  if (!existingEvent.loadTicket && values.loadTicket) {
    updateValues.loadTicket = values.loadTicket;
  }

  if (!existingEvent.hulledWeightLbs && values.hulledWeightLbs) {
    updateValues.hulledWeightLbs = values.hulledWeightLbs;
  }

  if (Object.keys(updateValues).length === 0) {
    return existingEvent;
  }

  const [event] = await db
    .update(harvestEvents)
    .set(updateValues)
    .where(and(eq(harvestEvents.id, harvestEventId), eq(harvestEvents.orgId, orgId)))
    .returning();

  return event ?? existingEvent;
}

function buildSummary(
  harvestPayload: Awaited<ReturnType<typeof buildHarvestPayloads>>,
  handlerTicketPayload: Awaited<ReturnType<typeof buildHandlerTicketPayloads>>,
) {
  const matchedImportTicketKeys = new Set(
    handlerTicketPayload
      .filter((row) => row.status === 'matched')
      .map((row) => normalizeTicketKey(row.loadTicket))
      .filter(Boolean),
  );
  const unmatchedImports = handlerTicketPayload.filter((row) => row.status === 'unmatched').length;
  const discrepancyImports = handlerTicketPayload.filter((row) => row.status === 'discrepancy').length;
  const openHarvestTickets = harvestPayload.filter(
    (event) =>
      event.loadTicket &&
      event.handlerTicketReconciled !== true &&
      !matchedImportTicketKeys.has(normalizeTicketKey(event.loadTicket)),
  ).length;

  return {
    totalEvents: harvestPayload.length,
    totalPounds: Number(
      harvestPayload.reduce((sum, event) => sum + Number(event.totalPounds ?? 0), 0).toFixed(2),
    ),
    totalBins: harvestPayload.reduce((sum, event) => sum + Number(event.totalBins ?? 0), 0),
    importedTickets: handlerTicketPayload.length,
    matchedTickets: handlerTicketPayload.filter((row) => row.status === 'matched').length,
    discrepancyTickets: discrepancyImports,
    unmatchedTickets: unmatchedImports,
    unreconciledTickets: openHarvestTickets + unmatchedImports + discrepancyImports,
  };
}

function escapeCsv(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

app.get('/', async (c) => {
  const orgId = c.get('orgId');

  const [blockRows, crewRows, eventRows, importRows] = await Promise.all([
    db
      .select({
        id: blocks.id,
        name: blocks.name,
        ranchId: blocks.ranchId,
        cropType: blocks.cropType,
        variety: blocks.variety,
        acreage: blocks.acreage,
        isOrganic: blocks.isOrganic,
      })
      .from(blocks)
      .where(and(eq(blocks.orgId, orgId), eq(blocks.active, true)))
      .orderBy(asc(blocks.name)),
    db
      .select({
        id: crewMembers.id,
        fullName: crewMembers.fullName,
        employeeId: crewMembers.employeeId,
        position: crewMembers.position,
        active: crewMembers.active,
      })
      .from(crewMembers)
      .where(and(eq(crewMembers.orgId, orgId), eq(crewMembers.active, true)))
      .orderBy(asc(crewMembers.fullName)),
    db
      .select()
      .from(harvestEvents)
      .where(eq(harvestEvents.orgId, orgId))
      .orderBy(desc(harvestEvents.harvestDate), desc(harvestEvents.createdAt))
      .limit(100),
    db
      .select()
      .from(handlerTicketImports)
      .where(eq(handlerTicketImports.orgId, orgId))
      .orderBy(
        desc(handlerTicketImports.ticketDate),
        desc(handlerTicketImports.importDate),
        desc(handlerTicketImports.createdAt),
      )
      .limit(100),
  ]);

  const [harvestPayload, handlerTicketPayload] = await Promise.all([
    buildHarvestPayloads(eventRows),
    buildHandlerTicketPayloads(importRows),
  ]);

  return c.json({
    blocks: blockRows,
    crewMembers: crewRows,
    harvestEvents: harvestPayload,
    handlerTicketImports: handlerTicketPayload,
    summary: buildSummary(harvestPayload, handlerTicketPayload),
  });
});

app.post('/', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeHarvestInput(body);
    const crewIds = values.crewIds ?? [];

    await requireOwnedBlock(orgId, values.blockId!);
    await requireCrewMembers(orgId, crewIds);
    const blockSeasonId = await resolveBlockSeasonId(values.blockId!, values.harvestDate!);

    const [event] = await db
      .insert(harvestEvents)
      .values({
        orgId,
        blockId: values.blockId!,
        blockSeasonId,
        harvestDate: values.harvestDate!,
        harvestMethod: values.harvestMethod ?? null,
        totalPounds: values.totalPounds ?? null,
        totalBins: values.totalBins ?? null,
        binWeightLbs: values.binWeightLbs ?? '1000.00',
        pickerCount: values.pickerCount ?? null,
        crewIds,
        hulledWeightLbs: values.hulledWeightLbs ?? null,
        hullSplitPct: values.hullSplitPct ?? null,
        brix: values.brix ?? null,
        acidRatio: values.acidRatio ?? null,
        handlerName: values.handlerName ?? null,
        loadTicket: values.loadTicket ?? null,
        handlerTicketReconciled: values.handlerTicketReconciled ?? false,
        notes: values.notes ?? null,
        createdBy: profileId,
      })
      .returning();

    const [payload] = await buildHarvestPayloads([event]);
    return c.json(payload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create harvest event.';
    const status = message === 'Block not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.patch('/:id', async (c) => {
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  try {
    const existingEvent = await db.query.harvestEvents.findFirst({
      where: and(eq(harvestEvents.id, id), eq(harvestEvents.orgId, orgId)),
    });

    if (!existingEvent) {
      return c.json({ error: 'Not found' }, 404);
    }

    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeHarvestInput(body, { partial: true });

    const nextBlockId = values.blockId ?? existingEvent.blockId;
    const nextHarvestDate = values.harvestDate ?? existingEvent.harvestDate;
    const nextCrewIds = values.crewIds ?? existingEvent.crewIds ?? [];

    await requireOwnedBlock(orgId, nextBlockId);
    await requireCrewMembers(orgId, nextCrewIds);
    const blockSeasonId = await resolveBlockSeasonId(nextBlockId, nextHarvestDate);

    const updateValues: Partial<HarvestInsert> = {};
    if (values.blockId !== undefined) updateValues.blockId = values.blockId!;
    if (values.harvestDate !== undefined) updateValues.harvestDate = values.harvestDate!;
    if (values.harvestMethod !== undefined) updateValues.harvestMethod = values.harvestMethod ?? null;
    if (values.totalPounds !== undefined) updateValues.totalPounds = values.totalPounds ?? null;
    if (values.totalBins !== undefined) updateValues.totalBins = values.totalBins ?? null;
    if (values.binWeightLbs !== undefined) updateValues.binWeightLbs = values.binWeightLbs ?? null;
    if (values.pickerCount !== undefined) updateValues.pickerCount = values.pickerCount ?? null;
    if (values.crewIds !== undefined) updateValues.crewIds = nextCrewIds;
    if (values.hulledWeightLbs !== undefined) updateValues.hulledWeightLbs = values.hulledWeightLbs ?? null;
    if (values.hullSplitPct !== undefined) updateValues.hullSplitPct = values.hullSplitPct ?? null;
    if (values.brix !== undefined) updateValues.brix = values.brix ?? null;
    if (values.acidRatio !== undefined) updateValues.acidRatio = values.acidRatio ?? null;
    if (values.handlerName !== undefined) updateValues.handlerName = values.handlerName ?? null;
    if (values.loadTicket !== undefined) updateValues.loadTicket = values.loadTicket ?? null;
    if (values.handlerTicketReconciled !== undefined) {
      updateValues.handlerTicketReconciled = values.handlerTicketReconciled;
    }
    if (values.notes !== undefined) updateValues.notes = values.notes ?? null;

    updateValues.blockSeasonId = blockSeasonId;

    const [event] = await db
      .update(harvestEvents)
      .set(updateValues)
      .where(and(eq(harvestEvents.id, id), eq(harvestEvents.orgId, orgId)))
      .returning();

    const [payload] = await buildHarvestPayloads([event]);
    return c.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update harvest event.';
    const status = message === 'Block not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.post('/handler-ticket-imports', async (c) => {
  const orgId = c.get('orgId');
  const profileId = c.get('profileId');

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeHandlerTicketInput(body);

    let matchedEventId = values.harvestEventId ?? null;
    if (matchedEventId) {
      await requireHarvestEvent(orgId, matchedEventId);
    } else {
      matchedEventId = (await findMatchingHarvestEvent(orgId, values.handlerName!, values.loadTicket!))?.id ?? null;
    }

    const finalStatus = values.status ?? (matchedEventId ? 'matched' : 'unmatched');
    if (finalStatus === 'matched' && !matchedEventId) {
      throw new Error('A matched handler ticket needs a linked harvest event.');
    }

    const [importRow] = await db
      .insert(handlerTicketImports)
      .values({
        orgId,
        harvestEventId: matchedEventId,
        importDate: new Date(),
        handlerName: values.handlerName!,
        loadTicket: values.loadTicket!,
        ticketDate: values.ticketDate ?? null,
        netPounds: values.netPounds ?? null,
        grossPounds: values.grossPounds ?? null,
        moisturePct: values.moisturePct ?? null,
        hulledWeightLbs: values.hulledWeightLbs ?? null,
        pricePerPound: values.pricePerPound ?? null,
        grossValue: values.grossValue ?? null,
        status: finalStatus,
        discrepancyNotes: values.discrepancyNotes ?? null,
        importedBy: profileId,
      })
      .returning();

    if (matchedEventId && finalStatus === 'matched') {
      await markHarvestEventReconciled(orgId, matchedEventId, {
        handlerName: values.handlerName,
        loadTicket: values.loadTicket,
        hulledWeightLbs: values.hulledWeightLbs,
      });
    }

    const [payload] = await buildHandlerTicketPayloads([{ ...importRow, status: finalStatus }]);
    return c.json(payload, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to import handler ticket.';
    const status = message === 'Harvest event not found for this organization.' ? 404 : 400;
    return c.json({ error: message }, status);
  }
});

app.patch('/handler-ticket-imports/:id', async (c) => {
  const orgId = c.get('orgId');
  const id = c.req.param('id');

  try {
    const existingImport = await requireHandlerTicketImport(orgId, id);
    const body = await c.req.json<Record<string, unknown>>();
    const values = sanitizeHandlerTicketInput(body, { partial: true });

    const currentStatus = getHandlerTicketStatus(existingImport.status);
    let nextHarvestEventId =
      values.harvestEventId !== undefined ? values.harvestEventId ?? null : existingImport.harvestEventId ?? null;
    if (nextHarvestEventId) {
      await requireHarvestEvent(orgId, nextHarvestEventId);
    }

    let nextStatus = values.status ?? currentStatus;
    if (values.harvestEventId !== undefined && !nextHarvestEventId && values.status === undefined && nextStatus === 'matched') {
      nextStatus = 'unmatched';
    }

    if (nextStatus === 'matched' && !nextHarvestEventId) {
      throw new Error('A matched handler ticket needs a linked harvest event.');
    }

    const updateValues: Partial<HandlerTicketInsert> = {};
    if (values.harvestEventId !== undefined) updateValues.harvestEventId = nextHarvestEventId;
    if (values.handlerName !== undefined) updateValues.handlerName = values.handlerName!;
    if (values.loadTicket !== undefined) updateValues.loadTicket = values.loadTicket!;
    if (values.ticketDate !== undefined) updateValues.ticketDate = values.ticketDate ?? null;
    if (values.netPounds !== undefined) updateValues.netPounds = values.netPounds ?? null;
    if (values.grossPounds !== undefined) updateValues.grossPounds = values.grossPounds ?? null;
    if (values.moisturePct !== undefined) updateValues.moisturePct = values.moisturePct ?? null;
    if (values.hulledWeightLbs !== undefined) updateValues.hulledWeightLbs = values.hulledWeightLbs ?? null;
    if (values.pricePerPound !== undefined) updateValues.pricePerPound = values.pricePerPound ?? null;
    if (values.grossValue !== undefined) updateValues.grossValue = values.grossValue ?? null;
    if (values.status !== undefined || nextStatus !== currentStatus) updateValues.status = nextStatus;
    if (values.discrepancyNotes !== undefined) updateValues.discrepancyNotes = values.discrepancyNotes ?? null;

    const [importRow] = await db
      .update(handlerTicketImports)
      .set(updateValues)
      .where(and(eq(handlerTicketImports.id, id), eq(handlerTicketImports.orgId, orgId)))
      .returning();

    if (nextHarvestEventId && nextStatus === 'matched') {
      await markHarvestEventReconciled(orgId, nextHarvestEventId, {
        handlerName: values.handlerName ?? existingImport.handlerName,
        loadTicket: values.loadTicket ?? existingImport.loadTicket,
        hulledWeightLbs: values.hulledWeightLbs ?? existingImport.hulledWeightLbs,
      });
    }

    const [payload] = await buildHandlerTicketPayloads([{ ...importRow, status: nextStatus }]);
    return c.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reconcile handler ticket.';
    const status =
      message === 'Handler ticket import not found for this organization.' ||
      message === 'Harvest event not found for this organization.'
        ? 404
        : 400;
    return c.json({ error: message }, status);
  }
});

app.get('/export.csv', async (c) => {
  const orgId = c.get('orgId');
  const ranchId = normalizeText(c.req.query('ranch_id'));
  const eventRows = await db
    .select()
    .from(harvestEvents)
    .where(eq(harvestEvents.orgId, orgId))
    .orderBy(desc(harvestEvents.harvestDate), desc(harvestEvents.createdAt));

  const payload = (await buildHarvestPayloads(eventRows)).filter((event) =>
    ranchId ? event.block?.ranchId === ranchId : true,
  );
  const rows = [
    [
      'Harvest Date',
      'Block',
      'Method',
      'Total Pounds',
      'Pounds Per Acre',
      'Total Bins',
      'Picker Count',
      'Crew',
      'Handler',
      'Load Ticket',
      'Reconciled',
      'Notes',
    ],
    ...payload.map((event) => [
      event.harvestDate,
      event.block?.name ?? '',
      event.harvestMethod ?? '',
      event.totalPounds ?? '',
      event.poundsPerAcre ?? '',
      event.totalBins ?? '',
      event.pickerCount ?? '',
      event.crewMembers.map((crewMember) => crewMember.fullName).join('; '),
      event.handlerName ?? '',
      event.loadTicket ?? '',
      event.handlerTicketReconciled ? 'yes' : 'no',
      event.notes ?? '',
    ]),
  ];

  const csv = `${rows.map((row) => row.map((value) => escapeCsv(value)).join(',')).join('\n')}\n`;
  c.header('content-type', 'text/csv; charset=utf-8');
  c.header('content-disposition', `attachment; filename=\"harvest-events-${new Date().toISOString().slice(0, 10)}.csv\"`);
  return c.body(csv);
});

export default app;
