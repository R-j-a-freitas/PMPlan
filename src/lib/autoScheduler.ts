import { addDays, differenceInCalendarDays, format } from 'date-fns';
import {
  checkCitySameDayConflict,
  checkEngineerOverlap,
  checkHolidayConflict,
  checkHospitalSameWeekConflict,
  checkWeekendConflict,
  validatePMPlacement,
} from './conflictRules';
import type { EquipmentSiteIndex } from './conflictRules';
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
  /** Primeira PM já marcada (não cancelada) no ano alvo em qualquer equipamento do MESMO
   *  hospital — quando presente, tem prioridade sobre o histórico do ano anterior: a 1.ª
   *  proposta cai nesta data e as seguintes espaçam-se em semanas inteiras (13 semanas
   *  ≈ 3 meses para 4 PMs/ano), preservando o DIA DA SEMANA da âncora (quinta gera
   *  quintas). null/ausente → ancoragem histórica ou distribuição base. */
  currentYearAnchor?: Date | null;
  /** Regra 7: hospital (cliente) do equipamento — no mesmo hospital não pode haver PM
   *  em mais de 1 equipamento na mesma semana ISO (não só no mesmo dia). */
  hospitalId: string;
  /** Regra 8: chave de cidade (ver conflictRules.cityKeyOfEquipment) — na mesma cidade
   *  só pode haver 1 PM por dia (Lisboa + Porto em simultâneo é permitido). */
  cityKey: string | null;
  /** Índice equipamento→{hospital, cidade} de TODOS os equipamentos — classifica os
   *  eventos existentes (reais e virtuais do lote) para as Regras 7/8. */
  siteIndex: EquipmentSiteIndex;
}

