import { addDays, differenceInCalendarDays, getDaysInYear } from 'date-fns';
import { checkEngineerOverlap, checkHolidayConflict, checkWeekendConflict, validatePMPlacement } from './conflictRules';
import type { ConflictResult, Country, Holiday, PMEvent, PMStatus, PmPerYear, WeekendWork } from '../types';

// ─── TIPOS ───────────────────────────────────────────────────────────────────

export interface HistoricalPM {
  plannedDate: Date;
  actualDate: Date | null;
  status: PMStatus;
}

export interface SchedulerConfig {
  equipmentId: string;
  pmPerYear: PmPerYear;
  /** Duração da PM em dias — vem de equipment.pm_duration_days (não incluído no contrato original). */
  pmDurationDays: number;
  targetYear: number;
  preferredEngineerId: string;
  holidays: Holiday[];
  existingEventsTargetYear: PMEvent[];
  zoneId: string;
  zoneCountry: Country;
  /** Concelho/Comunidade Autónoma do hospital — feriados municipais/regionais oficiais. */
  hospitalLocality: string | null;
  /** Cidade espanhola do hospital (ex: "Vigo") — "fiestas locales" municipais, distintas
   *  da Comunidade Autónoma. PT não usa: hospitalLocality já é o concelho. */
  hospitalCity: string | null;
  previousYearHistory: HistoricalPM[];
  /** Regra 5: a geração automática nunca coloca PM em fins-de-semana, excepto quando o
   *  contrato do equipamento o permite. 'none' = só dias úteis; 'saturday' = sábados OK;
   *  'both' = sábados e domingos OK. */
  weekendWork: WeekendWork;
}

export interface ProposedPMEvent {
  equipmentId: string;
  engineerId: string;
  proposedStartDate: Date;
  proposedEndDate: Date;
  anchorSource: 'historical' | 'base_distribution';
  previousActualDate: Date | null;
  intervalDays: number;
  conflicts: ConflictResult[];
  adjustmentReason?: string;
  /** R5 — nunca reduzir o nº total de PMs: se não houver data livre, incluir na proposta marcada para revisão. */
  requiresManualReview: boolean;
}

