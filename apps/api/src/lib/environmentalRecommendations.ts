import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@ranchos/db/src';
import {
  aiRecommendations,
  blockIrrigationConfig,
  blockSeasons,
  blocks,
  degreeDayRecords,
  etData,
  irrigationEvents,
  pestSpecies,
  scoutingLogs,
  taskBlocks,
  taskTypes,
  tasks,
  weatherForecasts,
} from '@ranchos/db/src/schema';
import {
  CandidateRecommendation,
  formatDateLabel,
  pushCandidate,
  syncGeneratedRecommendations,
  toNumber,
  addDays,
} from './intelligenceRecommendations';
import { DEGREE_DAY_MODELS as PEST_MODELS } from './degreeDayModels';

function getMonthKc(config: {
  kcJan?: string | null;
  kcFeb?: string | null;
  kcMar?: string | null;
  kcApr?: string | null;
  kcMay?: string | null;
  kcJun?: string | null;
  kcJul?: string | null;
  kcAug?: string | null;
  kcSep?: string | null;
  kcOct?: string | null;
  kcNov?: string | null;
  kcDec?: string | null;
}) {
  const monthKeys = [
    'kcJan',
    'kcFeb',
    'kcMar',
    'kcApr',
    'kcMay',
    'kcJun',
    'kcJul',
    'kcAug',
    'kcSep',
    'kcOct',
    'kcNov',
    'kcDec',
  ] as const;

  const currentMonthKey = monthKeys[new Date().getMonth()];
  return toNumber(config[currentMonthKey]) ?? 1;
}