export interface ProposedPMEvent {
  equipmentId: string;
  engineerId: string;
  proposedStartDate: Date;
  proposedEndDate: Date;
  anchorSource: 'historical' | 'base_distribution' | 'existing_current_year';
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

/** Pesquisa de alternativas em saltos de SEMANAS inteiras (preserva o dia da semana). */
const MAX_WEEK_SEARCH = 8;
/** Último recurso: deslocação dia-a-dia — só para equipamentos sem fim-de-semana contratado. */
const MAX_DAY_FALLBACK = 13;
/** R6 — intervalo efectivo nunca inferior a 60 dias entre PMs do mesmo equipamento. */
const MIN_INTERVAL_BETWEEN_PM_DAYS = 60;

// ─── FUNÇÃO DE ANCORAGEM HISTÓRICA ───────────────────────────────────────────

// Determina a data âncora de referência para cada PM do ano anterior.
// Prioridade: data_realizada > data_planeada > null (sem histórico)
function resolveAnchorDate(historical: HistoricalPM): Date {
  return historical.actualDate ?? historical.plannedDate;
}

// ─── AJUSTES DE DATA (R1-R8) ──────────────────────────────────────────────────

/** Contexto partilhado por toda a resolução de datas de UM equipamento. */
interface PlacementContext {
  equipmentId: string;
  engineerId: string;
  durationDays: number;
  zoneId: string;
  zoneCountry: Country;
  holidays: Holiday[];
  existingEvents: PMEvent[];
  hospitalLocality: string | null;
  hospitalCity: string | null;
  weekendWork: WeekendWork;
  hospitalId: string;
  cityKey: string | null;
  siteIndex: EquipmentSiteIndex;
}

function isBlockedDay(date: Date, ctx: PlacementContext): boolean {
  // Regra 5 partilhada (conflictRules.checkWeekendConflict) — verificação dia a dia.
  if (checkWeekendConflict(date, date, ctx.weekendWork).hasConflict) return true;
  return checkHolidayConflict(date, ctx.zoneId, ctx.zoneCountry, ctx.holidays, ctx.hospitalLocality, ctx.hospitalCity)
    .hasConflict;
}

// R2 + R5 no intervalo COMPLETO: uma PM de N dias ocupa [start, start+N-1] e NENHUM
// desses dias pode ser feriado nem fim-de-semana não contratado. (O bug anterior só
// validava o dia de início — uma PM de 3 dias a começar à sexta invadia sábado+domingo.)
function isSpanClear(start: Date, ctx: PlacementContext): boolean {
  for (let day = 0; day < ctx.durationDays; day++) {
    if (isBlockedDay(addDays(start, day), ctx)) return false;
  }
  return true;
}

// R1 + R7 + R8: engenheiro ocupado, outro equipamento do mesmo hospital em PM na mesma
// semana, ou outra PM na mesma cidade no mesmo dia — qualquer um invalida o candidato.
function hasPlacementConflict(start: Date, ctx: PlacementContext): boolean {
  const end = addDays(start, ctx.durationDays - 1);
  if (checkEngineerOverlap(ctx.engineerId, start, end, ctx.existingEvents).hasConflict) return true;
  const siteParams = {
    equipmentId: ctx.equipmentId,
    hospitalId: ctx.hospitalId,
    startDate: start,
    endDate: end,
    existingEvents: ctx.existingEvents,
    siteIndex: ctx.siteIndex,
  };
  if (checkHospitalSameWeekConflict(siteParams).hasConflict) return true;
  return checkCitySameDayConflict({ ...siteParams, cityKey: ctx.cityKey }).hasConflict;
}

// Regra 4 (fim-de-semana contratado): os dias de fim-de-semana do contrato ficam SEMPRE
// dentro da PM — o intervalo termina no último dia contratado (sábado para 'saturday',
// domingo para 'both') e estende-se para trás pela duração. Ex: contrato 'both' com
// 3 dias → sexta+sábado+domingo; com 2 dias → sábado+domingo.
function snapToContractedWeekend(candidate: Date, ctx: PlacementContext): Date {
  const targetEndDow = ctx.weekendWork === 'saturday' ? 6 : 0; // 6 = sábado, 0 = domingo
  const idealEnd = addDays(candidate, ctx.durationDays - 1);
  let delta = (targetEndDow - idealEnd.getDay() + 7) % 7;
  if (delta > 3) delta -= 7; // ocorrência mais PRÓXIMA do dia-alvo (recua até 3 dias)
  return addDays(idealEnd, delta - (ctx.durationDays - 1));
}

interface DateResolution {
  date: Date;
  adjustmentReason?: string;
  conflicts: ConflictResult[];
  requiresManualReview: boolean;
}

// Procura a data válida mais próxima do candidato, por esta ordem:
//  (1) saltos de SEMANAS inteiras (0, +1, -1, … ±8) — preservam o dia da semana herdado
//      do ano anterior (Regra 4) e a ancoragem ao fim-de-semana contratado;
//  (2) só para equipamentos SEM fim-de-semana contratado: deslocação dia-a-dia (±1..13)
//      — altera o dia da semana, por isso é último recurso e fica no adjustmentReason;
//  (3) melhor esforço marcado para revisão manual — nunca reduzir o nº total de PMs.
// `notBefore`: limite inferior usado pelo intervalo mínimo de 60 dias, para a pesquisa
// não recuar para trás da PM anterior do mesmo equipamento.
function resolveValidDate(candidate: Date, ctx: PlacementContext, notBefore?: Date): DateResolution {
  const anchoredToWeekend = ctx.weekendWork !== 'none';
  const aligned = anchoredToWeekend ? snapToContractedWeekend(candidate, ctx) : candidate;
  const baseReasons: string[] = [];
  if (aligned.getTime() !== candidate.getTime()) {
    baseReasons.push('ajustado: PM ancorada ao fim-de-semana contratado');
  }
  const targetYear = aligned.getFullYear();

  const isAcceptable = (start: Date): boolean => {
    if (start.getFullYear() !== targetYear) return false; // nunca sair do ano alvo
    if (notBefore && start.getTime() < notBefore.getTime()) return false;
    return isSpanClear(start, ctx) && !hasPlacementConflict(start, ctx);
  };

  for (let week = 0; week <= MAX_WEEK_SEARCH; week++) {
    for (const direction of week === 0 ? ([1] as const) : ([1, -1] as const)) {
      const start = addDays(aligned, week * 7 * direction);
      if (!isAcceptable(start)) continue;
      const reasons =
        week === 0 ? baseReasons : [...baseReasons, `ajustado: ${week} semana(s) para resolver conflito`];
      return {
        date: start,
        conflicts: [],
        requiresManualReview: false,
        ...(reasons.length ? { adjustmentReason: reasons.join('; ') } : {}),
      };
    }
  }

  if (!anchoredToWeekend) {
    for (let offset = 1; offset <= MAX_DAY_FALLBACK; offset++) {
      for (const direction of [1, -1] as const) {
        const start = addDays(aligned, offset * direction);
        if (!isAcceptable(start)) continue;
        return {
          date: start,
          conflicts: [],
          requiresManualReview: false,
          adjustmentReason: [
            ...baseReasons,
            'ajustado: dia da semana alterado (sem alternativa válida na mesma semana)',
          ].join('; '),
        };
      }
    }
  }

  // Nunca reduzir o número total de PMs — devolve a melhor tentativa, marcada para revisão manual
  const finalConflicts = validatePMPlacement({
    engineerId: ctx.engineerId,
    zoneId: ctx.zoneId,
    zoneCountry: ctx.zoneCountry,
    startDate: aligned,
    endDate: addDays(aligned, ctx.durationDays - 1),
    existingEvents: ctx.existingEvents,
    holidays: ctx.holidays,
    weekendWork: ctx.weekendWork,
    hospitalLocality: ctx.hospitalLocality,
    hospitalCity: ctx.hospitalCity,
    equipmentId: ctx.equipmentId,
    hospitalId: ctx.hospitalId,
    cityKey: ctx.cityKey,
    siteIndex: ctx.siteIndex,
  });

  return {
    date: aligned,
    conflicts: finalConflicts,
    requiresManualReview: true,
    adjustmentReason: [...baseReasons, 'requer revisão manual: sem data livre encontrada'].join('; '),
  };
}

// R6: garante pelo menos 60 dias entre PMs consecutivas do mesmo equipamento. O empurrão
// avança em SEMANAS inteiras a partir da data já proposta — preserva o dia da semana e a
// ancoragem ao fim-de-semana contratado; `notBefore` impede a pesquisa de alternativas de
// recuar de novo para dentro do intervalo mínimo.
function enforceMinimumSpacing(proposals: ProposedPMEvent[], ctx: PlacementContext): ProposedPMEvent[] {
  const sorted = [...proposals].sort(
    (a, b) => a.proposedStartDate.getTime() - b.proposedStartDate.getTime(),
  );

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue;

    const gapDays = differenceInCalendarDays(curr.proposedStartDate, prev.proposedEndDate);
    if (gapDays >= MIN_INTERVAL_BETWEEN_PM_DAYS) continue;

    const notBefore = addDays(prev.proposedEndDate, MIN_INTERVAL_BETWEEN_PM_DAYS);
    let pushed = curr.proposedStartDate;
    while (differenceInCalendarDays(pushed, prev.proposedEndDate) < MIN_INTERVAL_BETWEEN_PM_DAYS) {
      pushed = addDays(pushed, 7);
    }
    const resolution = resolveValidDate(pushed, ctx, notBefore);

    sorted[i] = {
      ...curr,
      proposedStartDate: resolution.date,
      proposedEndDate: addDays(resolution.date, ctx.durationDays - 1),
      conflicts: resolution.conflicts,
      requiresManualReview: resolution.requiresManualReview || curr.requiresManualReview,
      adjustmentReason: [curr.adjustmentReason, 'ajustado: intervalo mínimo de 60 dias', resolution.adjustmentReason]
        .filter((reason): reason is string => Boolean(reason))
        .join('; '),
    };
  }

