import {
  addDays,
  areIntervalsOverlapping,
  eachDayOfInterval,
  endOfYear,
  format,
  isSameDay,
  isWeekend,
  startOfYear,
} from 'date-fns';
import type { Interval } from 'date-fns';
import type { ConflictResult, Country, Equipment, EngineerWithZones, Holiday, PMEvent, WeekendWork, Zone } from '../types';
import { toDisplayDate } from './dateFormat';
import { expandZoneSelection } from './zoneTree';

const ENGINEER_SUGGESTION_SEARCH_DAYS = 60;
/** Acima deste rácio procura-vs-capacidade a zona é assinalada como sobrecarregada (alerta, não bloqueio). */
export const ZONE_LOAD_WARNING_THRESHOLD = 0.85;
/** Capacidade assumida: 1 PM-dia por engenheiro por dia útil. */
const ASSUMED_PM_DAYS_PER_ENGINEER_PER_WORKDAY = 1;

const NO_CONFLICT: ConflictResult = { hasConflict: false };

function toInterval(startDate: Date, endDate: Date): Interval {
  return { start: startDate, end: endDate };
}

function eventIsActive(event: PMEvent): boolean {
  return event.status !== 'cancelled';
}

// Regra 1: Engenheiro não pode ter dois eventos sobrepostos
export function checkEngineerOverlap(
  engineerId: string | null,
  startDate: Date,
  endDate: Date,
  existingEvents: PMEvent[],
  excludeEventId?: string,
): ConflictResult {
  // Candidato sem engenheiro atribuído (null ou '') nunca colide com ninguém.
  if (!engineerId) return NO_CONFLICT;

  const candidateInterval = toInterval(startDate, endDate);

  const overlapping = existingEvents.find((event) => {
    // Eventos existentes sem engenheiro não participam na regra — sem este guard,
    // duas PMs por atribuir "colidiriam" entre si (bug do engenheiro fantasma).
    if (!event.engineer_id) return false;
    if (event.engineer_id !== engineerId) return false;
    if (excludeEventId && event.id === excludeEventId) return false;
    if (!eventIsActive(event)) return false;

    return areIntervalsOverlapping(
      candidateInterval,
      toInterval(new Date(event.start_date), new Date(event.end_date)),
      { inclusive: true },
    );
  });

  if (!overlapping) return NO_CONFLICT;

  const durationDays = Math.round(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const suggestedDate = findNextFreeDateForEngineer(
    engineerId,
    addDays(new Date(overlapping.end_date), 1),
    durationDays,
    existingEvents,
    excludeEventId,
  );

  return {
    hasConflict: true,
    type: 'engineer_overlap',
    message: `O engenheiro já tem uma PM agendada entre ${toDisplayDate(overlapping.start_date)} e ${toDisplayDate(overlapping.end_date)}.`,
    ...(suggestedDate ? { suggestedDate } : {}),
  };
}

function findNextFreeDateForEngineer(
  engineerId: string,
  searchFrom: Date,
  durationDays: number,
  existingEvents: PMEvent[],
  excludeEventId?: string,
): Date | undefined {
  for (let offset = 0; offset < ENGINEER_SUGGESTION_SEARCH_DAYS; offset++) {
    const candidateStart = addDays(searchFrom, offset);
    const candidateEnd = addDays(candidateStart, durationDays);
    const result = checkEngineerOverlap(
      engineerId,
      candidateStart,
      candidateEnd,
      existingEvents,
      excludeEventId,
    );
    if (!result.hasConflict) return candidateStart;
  }
  return undefined;
}

// Regra 2: Nenhuma PM em feriado
// Aplica feriados nacionais (zone_id e locality null, mesmo country) + fecho operacional
// da zona PMPlan (mesmo zone_id) + feriado municipal/regional oficial do hospital (mesma
// locality — ex: feriado de Braga só bloqueia equipamento cujo hospital é em Braga, ou
// "fiesta local" de Vigo via hospitalCity — distinto da Comunidade Autónoma).
export function checkHolidayConflict(
  date: Date,
  zoneId: string,
  zoneCountry: Country,
  holidays: Holiday[],
  hospitalLocality: string | null = null,
  hospitalCity: string | null = null,
): ConflictResult {
  const applicableHolidays = holidays.filter(
    (holiday) =>
      holiday.zone_id === zoneId ||
      (holiday.locality !== null && holiday.locality === hospitalLocality) ||
      (holiday.locality !== null && holiday.locality === hospitalCity) ||
      (holiday.zone_id === null && holiday.locality === null && holiday.country === zoneCountry),
  );

  const matched = applicableHolidays.find((holiday) => isSameDay(new Date(holiday.date), date));

  if (!matched) return NO_CONFLICT;

  let suggestedDate = addDays(date, 1);
  while (
    isWeekend(suggestedDate) ||
    applicableHolidays.some((holiday) => isSameDay(new Date(holiday.date), suggestedDate))
  ) {
    suggestedDate = addDays(suggestedDate, 1);
  }

  return {
    hasConflict: true,
    type: 'holiday_block',
    message: `${matched.name} (feriado) — não é possível agendar PM neste dia.`,
    suggestedDate,
  };
}

// Regra 5: fim-de-semana só com contrato que o permita. 'none' (ou ausente — fallback
// defensivo para linhas anteriores à migração weekend_work) bloqueia sábado e domingo;
// 'saturday' bloqueia só domingo; 'both' não bloqueia nada. Partilhada entre o scheduler
// automático (lib/autoScheduler) e a criação/edição manual (validatePMPlacement) — a
// lógica vive APENAS aqui.
export function checkWeekendConflict(
  startDate: Date,
  endDate: Date,
  weekendWork: WeekendWork | undefined | null,
): ConflictResult {
  const effective = weekendWork ?? 'none';
  if (effective === 'both') return NO_CONFLICT;

  const isBlockedDay = (day: Date): boolean => {
    if (!isWeekend(day)) return false;
    if (effective === 'saturday' && day.getDay() === 6) return false;
    return true;
  };

  const blocked = eachDayOfInterval({ start: startDate, end: endDate }).find(isBlockedDay);
  if (!blocked) return NO_CONFLICT;

  // Próximo dia permitido pela Regra 5 (os restantes bloqueios — feriados, engenheiro —
  // são validados pelas respectivas regras quando a sugestão for aplicada).
  let suggestedDate = addDays(blocked, 1);
  while (isBlockedDay(suggestedDate)) {
    suggestedDate = addDays(suggestedDate, 1);
  }

  const dayName = blocked.getDay() === 6 ? 'sábado' : 'domingo';
  return {
    hasConflict: true,
    type: 'weekend_block',
    message: `${format(blocked, 'dd/MM/yyyy')} é ${dayName} — o contrato do equipamento não permite PMs neste dia.`,
    suggestedDate,
  };
}

export interface LoadRatio {
  capacityDays: number;
  demandDays: number;
  ratio: number;
}

function workDaysInRange(start: Date, end: Date): number {
  return eachDayOfInterval({ start, end }).filter((day) => !isWeekend(day)).length;
}

// Soma os dias-PM (início e fim inclusive) dos eventos activos que cumprem `matches` e
// começam dentro de [rangeStart, rangeEnd] — partilhado entre a carga por zona e a carga
// por engenheiro, para as duas leituras ficarem sempre coerentes entre si.
function sumActiveEventDays(
  events: PMEvent[],
  matches: (event: PMEvent) => boolean,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  return events
    .filter((event) => eventIsActive(event) && matches(event))
    .filter((event) => {
      const start = new Date(event.start_date);
      return start >= rangeStart && start <= rangeEnd;
    })
    .reduce((total, event) => {
      const days =
        Math.round(
          (new Date(event.end_date).getTime() - new Date(event.start_date).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;
      return total + days;
    }, 0);
}

// Partilhado pelo motor de conflitos (gate) e pelo LoadMap da sidebar (visualização contínua)
// — mantém as duas leituras de carga sempre coerentes entre si. Cálculo anual (não
// mensal — secção "todos os cálculos a nível anual"). Zona-mãe agrega automaticamente a
// carga das zonas filhas (mesma regra do filtro do calendário, ver lib/zoneTree) — uma
// zona de agrupamento como "NorthWest" reflecte sempre a soma das filhas, nunca fica a
// 0% só por não ter nada atribuído directamente a ela.
// `events`/`equipment` vêm completos (não pré-filtrados) — a filtragem por zona
// (incluindo descendentes) é feita aqui dentro.
export function computeZoneLoadRatio(
  zoneId: string,
  year: number,
  events: PMEvent[],
  engineers: EngineerWithZones[],
  equipment: Equipment[],
  zones: Zone[],
): LoadRatio {
  const zoneScope = expandZoneSelection([zoneId], zones);
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(yearStart);

  // Conta o engenheiro se cobrir a zona por QUALQUER via — zona primária OU secundária
  // (engineer_zones). Um engenheiro atribuído só como secundário (ex: cobertura de
  // apoio a uma zona que não é a sua principal) tem de contar na capacidade dessa zona,
  // senão esta fica sempre a 0% mesmo havendo procura real (capacityDays=0 força ratio=0).
  const engineersInZone = engineers.filter(
    (engineer) =>
      (!!engineer.primary_zone_id && zoneScope.has(engineer.primary_zone_id)) ||
      engineer.zones.some((zone) => zoneScope.has(zone.zone_id)),
  );
  const capacityDays =
    engineersInZone.length * workDaysInRange(yearStart, yearEnd) * ASSUMED_PM_DAYS_PER_ENGINEER_PER_WORKDAY;

  const demandDays = sumActiveEventDays(
    events,
    (event) => {
      const eq = equipment.find((item) => item.id === event.equipment_id);
      return !!eq && zoneScope.has(eq.zone_id);
    },
    yearStart,
    yearEnd,
  );

  return { capacityDays, demandDays, ratio: capacityDays === 0 ? 0 : demandDays / capacityDays };
}

// Carga por engenheiro — mesma filosofia da carga por zona (cálculo anual), mas sem
// agregação hierárquica (um engenheiro não tem "filhos"): capacidade = dias úteis do ano
// × 1 dia-PM/dia útil; procura = dias-PM das PMs activas atribuídas a este engenheiro,
// a começar nesse ano.
export function computeEngineerLoadRatio(engineerId: string, year: number, events: PMEvent[]): LoadRatio {
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(yearStart);

  const capacityDays = workDaysInRange(yearStart, yearEnd) * ASSUMED_PM_DAYS_PER_ENGINEER_PER_WORKDAY;
  const demandDays = sumActiveEventDays(events, (event) => event.engineer_id === engineerId, yearStart, yearEnd);

  return { capacityDays, demandDays, ratio: capacityDays === 0 ? 0 : demandDays / capacityDays };
}

// Regra 3: Carga de zona (alerta, não bloqueio)
export function checkZoneLoad(
  zoneId: string,
  year: number,
  events: PMEvent[],
  engineers: EngineerWithZones[],
  equipment: Equipment[],
  zones: Zone[],
): ConflictResult {
  const { capacityDays, demandDays, ratio } = computeZoneLoadRatio(zoneId, year, events, engineers, equipment, zones);

  if (capacityDays === 0 || ratio < ZONE_LOAD_WARNING_THRESHOLD) {
    return NO_CONFLICT;
  }

  const loadPercent = Math.round(ratio * 100);
  return {
    hasConflict: true,
    type: 'zone_overload',
    message: `Carga da zona em ${year} a ${loadPercent}% da capacidade estimada (${demandDays}/${capacityDays} dias-PM).`,
  };
}

// Função principal que agrega todas as regras de bloqueio (feriados em qualquer dia do
// intervalo + fim-de-semana não contratualizado + sobreposição de engenheiro). A carga
// de zona não bloqueia — ver checkZoneLoad.
export function validatePMPlacement(params: {
  engineerId: string | null;
  zoneId: string;
  zoneCountry: Country;
  startDate: Date;
  endDate: Date;
  existingEvents: PMEvent[];
  holidays: Holiday[];
  weekendWork: WeekendWork | undefined | null;
  excludeEventId?: string;
  hospitalLocality?: string | null;
  hospitalCity?: string | null;
}): ConflictResult[] {
  const {
    engineerId,
    zoneId,
    zoneCountry,
    startDate,
    endDate,
    existingEvents,
    holidays,
    weekendWork,
    excludeEventId,
    hospitalLocality = null,
    hospitalCity = null,
  } = params;

  const results: ConflictResult[] = [];

  const holidayConflicts = eachDayOfInterval({ start: startDate, end: endDate })
    .map((day) => checkHolidayConflict(day, zoneId, zoneCountry, holidays, hospitalLocality, hospitalCity))
    .filter((result) => result.hasConflict);
  results.push(...holidayConflicts);

  const weekendResult = checkWeekendConflict(startDate, endDate, weekendWork);
  if (weekendResult.hasConflict) results.push(weekendResult);

  const overlapResult = checkEngineerOverlap(
    engineerId,
    startDate,
    endDate,
    existingEvents,
    excludeEventId,
  );
  if (overlapResult.hasConflict) results.push(overlapResult);

  return results;
}
