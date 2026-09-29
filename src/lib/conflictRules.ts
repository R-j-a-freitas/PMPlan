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
import { toDisplayDate } from './dateFormat';

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
    messageKey: 'conflict.holiday',
    messageParams: { name: matched.name },
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
// Engenheiros/equipamentos atribuídos directamente à mãe não entram, e um engenheiro que
// cubra várias filhas conta em cada uma (como na leitura de cada filha) — antes a mãe
// era calculada como um bolo único e esse engenheiro contava uma só vez, o que encolhia
// a capacidade da mãe e a punha acima do que as filhas justificavam.
// `events`/`equipment` vêm completos (não pré-filtrados) — a filtragem por zona é feita
// aqui dentro.
// Fins-de-semana com PMs marcadas contam como dias úteis dos dois lados do rácio — ver
// weekendWorkDaysFromEvents.
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

function computeLeafZoneLoad(
  zoneId: string,
  year: number,
  events: PMEvent[],
  engineers: EngineerWithZones[],
  equipment: Equipment[],
): LoadRatio {
  const zoneScope = new Set([zoneId]);
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
  const equipmentIsInZone = (event: PMEvent) => {
    const eq = equipment.find((item) => item.id === event.equipment_id);
    return !!eq && zoneScope.has(eq.zone_id);
  };

  // Dias úteis + os fins-de-semana em que esta zona tem mesmo PMs marcadas.
  const workDays =
    workDaysInRange(yearStart, yearEnd) +
    weekendWorkDaysFromEvents(events, equipmentIsInZone, yearStart, yearEnd);
  const capacityDays = engineersInZone.length * workDays * ASSUMED_PM_DAYS_PER_ENGINEER_PER_WORKDAY;

  const demandDays = sumActiveEventDays(events, equipmentIsInZone, yearStart, yearEnd);

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
    if (cityResult.hasConflict) results.push(cityResult);
  }

  return results;
}