export interface ScheduleComparison {
  equipmentId: string;
  previousYear: { date: Date; actual: Date | null }[];
  proposedYear: { date: Date; anchorSource: string; intervalDays: number }[];
  averageIntervalDays: number;
  proposedAverageIntervalDays: number;
  coherenceScore: number;
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

/** 1 PM/ano → Junho · 2 → Jan+Jul · 3 → Jan+Mai+Set · 4 → Jan+Abr+Jul+Out (meses 0-indexados). */
const BASE_DISTRIBUTION_MONTHS: Record<PmPerYear, number[]> = {
  1: [5],
  2: [0, 6],
  3: [0, 4, 8],
  4: [0, 3, 6, 9],
};

const MAX_OVERLAP_RETRIES = 3;
const WIDENED_SEARCH_WINDOW_DAYS = 14;
/** R6 — intervalo efectivo nunca inferior a 60 dias entre PMs do mesmo equipamento. */
const MIN_INTERVAL_BETWEEN_PM_DAYS = 60;

// ─── FUNÇÃO DE ANCORAGEM HISTÓRICA ───────────────────────────────────────────

// Determina a data âncora de referência para cada PM do ano anterior.
// Prioridade: data_realizada > data_planeada > null (sem histórico)
function resolveAnchorDate(historical: HistoricalPM): Date {
  return historical.actualDate ?? historical.plannedDate;
}

// ─── AJUSTES DE DATA (R1-R5) ──────────────────────────────────────────────────

function isHolidayOrWeekend(
  date: Date,
  zoneId: string,
  zoneCountry: Country,
  holidays: Holiday[],
  hospitalLocality: string | null,
  hospitalCity: string | null,
  weekendWork: WeekendWork,
): boolean {
  // Regra 5 partilhada (conflictRules.checkWeekendConflict) — verificação dia a dia.
  if (checkWeekendConflict(date, date, weekendWork).hasConflict) return true;
  return checkHolidayConflict(date, zoneId, zoneCountry, holidays, hospitalLocality, hospitalCity).hasConflict;
}

// R1 + R2 + R5: avançar até cair num dia válido (não feriado; fim-de-semana só bloqueia
// se o contrato do equipamento não permitir trabalho ao fim-de-semana).
function skipToValidWeekday(
  date: Date,
  zoneId: string,
  zoneCountry: Country,
  holidays: Holiday[],
  hospitalLocality: string | null,
  hospitalCity: string | null,
  weekendWork: WeekendWork,
): Date {
  let result = date;
  while (isHolidayOrWeekend(result, zoneId, zoneCountry, holidays, hospitalLocality, hospitalCity, weekendWork)) {
    result = addDays(result, 1);
  }
  return result;
}

interface DateResolution {
  date: Date;
  adjustmentReason?: string;
  conflicts: ConflictResult[];
  requiresManualReview: boolean;
}

function resolveValidDate(params: {
  candidate: Date;
  durationDays: number;
  engineerId: string;
  zoneId: string;
  zoneCountry: Country;
  holidays: Holiday[];
  existingEvents: PMEvent[];
  hospitalLocality: string | null;
  hospitalCity: string | null;
  weekendWork: WeekendWork;
}): DateResolution {
  const {
    candidate,
    durationDays,
    engineerId,
    zoneId,
    zoneCountry,
    holidays,
    existingEvents,
    hospitalLocality,
    hospitalCity,
    weekendWork,
  } = params;
  const reasons: string[] = [];

  let date = skipToValidWeekday(candidate, zoneId, zoneCountry, holidays, hospitalLocality, hospitalCity, weekendWork);
  if (date.getTime() !== candidate.getTime()) {
    reasons.push('ajustado: fim-de-semana ou feriado');
  }

  // R3 + R4 (primeira fase): até 3 tentativas avançando 7 dias por sobreposição de engenheiro
  for (let attempt = 0; attempt < MAX_OVERLAP_RETRIES; attempt++) {
    const overlap = checkEngineerOverlap(engineerId, date, addDays(date, durationDays), existingEvents);
    if (!overlap.hasConflict) {
      return {
        date,
        conflicts: [],
        requiresManualReview: false,
        ...(reasons.length ? { adjustmentReason: reasons.join('; ') } : {}),
      };
    }
    date = skipToValidWeekday(addDays(date, 7), zoneId, zoneCountry, holidays, hospitalLocality, hospitalCity, weekendWork);
    reasons.push('ajustado: sobreposição de engenheiro (+7 dias)');
  }

  // R4 (segunda fase): alargar pesquisa a ±14 dias em torno da data candidata original
  for (let offset = 1; offset <= WIDENED_SEARCH_WINDOW_DAYS; offset++) {
    for (const direction of [1, -1] as const) {
      const widened = skipToValidWeekday(
        addDays(candidate, offset * direction),
        zoneId,
        zoneCountry,
        holidays,
        hospitalLocality,
        hospitalCity,
        weekendWork,
      );
      const overlap = checkEngineerOverlap(engineerId, widened, addDays(widened, durationDays), existingEvents);
      if (!overlap.hasConflict) {
        return {
          date: widened,
          conflicts: [],
          requiresManualReview: false,
          adjustmentReason: [...reasons, 'ajustado: pesquisa alargada a ±14 dias'].join('; '),
        };
      }
    }
  }

  // Nunca reduzir o número total de PMs (R5) — devolve a melhor tentativa, marcada para revisão manual
  const finalConflicts = validatePMPlacement({
    engineerId,
    zoneId,
    zoneCountry,
    startDate: date,
    endDate: addDays(date, durationDays),
    existingEvents,
    holidays,
    weekendWork,
    hospitalLocality,
    hospitalCity,
  });

  return {
    date,
    conflicts: finalConflicts,
    requiresManualReview: true,
    adjustmentReason: [...reasons, 'requer revisão manual: sem data livre encontrada'].join('; '),
  };
}

// R6: garante pelo menos 60 dias entre PMs consecutivas do mesmo equipamento
function enforceMinimumSpacing(
  proposals: ProposedPMEvent[],
  ctx: {
    engineerId: string;
    durationDays: number;
    zoneId: string;
    zoneCountry: Country;
    holidays: Holiday[];
    existingEvents: PMEvent[];
    hospitalLocality: string | null;
    hospitalCity: string | null;
    weekendWork: WeekendWork;
  },
): ProposedPMEvent[] {
  const sorted = [...proposals].sort(
    (a, b) => a.proposedStartDate.getTime() - b.proposedStartDate.getTime(),
  );

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue;

    const gapDays = differenceInCalendarDays(curr.proposedStartDate, prev.proposedEndDate);
    if (gapDays >= MIN_INTERVAL_BETWEEN_PM_DAYS) continue;

    const pushedCandidate = addDays(prev.proposedEndDate, MIN_INTERVAL_BETWEEN_PM_DAYS);
    const resolution = resolveValidDate({
      candidate: pushedCandidate,
      durationDays: ctx.durationDays,
      engineerId: ctx.engineerId,
      zoneId: ctx.zoneId,
      zoneCountry: ctx.zoneCountry,
      holidays: ctx.holidays,
      existingEvents: ctx.existingEvents,
      hospitalLocality: ctx.hospitalLocality,
      hospitalCity: ctx.hospitalCity,
      weekendWork: ctx.weekendWork,
    });

    sorted[i] = {
      ...curr,
      proposedStartDate: resolution.date,
      proposedEndDate: addDays(resolution.date, ctx.durationDays),
      conflicts: resolution.conflicts,
      requiresManualReview: resolution.requiresManualReview || curr.requiresManualReview,
      adjustmentReason: [curr.adjustmentReason, 'ajustado: intervalo mínimo de 60 dias', resolution.adjustmentReason]
        .filter((reason): reason is string => Boolean(reason))
        .join('; '),
    };
  }

