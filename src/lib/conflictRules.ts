import {
  addDays,
  areIntervalsOverlapping,
  eachDayOfInterval,
  endOfYear,
  format,
  getISOWeek,
  getISOWeekYear,
  isSameDay,
  isWeekend,
  startOfYear,
} from 'date-fns';
import type { Interval } from 'date-fns';
import type { ConflictResult, Country, Equipment, EquipmentFull, EngineerWithZones, Holiday, PMEvent, WeekendWork, Zone } from '../types';
import { addDaysToIsoDate, toDisplayDate } from './dateFormat';

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
    messageKey: 'conflict.engineerOverlap',
    messageParams: {
      start: toDisplayDate(overlapping.start_date),
      end: toDisplayDate(overlapping.end_date),
    },
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

/** Regra 1 aplicada a uma reatribuição em bloco (mudar o engenheiro de várias PMs de uma
 *  vez): devolve a primeira PM do conjunto que ficaria sobreposta a outra PM do mesmo
 *  engenheiro, ou null se o bloco todo couber.
 *
 *  O engenheiro novo é aplicado ao pool ANTES de verificar: as PMs que o engenheiro
 *  antigo deixa de ter não bloqueiam a mudança, e duas PMs do próprio bloco que se
 *  sobreponham entre si contam como conflito. Só esta regra é reavaliada — as outras
 *  (feriado, fim-de-semana, hospital/cidade, quota) dependem das datas e do equipamento,
 *  que aqui não mudam. */
export function findEngineerOverlapInReassign(
  engineerId: string,
  targetIds: string[],
  events: PMEvent[],
): { event: PMEvent; conflict: ConflictResult } | null {
  if (!engineerId || targetIds.length === 0) return null;
  const targets = new Set(targetIds);
  const pool = events.map((event) =>
    targets.has(event.id) ? { ...event, engineer_id: engineerId } : event,
  );

  for (const event of pool) {
    if (!targets.has(event.id) || !eventIsActive(event)) continue;
    const conflict = checkEngineerOverlap(
      engineerId,
      new Date(event.start_date),
      new Date(event.end_date),
      pool,
      event.id,
    );
    if (conflict.hasConflict) return { event, conflict };
  }
  return null;
}

// Regra 2: Nenhuma PM em feriado
// Aplica feriados nacionais (zone_id e locality null, mesmo country) + fecho operacional
// da zona PMPlan (mesmo zone_id) + feriado municipal/regional oficial do hospital (mesma
// locality — ex: feriado de Braga só bloqueia equipamento cujo hospital é em Braga, ou
// "fiesta local" de Vigo via hospitalCity — distinto da Comunidade Autónoma).
/** Os feriados que se aplicam a um hospital: nacionais do país, fecho operacional da zona,
 *  e o municipal/regional da localidade ou da cidade do hospital. Partilhado pela Regra 2
 *  (checkHolidayConflict) e pela revisão das PMs já marcadas (findPmsOnHolidays). */
export function holidaysApplicableTo(
  holidays: Holiday[],
  zoneId: string,
  country: Country,
  hospitalLocality: string | null = null,
  hospitalCity: string | null = null,
): Holiday[] {
  return holidays.filter(
    (holiday) =>
      holiday.zone_id === zoneId ||
      (holiday.locality !== null && holiday.locality === hospitalLocality) ||
      (holiday.locality !== null && holiday.locality === hospitalCity) ||
      (holiday.zone_id === null && holiday.locality === null && holiday.country === country),
  );
}

export function checkHolidayConflict(
  date: Date,
  zoneId: string,
  zoneCountry: Country,
  holidays: Holiday[],
  hospitalLocality: string | null = null,
  hospitalCity: string | null = null,
): ConflictResult {
  const applicableHolidays = holidaysApplicableTo(holidays, zoneId, zoneCountry, hospitalLocality, hospitalCity);
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
    messageKey: 'conflict.holiday',
    messageParams: { name: matched.name },
    suggestedDate,
  };
}