function buildEnvironmentalCandidates(input: {
  blockRows: Array<{
    id: string;
    name: string;
    orgId: string;
    cropType: string;
  }>;
  irrigationConfigRows: Array<{
    blockId: string;
    cimisStationId: number | null;
    deficitTriggerInches: string | null;
    emitterFlowGph: string | null;
    emittersPerTree: number | null;
    treeSpacingFt: string | null;
    rowSpacingFt: string | null;
    kcJan: string | null;
    kcFeb: string | null;
    kcMar: string | null;
    kcApr: string | null;
    kcMay: string | null;
    kcJun: string | null;
    kcJul: string | null;
    kcAug: string | null;
    kcSep: string | null;
    kcOct: string | null;
    kcNov: string | null;
    kcDec: string | null;
  }>;
  irrigationEventRows: Array<{
    blockId: string;
    scheduledDate: string;
    status: string;
  }>;
  forecastRows: Array<{
    stationId: number;
    forecastDate: string;
    etoInches: string | null;
    maxTempF: string | null;
    minTempF: string | null;
    precipitationProbabilityPct: string | null;
    windSpeedMph: string | null;
  }>;
  etDataRows: Array<{
    stationId: number;
    date: string;
    etoInches: string | null;
  }>;
  degreeDayRows: Array<{
    cimisStationId: number;
    pestModel: string;
    date: string;
    cumulativeDd: string | null;
  }>;
  blockSeasonRows: Array<{
    blockId: string;
    seasonYear: number;
    hullSplitStart: string | null;
  }>;
  taskRows: Array<{
    blockId: string;
    taskId: string;
    title: string;
    dueDate: string;
    status: string;
    priority: string;
    taskTypeName: string | null;
  }>;
  scoutingRows: Array<{
    blockId: string;
    id: string;
    scoutedAt: Date;
    rating: string | null;
    pestNameCustom: string | null;
    pestSpeciesName: string | null;
  }>;
  today: string;
  now: Date;
}) {
  const candidates: CandidateRecommendation[] = [];
  const currentYear = new Date().getFullYear();
  const etStaleCutoff = addDays(input.today, -3);
  const forecastWindowEnd = addDays(input.today, 3);
  const recentScoutingCutoff = new Date(input.now);
  recentScoutingCutoff.setDate(recentScoutingCutoff.getDate() - 7);
  const elevatedScoutingCutoff = new Date(input.now);
  elevatedScoutingCutoff.setDate(elevatedScoutingCutoff.getDate() - 14);

  const configByBlockId = new Map(input.irrigationConfigRows.map((row) => [row.blockId, row]));
  const completedIrrigationByBlockId = new Map<string, string>();
  const latestDegreeDayByStationModel = new Map<string, (typeof input.degreeDayRows)[number]>();
  const latestEtByStation = new Map<number, (typeof input.etDataRows)[number]>();
  const etRowsByStation = new Map<number, typeof input.etDataRows>();
  const forecastRowsByStation = new Map<number, typeof input.forecastRows>();
  const tasksByBlockId = new Map<string, typeof input.taskRows>();
  const scoutingByBlockId = new Map<string, typeof input.scoutingRows>();
  const seasonByBlockId = new Map(
    input.blockSeasonRows
      .filter((row) => row.seasonYear === currentYear)
      .map((row) => [row.blockId, row]),
  );

  for (const irrigationEvent of input.irrigationEventRows) {
    if (irrigationEvent.status !== 'completed') {
      continue;
    }

    const existing = completedIrrigationByBlockId.get(irrigationEvent.blockId);
    if (!existing || irrigationEvent.scheduledDate > existing) {
      completedIrrigationByBlockId.set(irrigationEvent.blockId, irrigationEvent.scheduledDate);
    }
  }

  for (const etRow of input.etDataRows) {
    const latest = latestEtByStation.get(etRow.stationId);
    if (!latest || etRow.date > latest.date) {
      latestEtByStation.set(etRow.stationId, etRow);
    }

    const rows = etRowsByStation.get(etRow.stationId) ?? [];
    rows.push(etRow);
    etRowsByStation.set(etRow.stationId, rows);
  }

  for (const forecastRow of input.forecastRows) {
    const rows = forecastRowsByStation.get(forecastRow.stationId) ?? [];
    rows.push(forecastRow);
    forecastRowsByStation.set(forecastRow.stationId, rows);
  }

  for (const taskRow of input.taskRows) {
    const rows = tasksByBlockId.get(taskRow.blockId) ?? [];
    rows.push(taskRow);
    tasksByBlockId.set(taskRow.blockId, rows);
  }

  for (const scoutingRow of input.scoutingRows) {
    const rows = scoutingByBlockId.get(scoutingRow.blockId) ?? [];
    rows.push(scoutingRow);
    scoutingByBlockId.set(scoutingRow.blockId, rows);
  }

  for (const degreeDayRow of input.degreeDayRows) {
    const key = `${degreeDayRow.cimisStationId}:${degreeDayRow.pestModel}`;
    if (!latestDegreeDayByStationModel.has(key)) {
      latestDegreeDayByStationModel.set(key, degreeDayRow);
    }
  }

  for (const block of input.blockRows) {
    const config = configByBlockId.get(block.id);
    if (!config?.cimisStationId) {
      continue;
    }

    const stationId = config.cimisStationId;
    const latestEt = latestEtByStation.get(stationId);

    if (!latestEt) {
      pushCandidate(candidates, {
        blockId: block.id,
        recommendationType: 'irrigation',
        titleEn: `Load ET history for ${block.name}`,
        titleEs: `Carga historial ET para ${block.name}`,
        bodyEn: `This block is linked to CIMIS station ${stationId}, but RanchOS does not have ET history yet. Sync ET data before relying on seasonal water timing here.`,
        bodyEs: `Este bloque esta ligado a la estacion CIMIS ${stationId}, pero RanchOS todavia no tiene historial ET. Sincroniza ET antes de confiar en el tiempo estacional de riego aqui.`,
        urgency: 'suggestion',
        dataInputs: {
          sourceCategory: 'seasonal',
          stationId,
          missingEtData: true,
        },
      });
      continue;
    }

    if (latestEt.date < etStaleCutoff) {
      pushCandidate(candidates, {
        blockId: block.id,
        recommendationType: 'irrigation',
        titleEn: `Refresh ET data for ${block.name}`,
        titleEs: `Actualiza datos ET para ${block.name}`,
        bodyEn: `The latest ET record for station ${stationId} is from ${formatDateLabel(latestEt.date)}. Refresh weather data before trusting irrigation timing on this block.`,
        bodyEs: `El ultimo dato ET para la estacion ${stationId} es del ${formatDateLabel(latestEt.date)}. Actualiza clima antes de confiar en el tiempo de riego para este bloque.`,
        urgency: 'warning',
        dataInputs: {
          sourceCategory: 'seasonal',
          stationId,
          latestEtDate: latestEt.date,
          staleEtData: true,
        },
      });
    }

    const kc = getMonthKc(config);
    const baselineDate = completedIrrigationByBlockId.get(block.id) ?? addDays(input.today, -7);
    const etDeficit = (etRowsByStation.get(stationId) ?? [])
      .filter((etRow) => etRow.date >= baselineDate)
      .reduce((sum, etRow) => sum + (toNumber(etRow.etoInches) ?? 0) * kc, 0);
    const trigger = toNumber(config.deficitTriggerInches) ?? 1.5;
    const blockEvents = (input.irrigationEventRows ?? []).filter((eventRow) => eventRow.blockId === block.id);
    const upcomingOrRunningEvent = blockEvents
      .filter(
        (eventRow) =>
          eventRow.scheduledDate >= input.today &&
          (eventRow.status === 'scheduled' || eventRow.status === 'running'),
      )
      .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate))[0];

    if (etDeficit >= trigger) {
      const emitterFlow = toNumber(config.emitterFlowGph);
      const emittersPerTree = toNumber(config.emittersPerTree);
      const treeSpacing = toNumber(config.treeSpacingFt);
      const rowSpacing = toNumber(config.rowSpacingFt);
      let runtimeMessage = '';

      if (emitterFlow && emittersPerTree && treeSpacing && rowSpacing) {
        const sqFtPerTree = treeSpacing * rowSpacing;
        const flowPerAcre = (43560 / sqFtPerTree) * emitterFlow * emittersPerTree;
        const appRateInchesPerHour = (flowPerAcre / 27154) * 0.9;
        if (appRateInchesPerHour > 0) {
          const recommendedRuntimeHours = Math.round(((etDeficit / 0.9) / appRateInchesPerHour) * 4) / 4;
          runtimeMessage = ` Estimated runtime is about ${recommendedRuntimeHours.toFixed(2)} hours at the current emitter setup.`;
        }
      }

      pushCandidate(candidates, {
        blockId: block.id,
        recommendationType: 'irrigation',
        titleEn: `ET deficit is above trigger in ${block.name}`,
        titleEs: `El deficit ET supera el disparador en ${block.name}`,
        bodyEn: `${block.name} is sitting near ${etDeficit.toFixed(2)} inches of ET deficit since ${formatDateLabel(baselineDate)}, above the ${trigger.toFixed(2)} inch trigger.${runtimeMessage}`,
        bodyEs: `${block.name} tiene cerca de ${etDeficit.toFixed(2)} pulgadas de deficit ET desde ${formatDateLabel(baselineDate)}, por arriba del disparador de ${trigger.toFixed(2)} pulgadas.${runtimeMessage}`,
        urgency: etDeficit >= trigger * 1.3 ? 'urgent' : 'warning',
        dataInputs: {
          sourceCategory: 'seasonal',
          stationId,
          etDeficitInches: Number(etDeficit.toFixed(4)),
          deficitTriggerInches: trigger,
          baselineDate,
          latestEtDate: latestEt.date,
        },
      });
    }

    const forecastRows = (forecastRowsByStation.get(stationId) ?? [])
      .filter((forecastRow) => forecastRow.forecastDate >= input.today)
      .sort((left, right) => left.forecastDate.localeCompare(right.forecastDate))
      .slice(0, 3);
    const blockTasks = (tasksByBlockId.get(block.id) ?? []).filter((taskRow) => taskRow.status !== 'completed');
    const blockScoutingRows = (scoutingByBlockId.get(block.id) ?? [])
      .slice()
      .sort((left, right) => right.scoutedAt.getTime() - left.scoutedAt.getTime());
    const recentScouting = blockScoutingRows.find((row) => row.scoutedAt >= recentScoutingCutoff) ?? null;
    const elevatedScouting = blockScoutingRows.find(
      (row) =>
        row.scoutedAt >= elevatedScoutingCutoff &&
        (row.rating === 'high' || row.rating === 'action'),
    ) ?? null;

    if (forecastRows.length > 0) {
      let projectedDeficit = etDeficit;
      let cumulativeForecastEtc = 0;
      let crossingDate: string | null = null;
      let hottestForecast: (typeof forecastRows)[number] | null = null;

      for (const forecastRow of forecastRows) {
        cumulativeForecastEtc += (toNumber(forecastRow.etoInches) ?? 0) * kc;
        projectedDeficit = etDeficit + cumulativeForecastEtc;
        if (!crossingDate && projectedDeficit >= trigger) {
          crossingDate = forecastRow.forecastDate;
        }

        if (
          !hottestForecast ||
          (toNumber(forecastRow.maxTempF) ?? 0) > (toNumber(hottestForecast.maxTempF) ?? 0)
        ) {
          hottestForecast = forecastRow;
        }
      }

      if (crossingDate) {
        const eventAfterCrossing =
          upcomingOrRunningEvent && upcomingOrRunningEvent.scheduledDate > crossingDate;

        if (!upcomingOrRunningEvent || eventAfterCrossing) {
          const hottestTemp = toNumber(hottestForecast?.maxTempF);
          const hottestLabel = hottestForecast
            ? `${formatDateLabel(hottestForecast.forecastDate)} at ${(hottestTemp ?? 0).toFixed(0)}F`
            : formatDateLabel(crossingDate);

          pushCandidate(candidates, {
            blockId: block.id,
            recommendationType: 'irrigation',
            titleEn: `Forecast pressure is building in ${block.name}`,
            titleEs: `La presion pronosticada sube en ${block.name}`,
            bodyEn: !upcomingOrRunningEvent
              ? `${block.name} is projected to cross its ${trigger.toFixed(2)} inch ET trigger by ${formatDateLabel(
                  crossingDate,
                )}. The next ${forecastRows.length} days add about ${cumulativeForecastEtc.toFixed(
                  2,
                )} inches of forecast ET demand, with the hottest day around ${hottestLabel}. Queue irrigation before that window lands.`
              : `${block.name} is projected to cross its ${trigger.toFixed(2)} inch ET trigger by ${formatDateLabel(
                  crossingDate,
                )}, but the next irrigation is not scheduled until ${formatDateLabel(
                  upcomingOrRunningEvent.scheduledDate,
                )}. Pull that pass forward if possible so the hot window does not arrive first.`,
            bodyEs: !upcomingOrRunningEvent
              ? `${block.name} se proyecta por arriba del disparador ET de ${trigger.toFixed(
                  2,
                )} pulgadas para ${formatDateLabel(
                  crossingDate,
                )}. Los proximos ${forecastRows.length} dias agregan cerca de ${cumulativeForecastEtc.toFixed(
                  2,
                )} pulgadas de demanda ET pronosticada, con el dia mas caliente cerca de ${hottestLabel}. Programa riego antes de esa ventana.`
              : `${block.name} se proyecta por arriba del disparador ET de ${trigger.toFixed(
                  2,
                )} pulgadas para ${formatDateLabel(
                  crossingDate,
                )}, pero el siguiente riego no esta programado hasta ${formatDateLabel(
                  upcomingOrRunningEvent.scheduledDate,
                )}. Adelanta esa pasada si puedes para que la ventana caliente no llegue primero.`,
            urgency:
              (hottestTemp ?? 0) >= 98 || projectedDeficit >= trigger * 1.2 ? 'urgent' : 'warning',
            dataInputs: {
              sourceCategory: 'seasonal',
              stationId,
              forecastAware: true,
              baselineDate,
              currentEtDeficitInches: Number(etDeficit.toFixed(4)),
              projectedEtDeficitInches: Number(projectedDeficit.toFixed(4)),
              forecastEtcInches: Number(cumulativeForecastEtc.toFixed(4)),
              crossingDate,
              hottestForecastDate: hottestForecast?.forecastDate ?? null,
              hottestForecastMaxTempF: hottestTemp ?? null,
              upcomingIrrigationDate: upcomingOrRunningEvent?.scheduledDate ?? null,
            },
          });
        }
      }
    }

    const upcomingSprayTask = blockTasks
      .filter(
        (taskRow) =>
          taskRow.taskTypeName === 'Spray' &&
          taskRow.dueDate >= input.today &&
          taskRow.dueDate <= forecastWindowEnd,
      )
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];

    if (upcomingSprayTask) {
      const sprayForecast =
        forecastRows.find((forecastRow) => forecastRow.forecastDate === upcomingSprayTask.dueDate) ?? null;
      const forecastWind = toNumber(sprayForecast?.windSpeedMph);
      const forecastHeat = toNumber(sprayForecast?.maxTempF);
      const forecastRain = toNumber(sprayForecast?.precipitationProbabilityPct);
      const sprayIssues: string[] = [];

      if ((forecastWind ?? 0) >= 12) {
        sprayIssues.push(`winds near ${(forecastWind ?? 0).toFixed(1)} mph`);
      }
      if ((forecastHeat ?? 0) >= 95) {
        sprayIssues.push(`heat near ${(forecastHeat ?? 0).toFixed(0)}F`);
      }
      if ((forecastRain ?? 0) >= 35) {
        sprayIssues.push(`rain odds around ${(forecastRain ?? 0).toFixed(0)}%`);
      }

      if (sprayForecast && sprayIssues.length > 0) {
        pushCandidate(candidates, {
          blockId: block.id,
          recommendationType: 'general',
          titleEn: `Review spray timing for ${block.name}`,
          titleEs: `Revisa el tiempo de aplicacion para ${block.name}`,
          bodyEn: `${upcomingSprayTask.title} is due on ${formatDateLabel(
            upcomingSprayTask.dueDate,
          )}, but the forecast is showing ${sprayIssues.join(', ')}. Reconfirm label limits, drift risk, and whether this spray should shift to a cleaner window.`,
          bodyEs: `${upcomingSprayTask.title} vence el ${formatDateLabel(
            upcomingSprayTask.dueDate,
          )}, pero el pronostico viene con ${sprayIssues.join(', ')}. Revisa limites de etiqueta, riesgo de deriva y si conviene mover esta aplicacion a una ventana mas limpia.`,
          urgency:
            (forecastWind ?? 0) >= 18 || (forecastHeat ?? 0) >= 100 || (forecastRain ?? 0) >= 55
              ? 'urgent'
              : 'warning',
          dataInputs: {
            sourceCategory: 'seasonal',
            stationId,
            forecastAware: true,
            taskId: upcomingSprayTask.taskId,
            taskTitle: upcomingSprayTask.title,
            taskDueDate: upcomingSprayTask.dueDate,
            forecastDate: sprayForecast.forecastDate,
            forecastWindMph: forecastWind ?? null,
            forecastMaxTempF: forecastHeat ?? null,
            precipitationProbabilityPct: forecastRain ?? null,
          },
        });
      }
    }

    const hottestForecast = forecastRows
      .slice()
      .sort((left, right) => (toNumber(right.maxTempF) ?? 0) - (toNumber(left.maxTempF) ?? 0))[0] ?? null;
    const hottestForecastTemp = toNumber(hottestForecast?.maxTempF);
    const upcomingScoutTask = blockTasks
      .filter(
        (taskRow) =>
          taskRow.taskTypeName === 'Scout' &&
          taskRow.dueDate >= input.today &&
          taskRow.dueDate <= forecastWindowEnd,
      )
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];

    let scoutDriverLabel: string | null = null;
    let scoutUrgency: CandidateRecommendation['urgency'] = 'suggestion';
    let scoutDriverData: Record<string, unknown> = {};

    for (const [modelKey, model] of Object.entries(PEST_MODELS)) {
      if (!(model.applicableCrops as readonly string[]).includes(block.cropType)) {
        continue;
      }

      const latestDegreeDay = latestDegreeDayByStationModel.get(`${stationId}:${modelKey}`);
      const cumulativeDd = toNumber(latestDegreeDay?.cumulativeDd) ?? 0;

    if (cumulativeDd >= model.actionThresholdDd) {
        scoutDriverLabel = `${model.label} is already active`;
        scoutUrgency = 'warning';
        scoutDriverData = {
          pestModel: modelKey,
          cumulativeDd,
        thresholdDd: model.actionThresholdDd,
          degreeDayDate: latestDegreeDay?.date ?? null,
        };
        break;
      }

      const thresholdRatio = modelKey === 'NOW' ? 0.85 : 0.8;
    if (cumulativeDd >= model.actionThresholdDd * thresholdRatio) {
        scoutDriverLabel = `${model.label} timing is approaching`;
        scoutUrgency = 'suggestion';
        scoutDriverData = {
          pestModel: modelKey,
          cumulativeDd,
        thresholdDd: model.actionThresholdDd,
          degreeDayDate: latestDegreeDay?.date ?? null,
        };
        break;
      }
    }

    if (!scoutDriverLabel && elevatedScouting) {
      const pestName = elevatedScouting.pestSpeciesName ?? elevatedScouting.pestNameCustom ?? 'recent pest pressure';
      scoutDriverLabel = `${pestName} pressure was elevated recently`;
      scoutUrgency = elevatedScouting.rating === 'action' ? 'urgent' : 'warning';
      scoutDriverData = {
        scoutingLogId: elevatedScouting.id,
        scoutingRating: elevatedScouting.rating,
        pestName,
        scoutedAt: elevatedScouting.scoutedAt.toISOString(),
      };
    }

    const needsScoutBeforeHeat =
      hottestForecast &&
      (hottestForecastTemp ?? 0) >= 95 &&
      !recentScouting &&
      Boolean(scoutDriverLabel) &&
      (!upcomingScoutTask || upcomingScoutTask.dueDate > hottestForecast.forecastDate);

    if (needsScoutBeforeHeat) {
      pushCandidate(candidates, {
        blockId: block.id,
        recommendationType: 'pest_action',
        titleEn: `Scout ${block.name} before the next heat window`,
        titleEs: `Monitorea ${block.name} antes de la siguiente ventana caliente`,
        bodyEn: `${scoutDriverLabel}. The forecast peaks around ${formatDateLabel(
          hottestForecast.forecastDate,
        )} near ${(hottestForecastTemp ?? 0).toFixed(0)}F, and there is no scouting pass queued before then. Pull a scouting walk forward so pest pressure is checked before heat accelerates it.`,
        bodyEs: `${scoutDriverLabel}. El pronostico sube cerca del ${formatDateLabel(
          hottestForecast.forecastDate,
        )} con ${(hottestForecastTemp ?? 0).toFixed(0)}F, y no hay monitoreo programado antes de esa fecha. Adelanta una pasada de monitoreo para revisar presion de plaga antes de que el calor la acelere.`,
        urgency: scoutUrgency,
        dataInputs: {
          sourceCategory: 'seasonal',
          stationId,
          forecastAware: true,
          hottestForecastDate: hottestForecast.forecastDate,
          hottestForecastMaxTempF: hottestForecastTemp ?? null,
          recentScoutingPresent: false,
          upcomingScoutTaskDate: upcomingScoutTask?.dueDate ?? null,
          ...scoutDriverData,
        },
      });
    }

    for (const [modelKey, model] of Object.entries(PEST_MODELS)) {
      if (!(model.applicableCrops as readonly string[]).includes(block.cropType)) {
        continue;
      }

      const latestDegreeDay = latestDegreeDayByStationModel.get(`${stationId}:${modelKey}`);
      if (!latestDegreeDay) {
        continue;
      }

      const cumulativeDd = toNumber(latestDegreeDay.cumulativeDd) ?? 0;
      const season = seasonByBlockId.get(block.id);

      if (modelKey === 'NOW' && block.cropType === 'almond' && !season?.hullSplitStart) {
      if (cumulativeDd >= model.actionThresholdDd) {
          pushCandidate(candidates, {
            blockId: block.id,
            recommendationType: 'hull_split',
            titleEn: `Hull split timing is active in ${block.name}`,
            titleEs: `La ventana de apertura esta activa en ${block.name}`,
              bodyEn: `${model.label} degree days have reached ${cumulativeDd.toFixed(0)} at station ${stationId}, which is past the ${model.actionThresholdDd} threshold. Use this block as a hull split watch candidate now.`,
              bodyEs: `Los grados-dia de ${model.label} llegaron a ${cumulativeDd.toFixed(0)} en la estacion ${stationId}, arriba del umbral ${model.actionThresholdDd}. Usa este bloque como candidato para vigilar apertura ahora.`,
            urgency: 'warning',
            dataInputs: {
              sourceCategory: 'seasonal',
              stationId,
              pestModel: modelKey,
              cumulativeDd,
                thresholdDd: model.actionThresholdDd,
              degreeDayDate: latestDegreeDay.date,
            },
          });
      } else if (cumulativeDd >= model.actionThresholdDd * 0.85) {
          pushCandidate(candidates, {
            blockId: block.id,
            recommendationType: 'hull_split',
            titleEn: `Hull split timing is approaching in ${block.name}`,
            titleEs: `La apertura se acerca en ${block.name}`,
              bodyEn: `${model.label} degree days are at ${cumulativeDd.toFixed(0)} out of ${model.actionThresholdDd} for station ${stationId}. Start lining up scouting and spray readiness for hull split timing.`,
              bodyEs: `Los grados-dia de ${model.label} van en ${cumulativeDd.toFixed(0)} de ${model.actionThresholdDd} para la estacion ${stationId}. Empieza a preparar monitoreo y aplicacion para la apertura.`,
            urgency: 'suggestion',
            dataInputs: {
              sourceCategory: 'seasonal',
              stationId,
              pestModel: modelKey,
              cumulativeDd,
                thresholdDd: model.actionThresholdDd,
              degreeDayDate: latestDegreeDay.date,
            },
          });
        }
      }

      if (modelKey === 'PTB') {
      if (cumulativeDd >= model.actionThresholdDd) {
          pushCandidate(candidates, {
            blockId: block.id,
            recommendationType: 'pest_action',
            titleEn: `${model.label} timing is active in ${block.name}`,
            titleEs: `El tiempo de ${model.label} esta activo en ${block.name}`,
              bodyEn: `${model.label} degree days are at ${cumulativeDd.toFixed(0)} for station ${stationId}, above the ${model.actionThresholdDd} threshold. Prioritize scouting and any planned response in this block.`,
              bodyEs: `Los grados-dia de ${model.label} estan en ${cumulativeDd.toFixed(0)} para la estacion ${stationId}, arriba del umbral ${model.actionThresholdDd}. Prioriza monitoreo y cualquier respuesta planeada en este bloque.`,
            urgency: 'warning',
            dataInputs: {
              sourceCategory: 'seasonal',
              stationId,
              pestModel: modelKey,
              cumulativeDd,
                thresholdDd: model.actionThresholdDd,
              degreeDayDate: latestDegreeDay.date,
            },
          });
      } else if (cumulativeDd >= model.actionThresholdDd * 0.8) {
          pushCandidate(candidates, {
            blockId: block.id,
            recommendationType: 'pest_action',
            titleEn: `${model.label} timing is approaching in ${block.name}`,
            titleEs: `El tiempo de ${model.label} se acerca en ${block.name}`,
              bodyEn: `${model.label} degree days are at ${cumulativeDd.toFixed(0)} out of ${model.actionThresholdDd} for station ${stationId}. Queue scouting before the threshold fully arrives.`,
              bodyEs: `Los grados-dia de ${model.label} van en ${cumulativeDd.toFixed(0)} de ${model.actionThresholdDd} para la estacion ${stationId}. Programa monitoreo antes de que llegue todo el umbral.`,
            urgency: 'suggestion',
            dataInputs: {
              sourceCategory: 'seasonal',
              stationId,
              pestModel: modelKey,
              cumulativeDd,
                thresholdDd: model.actionThresholdDd,
              degreeDayDate: latestDegreeDay.date,
            },
          });
        }
      }
    }
  }

  return candidates;
}