  return sorted;
}

// Recoloca uma data dentro do ano alvo em passos de 52 semanas (364 dias), não de
// 365/366 — múltiplos de 7 dias preservam o dia da semana da âncora, a propriedade a
// manter tanto na ancoragem ao próprio ano (currentYearAnchor) como na ancoragem à PM
// real do ano anterior (uma quinta-feira em 2026 → quinta-feira em 2027).
function clampIntoTargetYearPreservingWeekday(date: Date, targetYear: number): Date {
  let result = date;
  while (result.getFullYear() > targetYear) {
    result = addDays(result, -364);
  }
  while (result.getFullYear() < targetYear) {
    result = addDays(result, 364);
  }
  return result;
}

function buildProposal(params: {
  candidate: Date;
  anchorSource: 'historical' | 'base_distribution' | 'existing_current_year';
  previousActualDate: Date | null;
  intervalDays: number;
  ctx: PlacementContext;
}): ProposedPMEvent {
  const { ctx } = params;
  const resolution = resolveValidDate(params.candidate, ctx);

  return {
    equipmentId: ctx.equipmentId,
    engineerId: ctx.engineerId,
    proposedStartDate: resolution.date,
    // end_date é o último dia INCLUSIVE da PM (convenção partilhada com a criação manual —
    // PMEventModal usa pm_duration_days - 1 — e com o render do calendário, que soma +1
    // porque o `end` do FullCalendar é exclusivo). Uma PM de N dias ocupa [start, start+N-1].
    proposedEndDate: addDays(resolution.date, ctx.durationDays - 1),
    anchorSource: params.anchorSource,
    previousActualDate: params.previousActualDate,
    intervalDays: params.intervalDays,
    conflicts: resolution.conflicts,
    requiresManualReview: resolution.requiresManualReview,
    ...(resolution.adjustmentReason ? { adjustmentReason: resolution.adjustmentReason } : {}),
  };
}

