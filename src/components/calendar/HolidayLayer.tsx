import type { EventInput } from '@fullcalendar/core';
import { spanishRegionName } from '../../lib/spanishRegions';
import type { Holiday, Zone } from '../../types';

// Feriados como Background Events (secção 9) — sempre visíveis, independentemente de
// filtros activos. Um dia só precisa de UM background event mesmo que tenha vários
// feriados (ex: várias Comunidades Autónomas espanholas no mesmo dia) — o detalhe de
// quantos/quais fica no tooltip (buildHolidayDayInfo), não em events sobrepostos.
export function buildHolidayBackgroundEvents(holidays: Holiday[]): EventInput[] {
  const dates = new Set(holidays.map((holiday) => holiday.date));
  return [...dates].map((date) => ({
    start: date,
    end: date,
    display: 'background',
    backgroundColor: '#FEE2E2',
    extendedProps: { type: 'holiday' },
  }));
}

export interface HolidayDayInfo {
  /** Texto completo para o tooltip (várias linhas se houver mais que um feriado nesse dia). */
  tooltip: string;
  /** Nomes das zonas com feriado próprio nesse dia — mostrados como badge no próprio dia
   *  (secção: "se for feriado em Barcelona, terá de aparecer feriado Barcelona"). */
  zoneNames: string[];
}

const COUNTRY_LABELS: Record<string, string> = { PT: 'Portugal', ES: 'Espanha' };

// Âmbito real do feriado: zona (fecho operacional do PMPlan), localidade (concelho PT ou
// Comunidade Autónoma ES) ou, só se nenhum dos dois estiver preenchido, nacional — ver
// regra em conflictRules.ts. holiday.zone_id sozinho NÃO chega para decidir isto (a
// generalidade dos feriados regionais/locais tem zone_id null e locality preenchida).
function describeScope(holiday: Holiday, zones: Zone[]): { label: string; zoneName: string | null } {
  const zone = holiday.zone_id ? zones.find((candidate) => candidate.id === holiday.zone_id) : null;
  if (zone) return { label: `${holiday.name} (feriado regional — ${zone.name})`, zoneName: zone.name };

  if (holiday.locality) {
    const localityName = holiday.country === 'ES' ? spanishRegionName(holiday.locality) : holiday.locality;
    const scopeWord = holiday.type === 'local' ? 'local' : 'regional';
    return { label: `${holiday.name} (feriado ${scopeWord} — ${localityName})`, zoneName: null };
  }

  return {
    label: `${holiday.name} (feriado nacional — ${COUNTRY_LABELS[holiday.country] ?? holiday.country})`,
    zoneName: null,
  };
}

// Agrupa os feriados por dia, com o detalhe de âmbito (nacional de que país, regional de
// que zona/Comunidade Autónoma, ou local de que concelho) usado no tooltip ao passar o
// rato (secção: "quando passado o rato por cima" deve mostrar do que se trata e quem
// afecta). Deduplicado por linha de texto — vários hospitais na mesma zona não devem
// repetir a mesma linha duas vezes.
export function buildHolidayDayInfo(holidays: Holiday[], zones: Zone[]): Map<string, HolidayDayInfo> {
  const map = new Map<string, { labels: Set<string>; zoneNames: Set<string> }>();

  for (const holiday of holidays) {
    const { label, zoneName } = describeScope(holiday, zones);
    const existing = map.get(holiday.date);
    if (existing) {
      existing.labels.add(label);
      if (zoneName) existing.zoneNames.add(zoneName);
    } else {
      map.set(holiday.date, { labels: new Set([label]), zoneNames: new Set(zoneName ? [zoneName] : []) });
    }
  }

  const result = new Map<string, HolidayDayInfo>();
  for (const [date, { labels, zoneNames }] of map) {
    result.set(date, { tooltip: [...labels].join('\n'), zoneNames: [...zoneNames] });
  }
  return result;
}