export async function refreshEnvironmentalRecommendations(options: { orgIds?: string[] } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const orgIds = options.orgIds ?? [];

  const blockRows = await db
    .select({
      id: blocks.id,
      orgId: blocks.orgId,
      name: blocks.name,
      cropType: blocks.cropType,
    })
    .from(blocks)
    .where(
      orgIds.length === 0
        ? eq(blocks.active, true)
        : and(eq(blocks.active, true), inArray(blocks.orgId, orgIds)),
    )
    .orderBy(desc(blocks.createdAt));

  const blockIds = blockRows.map((block) => block.id);
  if (blockIds.length === 0) {
    return { candidates: 0, inserted: 0, updated: 0 };
  }

  const irrigationConfigRows = await db
    .select({
      blockId: blockIrrigationConfig.blockId,
      cimisStationId: blockIrrigationConfig.cimisStationId,
      deficitTriggerInches: blockIrrigationConfig.deficitTriggerInches,
      emitterFlowGph: blockIrrigationConfig.emitterFlowGph,
      emittersPerTree: blockIrrigationConfig.emittersPerTree,
      treeSpacingFt: blockIrrigationConfig.treeSpacingFt,
      rowSpacingFt: blockIrrigationConfig.rowSpacingFt,
      kcJan: blockIrrigationConfig.kcJan,
      kcFeb: blockIrrigationConfig.kcFeb,
      kcMar: blockIrrigationConfig.kcMar,
      kcApr: blockIrrigationConfig.kcApr,
      kcMay: blockIrrigationConfig.kcMay,
      kcJun: blockIrrigationConfig.kcJun,
      kcJul: blockIrrigationConfig.kcJul,
      kcAug: blockIrrigationConfig.kcAug,
      kcSep: blockIrrigationConfig.kcSep,
      kcOct: blockIrrigationConfig.kcOct,
      kcNov: blockIrrigationConfig.kcNov,
      kcDec: blockIrrigationConfig.kcDec,
    })
    .from(blockIrrigationConfig)
    .where(inArray(blockIrrigationConfig.blockId, blockIds));

  const stationIds = Array.from(
    new Set(
      irrigationConfigRows
        .map((config) => config.cimisStationId)
        .filter((value): value is number => value !== null),
    ),
  );

  const [irrigationEventRows, forecastRows, etDataRows, degreeDayRows, blockSeasonRows, taskRows, scoutingRows, recommendationHistoryRows] =
    await Promise.all([
      db
        .select({
          blockId: irrigationEvents.blockId,
          scheduledDate: irrigationEvents.scheduledDate,
          status: irrigationEvents.status,
        })
        .from(irrigationEvents)
        .where(
          orgIds.length === 0
            ? inArray(irrigationEvents.blockId, blockIds)
            : and(inArray(irrigationEvents.orgId, orgIds), inArray(irrigationEvents.blockId, blockIds)),
        )
        .orderBy(desc(irrigationEvents.scheduledDate), desc(irrigationEvents.createdAt)),
      stationIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              stationId: weatherForecasts.stationId,
              forecastDate: weatherForecasts.forecastDate,
              etoInches: weatherForecasts.etoInches,
              maxTempF: weatherForecasts.maxTempF,
              minTempF: weatherForecasts.minTempF,
              precipitationProbabilityPct: weatherForecasts.precipitationProbabilityPct,
              windSpeedMph: weatherForecasts.windSpeedMph,
            })
            .from(weatherForecasts)
            .where(and(inArray(weatherForecasts.stationId, stationIds), gte(weatherForecasts.forecastDate, today)))
            .orderBy(weatherForecasts.forecastDate),
      stationIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              stationId: etData.stationId,
              date: etData.date,
              etoInches: etData.etoInches,
            })
            .from(etData)
            .where(and(inArray(etData.stationId, stationIds), gte(etData.date, addDays(today, -21))))
            .orderBy(desc(etData.date)),
      stationIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              cimisStationId: degreeDayRecords.cimisStationId,
              pestModel: degreeDayRecords.pestModel,
              date: degreeDayRecords.date,
              cumulativeDd: degreeDayRecords.cumulativeDd,
            })
            .from(degreeDayRecords)
            .where(and(inArray(degreeDayRecords.cimisStationId, stationIds), gte(degreeDayRecords.date, `${currentYear}-01-01`)))
            .orderBy(desc(degreeDayRecords.date)),
      db
        .select({
          blockId: blockSeasons.blockId,
          seasonYear: blockSeasons.seasonYear,
          hullSplitStart: blockSeasons.hullSplitStart,
        })
        .from(blockSeasons)
        .where(and(inArray(blockSeasons.blockId, blockIds), eq(blockSeasons.seasonYear, currentYear))),
      db
        .select({
          blockId: taskBlocks.blockId,
          taskId: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          status: tasks.status,
          priority: tasks.priority,
          taskTypeName: taskTypes.nameEn,
        })
        .from(taskBlocks)
        .innerJoin(tasks, eq(taskBlocks.taskId, tasks.id))
        .leftJoin(taskTypes, eq(tasks.taskTypeId, taskTypes.id))
        .where(
          orgIds.length === 0
            ? inArray(taskBlocks.blockId, blockIds)
            : and(inArray(tasks.orgId, orgIds), inArray(taskBlocks.blockId, blockIds)),
        )
        .orderBy(asc(tasks.dueDate), desc(tasks.createdAt)),
      db
        .select({
          blockId: scoutingLogs.blockId,
          id: scoutingLogs.id,
          scoutedAt: scoutingLogs.scoutedAt,
          rating: scoutingLogs.rating,
          pestNameCustom: scoutingLogs.pestNameCustom,
          pestSpeciesName: pestSpecies.nameEn,
        })
        .from(scoutingLogs)
        .leftJoin(pestSpecies, eq(scoutingLogs.pestSpeciesId, pestSpecies.id))
        .where(
          orgIds.length === 0
            ? inArray(scoutingLogs.blockId, blockIds)
            : and(inArray(scoutingLogs.orgId, orgIds), inArray(scoutingLogs.blockId, blockIds)),
        )
        .orderBy(desc(scoutingLogs.scoutedAt)),
      db
        .select()
        .from(aiRecommendations)
        .where(
          orgIds.length === 0
            ? inArray(aiRecommendations.blockId, blockIds)
            : and(inArray(aiRecommendations.orgId, orgIds), inArray(aiRecommendations.blockId, blockIds)),
        )
        .orderBy(desc(aiRecommendations.createdAt)),
    ]);

  const candidates = buildEnvironmentalCandidates({
    blockRows,
    irrigationConfigRows,
    irrigationEventRows,
    forecastRows,
    etDataRows,
    degreeDayRows,
    blockSeasonRows,
    taskRows,
    scoutingRows,
    today,
    now: new Date(),
  });

  const blockOrgById = new Map(blockRows.map((block) => [block.id, block.orgId]));
  return syncGeneratedRecommendations({
    candidates,
    recommendationHistoryRows,
    blockOrgById,
    sourceCategories: ['seasonal'],
  });
}