// ─── REVISÃO: PMs JÁ MARCADAS QUE CAEM EM FERIADOS ───────────────────────────
//
// A Regra 2 só actua quando se cria, move ou gera uma PM. Os feriados de um ano ainda
// mudam depois de o plano estar feito — o BOE publica os regionais de Espanha no fim de
// Outubro, as câmaras as fiestas locales até Dezembro — e uma PM já marcada num dia que
// passou a ser feriado ficava lá sem aviso. Esta função encontra-as.

export interface PmOnHoliday {
  event: PMEvent;
  equipment: Pick<EquipmentFull, 'id' | 'name' | 'hospital_name' | 'zone_code'> | null;
  /** Os feriados que coincidem com algum dia da PM (pode ser mais do que um). */
  holidays: Holiday[];
}

/** Estados que ainda se podem mudar de data: as concluídas já aconteceram e as canceladas
 *  não ocupam o dia. */
const REVIEWABLE_STATUSES = new Set(['planned', 'confirmed', 'delayed', 'in_progress']);

export function findPmsOnHolidays(
  events: PMEvent[],
  equipment: Pick<
    EquipmentFull,
    'id' | 'name' | 'hospital_name' | 'zone_code' | 'zone_id' | 'hospital_country' | 'hospital_locality' | 'hospital_city'
  >[],
  holidays: Holiday[],
): PmOnHoliday[] {
  const byId = new Map(equipment.map((item) => [item.id, item]));
  const result: PmOnHoliday[] = [];
  for (const event of events) {
    if (!REVIEWABLE_STATUSES.has(event.status)) continue;
    const eq = byId.get(event.equipment_id);
    if (!eq) continue;
    const applicable = holidaysApplicableTo(holidays, eq.zone_id, eq.hospital_country, eq.hospital_locality, eq.hospital_city);
    if (applicable.length === 0) continue;
    const byDate = new Map<string, Holiday[]>();
    for (const holiday of applicable) {
      const key = holiday.date.slice(0, 10);
      byDate.set(key, [...(byDate.get(key) ?? []), holiday]);
    }
    const hits: Holiday[] = [];
    // Datas em texto 'yyyy-MM-dd' do princípio ao fim: sem objectos Date, não há fuso
    // horário a deslocar um feriado para o dia ao lado.
    for (let day = event.start_date.slice(0, 10), guard = 0; day <= event.end_date.slice(0, 10) && guard < 60; guard++) {
      hits.push(...(byDate.get(day) ?? []));
      day = addDaysToIsoDate(day, 1);
    }
    if (hits.length > 0) result.push({ event, equipment: eq, holidays: hits });
  }
  return result.sort((a, b) => a.event.start_date.localeCompare(b.event.start_date));
}

/** Separa a revisão em por rever e confirmadas. Uma PM só sai de "por rever" quando TODOS
 *  os seus dias de feriado estão confirmados; nas por rever ficam só os dias que faltam. */
export function splitPmsOnHolidays(
  rows: PmOnHoliday[],
  confirmedByEvent: Map<string, Set<string>>,
): { pending: PmOnHoliday[]; confirmed: PmOnHoliday[] } {
  const pending: PmOnHoliday[] = [];
  const confirmed: PmOnHoliday[] = [];
  for (const row of rows) {
    const dates = confirmedByEvent.get(row.event.id);
    const open = row.holidays.filter((holiday) => !dates?.has(holiday.date.slice(0, 10)));
    if (open.length === 0) confirmed.push(row);
    else pending.push({ ...row, holidays: open });
  }
  return { pending, confirmed };
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

  return {
    hasConflict: true,
    type: 'weekend_block',
    messageKey: 'conflict.weekend',
    messageParams: {
      date: format(blocked, 'dd/MM/yyyy'),
      // O nome do dia vai como chave e não como palavra: é a interface que o traduz.
      day: blocked.getDay() === 6 ? 'conflict.saturday' : 'conflict.sunday',
    },
    suggestedDate,
  };
}