  return sorted;
}

function clampIntoTargetYear(date: Date, targetYear: number): Date {
  let result = date;
  while (result.getFullYear() > targetYear) {
    result = addDays(result, -getDaysInYear(new Date(result.getFullYear() - 1, 0, 1)));
  }
  while (result.getFullYear() < targetYear) {
    result = addDays(result, getDaysInYear(new Date(result.getFullYear(), 0, 1)));
  }
  return result;
}

function buildProposal(params: {
  equipmentId: string;
  engineerId: string;
  candidate: Date;
  durationDays: number;
  anchorSource: 'historical' | 'base_distribution';
  previousActualDate: Date | null;
  intervalDays: number;
  zoneId: string;
  zoneCountry: Country;
  holidays: Holiday[];
  existingEvents: PMEvent[];
  hospitalLocality: string | null;
  hospitalCity: string | null;
  weekendWork: WeekendWork;
}): ProposedPMEvent {
  const resolution = resolveValidDate({
    candidate: params.candidate,
    durationDays: params.durationDays,
    engineerId: params.engineerId,
    zoneId: params.zoneId,
    zoneCountry: params.zoneCountry,
    holidays: params.holidays,
    existingEvents: params.existingEvents,
    hospitalLocality: params.hospitalLocality,
    hospitalCity: params.hospitalCity,
    weekendWork: params.weekendWork,
  });

  return {
    equipmentId: params.equipmentId,
    engineerId: params.engineerId,
    proposedStartDate: resolution.date,
    proposedEndDate: addDays(resolution.date, params.durationDays),
    anchorSource: params.anchorSource,
    previousActualDate: params.previousActualDate,
    intervalDays: params.intervalDays,
    conflicts: resolution.conflicts,
    requiresManualReview: resolution.requiresManualReview,
    ...(resolution.adjustmentReason ? { adjustmentReason: resolution.adjustmentReason } : {}),
  };
}

// ─── ALGORITMO PRINCIPAL ─────────────────────────────────────────────────────