// Converte uma proposta num PMEvent mínimo compatível com o motor de conflitos — usado
// para as propostas já geradas contarem como "eventos existentes" nas seguintes (tanto
// entre slots do mesmo equipamento, aqui, como entre equipamentos, no useBulkAutoScheduler).
export function proposalToVirtualEvent(p: ProposedPMEvent): PMEvent {
  return {
    id: `__virtual__${p.equipmentId}_${p.proposedStartDate.toISOString()}`,
    equipment_id: p.equipmentId,
    engineer_id: p.engineerId || null,
    start_date: format(p.proposedStartDate, 'yyyy-MM-dd'),
    end_date: format(p.proposedEndDate, 'yyyy-MM-dd'),
    calendar_label: null,
    client_description: null,
    actual_start_date: null,
    actual_end_date: null,
    completed_at: null,
    status: 'planned',
    outlook_event_id: null,
    notes: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ─── ALGORITMO PRINCIPAL ─────────────────────────────────────────────────────

// R7: o resultado é sempre uma proposta — esta função é pura e nunca persiste em Supabase.
// Prioridade de ancoragem: (0) PM já marcada no ano alvo no mesmo hospital
// (currentYearAnchor) — o plano alinha-se a ela em passos de 12÷pmPerYear meses;
// (1) histórico do ano anterior, slot a slot; (2) distribuição base quando não há nada.
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
    currentYearAnchor = null,
    hospitalId,
    cityKey,
    siteIndex,
  } = config;

  const baseIntervalDays = Math.round(365 / pmPerYear);
  // Intervalo em SEMANAS inteiras entre PMs ancoradas ao ano alvo (13 semanas ≈ 3 meses
  // para 4 PMs/ano; 26 para 2; 52 para 1; 17 para 3) — somar múltiplos de 7 dias garante
  // que todas as propostas caem no MESMO dia da semana da PM âncora.
  const weeksBetweenPMs = Math.round(365 / pmPerYear / 7);
  const fallbackMonths = BASE_DISTRIBUTION_MONTHS[pmPerYear];

  const baseCtx: PlacementContext = {
    equipmentId,
    engineerId: preferredEngineerId,
    durationDays: pmDurationDays,
    zoneId,
    zoneCountry,
    holidays,
    existingEvents: existingEventsTargetYear,
    hospitalLocality,
    hospitalCity,
    weekendWork,
    hospitalId,
    cityKey,
    siteIndex,
  };

  const draftProposals: ProposedPMEvent[] = [];
  // Pool incremental: cada slot vê as propostas dos slots anteriores como eventos
  // virtuais — sem isto, o slot N podia colidir (engenheiro/hospital/cidade) com o
  // slot N-1 do próprio equipamento sem ninguém dar por nada.
  let pool = existingEventsTargetYear;

  for (let slotIndex = 0; slotIndex < pmPerYear; slotIndex++) {
    const ctx: PlacementContext = { ...baseCtx, existingEvents: pool };
    const historical = previousYearHistory[slotIndex];
    let proposal: ProposedPMEvent;

    // Ancoragem ao próprio ano: o que se preserva é o DIA DA SEMANA da PM marcada, não o
    // dia do mês (uma quinta-feira acordada com o hospital gera quintas-feiras: 22/01 →
    // 23/04 → 23/07 → 22/10) — daí passos de semanas inteiras, nunca de meses.
    if (currentYearAnchor) {
      const candidate = clampIntoTargetYearPreservingWeekday(
        addDays(currentYearAnchor, slotIndex * weeksBetweenPMs * 7),
        targetYear,
      );
      proposal = buildProposal({
        candidate,
        anchorSource: 'existing_current_year',
        previousActualDate: null,
        intervalDays: baseIntervalDays,
        ctx,
      });
    } else if (historical) {
      const anchorDate = resolveAnchorDate(historical);
      // Preserva o DIA DA SEMANA da PM real de {targetYear-1}: a data de 2026 é deslocada
      // ~1 ano (passos de 52 semanas) para cair no mesmo dia da semana em 2027 (uma
      // quinta-feira em 2026 → quinta-feira em 2027, à mesma altura do ano). enforceMinimumSpacing
      // e as regras de conflito/feriado ajustam depois se necessário.
      const candidate = clampIntoTargetYearPreservingWeekday(anchorDate, targetYear);
      proposal = buildProposal({
        candidate,
        anchorSource: 'historical',
        previousActualDate: historical.actualDate,
        intervalDays: baseIntervalDays,
        ctx,
      });
    } else {
      const fallbackMonth = fallbackMonths[slotIndex] ?? fallbackMonths[0] ?? 5;
      proposal = buildProposal({
        candidate: new Date(targetYear, fallbackMonth, 15),
        anchorSource: 'base_distribution',
        previousActualDate: null,
        intervalDays: baseIntervalDays,
        ctx,
      });
    }

    draftProposals.push(proposal);
    pool = [...pool, proposalToVirtualEvent(proposal)];
  }

  // O espaçamento mínimo re-resolve datas — usa o pool SEM os virtuais deste equipamento
  // (senão a proposta movida colidiria com a sua própria posição antiga; o intervalo de
  // 60 dias já garante que os slots do mesmo equipamento não se sobrepõem entre si).
  return enforceMinimumSpacing(draftProposals, baseCtx);
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