// ─── REGRAS 7 E 8: EXCLUSIVIDADE POR HOSPITAL E POR CIDADE ───────────────────
//
// Regra 7 (cliente): o mesmo hospital não pode ter PMs em mais de UM equipamento no
// mesmo dia. Regra 8 (cidade): a mesma cidade não pode ter mais de UMA PM no mesmo dia
// (só uma PM em Lisboa por dia; Lisboa + Porto em simultâneo é permitido). Ambas
// comparam o candidato com eventos de OUTROS equipamentos, por isso precisam de saber
// a que hospital/cidade pertence o equipamento de cada evento — daí o EquipmentSiteIndex.

export interface EquipmentSite {
  hospitalId: string;
  /** Chave de cidade: hospital_city (cidade espanhola) com fallback para
   *  hospital_locality (concelho PT / Comunidade Autónoma). null = sem cidade conhecida
   *  → a Regra 8 não se aplica a este equipamento. */
  cityKey: string | null;
}

export type EquipmentSiteIndex = Map<string, EquipmentSite>;

export function cityKeyOfEquipment(eq: Pick<EquipmentFull, 'hospital_city' | 'hospital_locality'>): string | null {
  return eq.hospital_city ?? eq.hospital_locality ?? null;
}

export function buildEquipmentSiteIndex(equipment: EquipmentFull[]): EquipmentSiteIndex {
  return new Map(
    equipment.map((eq) => [eq.id, { hospitalId: eq.hospital_id, cityKey: cityKeyOfEquipment(eq) }]),
  );
}

interface SiteConflictParams {
  /** Equipamento candidato — os eventos DELE próprio não contam (o espaçamento entre
   *  PMs do mesmo equipamento é a Regra 6/intervalo mínimo, não estas regras). */
  equipmentId: string;
  startDate: Date;
  endDate: Date;
  existingEvents: PMEvent[];
  siteIndex: EquipmentSiteIndex;
  excludeEventId?: string;
}

function findOverlappingSiteEvent(
  params: SiteConflictParams,
  matchesSite: (site: EquipmentSite) => boolean,
): PMEvent | undefined {
  const candidateInterval = toInterval(params.startDate, params.endDate);
  return params.existingEvents.find((event) => {
    if (event.equipment_id === params.equipmentId) return false;
    if (params.excludeEventId && event.id === params.excludeEventId) return false;
    if (!eventIsActive(event)) return false;
    const site = params.siteIndex.get(event.equipment_id);
    if (!site || !matchesSite(site)) return false;
    return areIntervalsOverlapping(
      candidateInterval,
      toInterval(new Date(event.start_date), new Date(event.end_date)),
      { inclusive: true },
    );
  });
}

function isoWeekKey(date: Date): string {
  return `${getISOWeekYear(date)}-W${getISOWeek(date)}`;
}

function isoWeekKeysOfInterval(start: Date, end: Date): Set<string> {
  return new Set(eachDayOfInterval({ start, end }).map(isoWeekKey));
}

// Regra 7: o mesmo hospital (cliente) não pode ter PMs em mais de um equipamento na
// MESMA SEMANA ISO (segunda a domingo) — mais restritivo que "mesmo dia": duas PMs do
// mesmo hospital em dias diferentes da mesma semana também colidem.
export function checkHospitalSameWeekConflict(
  params: SiteConflictParams & { hospitalId: string },
): ConflictResult {
  const candidateWeeks = isoWeekKeysOfInterval(params.startDate, params.endDate);
  const overlapping = params.existingEvents.find((event) => {
    if (event.equipment_id === params.equipmentId) return false;
    if (params.excludeEventId && event.id === params.excludeEventId) return false;
    if (!eventIsActive(event)) return false;
    const site = params.siteIndex.get(event.equipment_id);
    if (!site || site.hospitalId !== params.hospitalId) return false;
    const eventWeeks = isoWeekKeysOfInterval(new Date(event.start_date), new Date(event.end_date));
    for (const week of candidateWeeks) {
      if (eventWeeks.has(week)) return true;
    }
    return false;
  });
  if (!overlapping) return NO_CONFLICT;

  return {
    hasConflict: true,
    type: 'hospital_same_week',
    messageKey: 'conflict.hospitalSameWeek',
    messageParams: {
      start: toDisplayDate(overlapping.start_date),
      end: toDisplayDate(overlapping.end_date),
    },
  };
}