// R7: o resultado é sempre uma proposta — esta função é pura e nunca persiste em Supabase.
// Modo 1 (sem histórico, previousYearHistory=[]) recai automaticamente na distribuição base
// para todos os slots. Modo 2 ancora cada slot ao histórico correspondente quando existe.
export function generateAnnualSchedule(config: SchedulerConfig): ProposedPMEvent[] {
  const {
    equipmentId,
    pmPerYear,
    pmDurationDays,
    targetYear,
    preferredEngineerId,
    holidays,
    existingEventsTargetYear,
    zoneId,
    zoneCountry,
    hospitalLocality,
    hospitalCity,
    previousYearHistory,
    weekendWork,
  } = config;

  const baseIntervalDays = Math.round(365 / pmPerYear);
  const fallbackMonths = BASE_DISTRIBUTION_MONTHS[pmPerYear];

  const draftProposals = Array.from({ length: pmPerYear }, (_, slotIndex) => {
    const historical = previousYearHistory[slotIndex];

    if (historical) {
      const anchorDate = resolveAnchorDate(historical);
      const rawProposed = addDays(anchorDate, baseIntervalDays);
      const candidate = clampIntoTargetYear(rawProposed, targetYear);
      return buildProposal({
        equipmentId,
        engineerId: preferredEngineerId,
        candidate,
        durationDays: pmDurationDays,
        anchorSource: 'historical',
        previousActualDate: historical.actualDate,
        intervalDays: baseIntervalDays,
        zoneId,
        zoneCountry,
        holidays,
        hospitalLocality,
        hospitalCity,
        existingEvents: existingEventsTargetYear,
        weekendWork,
      });
    }

    const fallbackMonth = fallbackMonths[slotIndex] ?? fallbackMonths[0] ?? 5;
    const candidate = new Date(targetYear, fallbackMonth, 15);
    return buildProposal({
      equipmentId,
      engineerId: preferredEngineerId,
      candidate,
      durationDays: pmDurationDays,
      anchorSource: 'base_distribution',
      previousActualDate: null,
      intervalDays: baseIntervalDays,
      zoneId,
      zoneCountry,
      holidays,
      hospitalLocality,
      hospitalCity,
      existingEvents: existingEventsTargetYear,
      weekendWork,
    });
  });

  return enforceMinimumSpacing(draftProposals, {
    engineerId: preferredEngineerId,
    durationDays: pmDurationDays,
    zoneId,
    zoneCountry,
    holidays,
    hospitalLocality,
    hospitalCity,
    existingEvents: existingEventsTargetYear,
    weekendWork,
  });
}

// ─── FUNÇÃO DE COMPARAÇÃO (para mostrar na UI) ────────────────────────────────

function averageGapDays(dates: Date[]): number {
  if (dates.length < 2) return 0;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  let totalGap = 0;
  let count = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (!a || !b) continue;
    totalGap += differenceInCalendarDays(b, a);
    count++;
  }
  return count === 0 ? 0 : Math.round(totalGap / count);
}

function computeCoherenceScore(dates: Date[], idealIntervalDays: number): number {
  if (dates.length < 2 || idealIntervalDays <= 0) return 100;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const deviations: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (!a || !b) continue;
    const gap = differenceInCalendarDays(b, a);
    deviations.push(Math.abs(gap - idealIntervalDays) / idealIntervalDays);
  }
  if (deviations.length === 0) return 100;
  const avgDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;
  return Math.max(0, Math.round(100 - avgDeviation * 100));
}

// Gera um diff visual entre o plano do ano anterior e o novo plano proposto
// Usado no modal de confirmação antes de o utilizador aprovar
export function compareSchedules(
  previousHistory: HistoricalPM[],
  proposed: ProposedPMEvent[],
): ScheduleComparison {
  const firstProposal = proposed[0];

  const previousYear = previousHistory.map((h) => ({
    date: resolveAnchorDate(h),
    actual: h.actualDate,
  }));
  const proposedYear = proposed.map((p) => ({
    date: p.proposedStartDate,
    anchorSource: p.anchorSource,
    intervalDays: p.intervalDays,
  }));

  const averageIntervalDays = averageGapDays(previousYear.map((p) => p.date));
  const proposedAverageIntervalDays = averageGapDays(proposedYear.map((p) => p.date));
  const idealInterval = firstProposal?.intervalDays ?? averageIntervalDays;

  return {
    equipmentId: firstProposal?.equipmentId ?? '',
    previousYear,
    proposedYear,
    averageIntervalDays,
    proposedAverageIntervalDays,
    coherenceScore: computeCoherenceScore(
      proposedYear.map((p) => p.date),
      idealInterval,
    ),
  };
}