// Excepção à Regra 8: nas zonas com estes códigos (e nas suas zonas-filhas) duas PMs
// na mesma cidade no mesmo dia não bloqueiam — o scheduler mantém a data ancorada e a
// criação manual grava. O choque continua a aparecer, como aviso (warningOnly).
// MD = Madrid: vários hospitais na mesma cidade, com equipa para mais de uma PM por dia.
export const CITY_SAME_DAY_EXEMPT_ZONE_CODES: readonly string[] = ['MD'];

export function isCitySameDayExempt(zoneId: string, zones: Pick<Zone, 'id' | 'code' | 'parent_zone_id'>[]): boolean {
  const exempt = new Set(CITY_SAME_DAY_EXEMPT_ZONE_CODES.map((code) => code.toUpperCase()));
  const byId = new Map(zones.map((zone) => [zone.id, zone]));
  const seen = new Set<string>();
  let current = byId.get(zoneId);
  while (current && !seen.has(current.id)) {
    if (exempt.has(current.code.toUpperCase())) return true;
    seen.add(current.id);
    current = current.parent_zone_id ? byId.get(current.parent_zone_id) : undefined;
  }
  return false;
}

/** Conflitos que se mostram mas não impedem gravar: a carga de zona (Regra 3, alerta) e
 *  os marcados warningOnly (Regra 8 nas zonas isentas). */
export function isWarningOnly(result: ConflictResult): boolean {
  return result.type === 'zone_overload' || result.warningOnly === true;
}

// Regra 8: máximo 1 PM por cidade por dia. Eventos do MESMO hospital não contam aqui —
// esses já são bloqueados pela Regra 7 (evita reportar o mesmo choque duas vezes).
export function checkCitySameDayConflict(
  params: SiteConflictParams & { hospitalId: string; cityKey: string | null },
): ConflictResult {
  if (!params.cityKey) return NO_CONFLICT;
  const overlapping = findOverlappingSiteEvent(
    params,
    (site) => site.cityKey === params.cityKey && site.hospitalId !== params.hospitalId,
  );
  if (!overlapping) return NO_CONFLICT;

  return {
    hasConflict: true,
    type: 'city_same_day',
    messageKey: 'conflict.citySameDay',
    messageParams: {
      city: params.cityKey ?? '',
      start: toDisplayDate(overlapping.start_date),
      end: toDisplayDate(overlapping.end_date),
    },
  };
}

// Regra 6: nº de PMs planeadas no ano não pode exceder o contratado (equipment.pm_per_year,
// campo "PM/ano" no formulário de equipamento). Conta só eventos activos (cancelados não
// ocupam quota) do mesmo equipamento a começar nesse ano — partilhada entre o motor de
// conflitos (bloqueio na criação/edição) e o contador mostrado no PMEventModal.
// Lista as PMs activas (não canceladas) de um equipamento num ano — usada tanto para a
// contagem da quota (checkPmQuota/countPmEventsForEquipmentInYear) como para mostrar as
// datas já agendadas no PMEventModal (secção "PMs planeadas: N/max", expansível).
export function listPmEventsForEquipmentInYear(
  equipmentId: string,
  year: number,
  events: PMEvent[],
  excludeEventId?: string,
): PMEvent[] {
  return events
    .filter(
      (event) =>
        event.equipment_id === equipmentId &&
        eventIsActive(event) &&
        (!excludeEventId || event.id !== excludeEventId) &&
        new Date(event.start_date).getFullYear() === year,
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

export function countPmEventsForEquipmentInYear(
  equipmentId: string,
  year: number,
  events: PMEvent[],
  excludeEventId?: string,
): number {
  return listPmEventsForEquipmentInYear(equipmentId, year, events, excludeEventId).length;
}

export function checkPmQuota(
  equipmentId: string,
  pmPerYear: number,
  year: number,
  events: PMEvent[],
  excludeEventId?: string,
): ConflictResult {
  const count = countPmEventsForEquipmentInYear(equipmentId, year, events, excludeEventId);
  if (count < pmPerYear) return NO_CONFLICT;

  return {
    hasConflict: true,
    type: 'pm_quota_exceeded',
    messageKey: 'conflict.pmQuota',
    messageParams: { count, year, max: pmPerYear },
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

// Dias de fim-de-semana efectivamente ocupados por PMs — para efeitos de carga contam
// como dias úteis: se há marcações ao sábado/domingo, esses dias são dias de trabalho.
// Sem isto o rácio saía inflacionado, porque a procura já contava os dias de fds do
// intervalo da PM (dias corridos) mas a capacidade só contava segunda-a-sexta.
//
// Um mesmo sábado coberto por várias PMs conta uma única vez — é um dia de calendário a
// entrar no calendário de trabalho, não uma unidade de esforço (o esforço das várias PMs
// já está na procura). Só entram os dias dentro do ano: a capacidade é uma propriedade
// do calendário do ano, e uma PM que atravesse 31/Dez não estica o ano seguinte.
function weekendWorkDaysFromEvents(
  events: PMEvent[],
  matches: (event: PMEvent) => boolean,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  const days = new Set<string>();
  for (const event of events) {
    if (!eventIsActive(event) || !matches(event)) continue;
    const start = new Date(event.start_date);
    // Mesmo critério de inclusão da procura (ver sumActiveEventDays): conta a PM se
    // COMEÇA dentro do período, para os dois lados do rácio olharem para o mesmo conjunto.
    if (start < rangeStart || start > rangeEnd) continue;
    for (const day of eachDayOfInterval({ start, end: new Date(event.end_date) })) {
      if (isWeekend(day) && day >= rangeStart && day <= rangeEnd) days.add(format(day, 'yyyy-MM-dd'));
    }
  }
  return days.size;
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
// mensal — secção "todos os cálculos a nível anual"). Zona-mãe = soma das zonas filhas
// e SÓ delas: procura = Σ procura das filhas, capacidade = Σ capacidade das filhas.
// Equipamentos atribuídos directamente à mãe não entram. A capacidade de cada engenheiro
// reparte-se pelas filhas onde ele trabalha (computeLeafZoneLoad), por isso a mãe soma-o
// uma única vez no total — nem a mais, nem a menos.
// `events`/`equipment` vêm completos (não pré-filtrados) — a filtragem por zona é feita
// aqui dentro.
export function computeZoneLoadRatio(
  zoneId: string,
  year: number,
  events: PMEvent[],
  engineers: EngineerWithZones[],
  equipment: Equipment[],
  zones: Zone[],
): LoadRatio {
  return sumZoneLoad(zoneId, year, events, engineers, equipment, zones, new Set());
}

function sumZoneLoad(
  zoneId: string,
  year: number,
  events: PMEvent[],
  engineers: EngineerWithZones[],
  equipment: Equipment[],
  zones: Zone[],
  visited: Set<string>,
): LoadRatio {
  visited.add(zoneId); // guarda contra um ciclo pai↔filho nos dados do cliente
  const children = zones.filter((zone) => zone.parent_zone_id === zoneId && !visited.has(zone.id));
  if (children.length === 0) return computeLeafZoneLoad(zoneId, year, events, engineers, equipment);

  let capacityDays = 0;
  let demandDays = 0;
  for (const child of children) {
    const load = sumZoneLoad(child.id, year, events, engineers, equipment, zones, visited);
    capacityDays += load.capacityDays;
    demandDays += load.demandDays;
  }
  return { capacityDays, demandDays, ratio: capacityDays === 0 ? 0 : demandDays / capacityDays };
}

function eventPmDays(event: PMEvent): number {
  return (
    Math.round(
      (new Date(event.end_date).getTime() - new Date(event.start_date).getTime()) / (1000 * 60 * 60 * 24),
    ) + 1
  );
}

/** Carga de uma zona-folha a partir de QUEM FAZ as PMs dessa zona.
 *
 *  Cada engenheiro reparte a sua capacidade anual (a mesma da carga por engenheiro)
 *  pelas zonas, na proporção dos dias-PM que lá tem. Daqui resulta que a carga de uma
 *  zona é a média da carga dos engenheiros que lá trabalham, ponderada pelos dias que
 *  lá fazem — a Galiza, feita só pelo Ricardo, tem exactamente a carga do Ricardo.
 *
 *  Porquê assim: as atribuições de zona (primária/secundárias) dizem quem PODE ir, não
 *  quem vai. Contar todos os possíveis inflacionava a capacidade (a Galiza tinha 4
 *  engenheiros possíveis e só um lá vai); contar só os primários deixava zonas sem
 *  nenhum (a Galiza não tem primário) a capacidade zero.
 *
 *  Casos de fronteira:
 *  - PM ainda sem engenheiro: conta como trabalho dos engenheiros primários (activos)
 *    da zona, repartido por igual. Sem primários, entra só na procura.
 *  - Engenheiro activo sem PMs no ano: a capacidade fica toda na zona primária — é
 *    folga real dessa zona.
 *  A soma das capacidades de todas as zonas é a da equipa, e as zonas-mãe (soma das
 *  filhas) ficam coerentes por construção. */
function computeLeafZoneLoad(
  zoneId: string,
  year: number,
  events: PMEvent[],
  engineers: EngineerWithZones[],
  equipment: Equipment[],
): LoadRatio {
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(yearStart);
  const zoneOfEquipment = new Map(equipment.map((item) => [item.id, item.zone_id]));

  // Mesmo critério de inclusão da procura de sempre: activa e a começar dentro do ano.
  const yearEventsActive = events.filter((event) => {
    if (!eventIsActive(event)) return false;
    const start = new Date(event.start_date);
    return start >= yearStart && start <= yearEnd;
  });

  const primariesByZone = new Map<string, string[]>();
  for (const engineer of engineers) {
    if (!engineer.active || !engineer.primary_zone_id) continue;
    const list = primariesByZone.get(engineer.primary_zone_id) ?? [];
    list.push(engineer.id);
    primariesByZone.set(engineer.primary_zone_id, list);
  }

  // Dias-PM de cada engenheiro: no total (D) e nesta zona (d).
  const totalDays = new Map<string, number>();
  const zoneDays = new Map<string, number>();
  let demandDays = 0;
  for (const event of yearEventsActive) {
    const eventZone = zoneOfEquipment.get(event.equipment_id);
    const days = eventPmDays(event);
    if (eventZone === zoneId) demandDays += days;
    const doers = event.engineer_id
      ? [event.engineer_id]
      : eventZone
        ? (primariesByZone.get(eventZone) ?? [])
        : [];
    for (const engineerId of doers) {
      const share = days / doers.length;
      totalDays.set(engineerId, (totalDays.get(engineerId) ?? 0) + share);
      if (eventZone === zoneId) zoneDays.set(engineerId, (zoneDays.get(engineerId) ?? 0) + share);
    }
  }

  let capacityDays = 0;
  for (const [engineerId, daysHere] of zoneDays) {
    const engineerCapacity = computeEngineerLoadRatio(engineerId, year, events).capacityDays;
    capacityDays += (engineerCapacity * daysHere) / (totalDays.get(engineerId) ?? daysHere);
  }
  for (const engineerId of primariesByZone.get(zoneId) ?? []) {
    if ((totalDays.get(engineerId) ?? 0) > 0) continue;
    capacityDays += computeEngineerLoadRatio(engineerId, year, events).capacityDays;
  }

  return { capacityDays, demandDays, ratio: capacityDays === 0 ? 0 : demandDays / capacityDays };
}

// Carga por engenheiro — mesma filosofia da carga por zona (cálculo anual), mas sem
// agregação hierárquica (um engenheiro não tem "filhos"): capacidade = dias úteis do ano
// (mais os fins-de-semana em que ele tem PMs marcadas) × 1 dia-PM/dia útil; procura =
// dias-PM das PMs activas atribuídas a este engenheiro, a começar nesse ano.
export function computeEngineerLoadRatio(engineerId: string, year: number, events: PMEvent[]): LoadRatio {
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(yearStart);

  const assignedToEngineer = (event: PMEvent) => event.engineer_id === engineerId;

  const workDays =
    workDaysInRange(yearStart, yearEnd) +
    weekendWorkDaysFromEvents(events, assignedToEngineer, yearStart, yearEnd);
  const capacityDays = workDays * ASSUMED_PM_DAYS_PER_ENGINEER_PER_WORKDAY;
  const demandDays = sumActiveEventDays(events, assignedToEngineer, yearStart, yearEnd);

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
    messageKey: 'conflict.zoneLoad',
    messageParams: { year, percent: loadPercent, demand: demandDays, capacity: capacityDays },
  };
}

// Função principal que agrega todas as regras de bloqueio (feriados em qualquer dia do
// intervalo + fim-de-semana não contratualizado + sobreposição de engenheiro + Regras
// 7/8 de hospital/cidade quando o chamador fornece equipmentId+hospitalId+siteIndex).
// A carga de zona não bloqueia — ver checkZoneLoad.
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
  /** Regras 7/8 — opcionais para não partir chamadores que ainda não têm o índice. */
  equipmentId?: string;
  hospitalId?: string;
  cityKey?: string | null;
  siteIndex?: EquipmentSiteIndex;
  /** Zona isenta da Regra 8 (isCitySameDayExempt): o choque sai como aviso. */
  citySameDayWarningOnly?: boolean;
  /** Dias de feriado já confirmados para esta PM ('yyyy-MM-dd', migração 0029): editar a
   *  PM confirmada não pode voltar a ser bloqueado pelo mesmo feriado — sai como aviso. */
  confirmedHolidayDates?: Set<string>;
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
    equipmentId,
    hospitalId,
    cityKey = null,
    siteIndex,
    citySameDayWarningOnly = false,
    confirmedHolidayDates,
  } = params;

  const results: ConflictResult[] = [];

  const holidayConflicts = eachDayOfInterval({ start: startDate, end: endDate })
    .map((day) => {
      const result = checkHolidayConflict(day, zoneId, zoneCountry, holidays, hospitalLocality, hospitalCity);
      return result.hasConflict && confirmedHolidayDates?.has(format(day, 'yyyy-MM-dd'))
        ? { ...result, warningOnly: true }
        : result;
    })
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

  if (equipmentId && hospitalId && siteIndex) {
    const siteParams = {
      equipmentId,
      hospitalId,
      startDate,
      endDate,
      existingEvents,
      siteIndex,
      ...(excludeEventId ? { excludeEventId } : {}),
    };
    const hospitalResult = checkHospitalSameWeekConflict(siteParams);
    if (hospitalResult.hasConflict) results.push(hospitalResult);

    const cityResult = checkCitySameDayConflict({ ...siteParams, cityKey });
    if (cityResult.hasConflict) {
      results.push(citySameDayWarningOnly ? { ...cityResult, warningOnly: true } : cityResult);
    }
  }

  return results;
}
