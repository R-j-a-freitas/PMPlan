import type { Zone } from '../types';

/** Zona + todos os seus descendentes (filhas, netas, ...). Permite que marcar uma
 *  zona-mãe (ex: "NorthWest") agregue automaticamente o âmbito das suas zonas filhas
 *  (ex: "Galiza", "Lisboa", "Norte") sem as ter de marcar uma a uma. */
function getZoneScopeIds(zoneId: string, zones: Zone[]): Set<string> {
  const result = new Set<string>([zoneId]);
  const stack = [zoneId];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const candidate of zones) {
      if (candidate.parent_zone_id === current && !result.has(candidate.id)) {
        result.add(candidate.id);
        stack.push(candidate.id);
      }
    }
  }
  return result;
}

/** Expande uma selecção de zonas (sidebar) para o conjunto completo zonas + descendentes —
 *  usado para restringir as listas de Engenheiros/Equipamentos ao âmbito seleccionado. */
export function expandZoneSelection(zoneIds: string[], zones: Zone[]): Set<string> {
  const result = new Set<string>();
  for (const id of zoneIds) {
    for (const scoped of getZoneScopeIds(id, zones)) result.add(scoped);
  }
  return result;
}

/** Zonas-folha (sem filhas) — só estas podem receber hospitais directamente; zonas-mãe
 *  (ex: "Northwest") são apenas agrupamentos para atribuição de engenheiros. */
export function getLeafZones(zones: Zone[]): Zone[] {
  const leafIds = new Set(zones.map((zone) => zone.id));
  for (const zone of zones) {
    if (zone.parent_zone_id) leafIds.delete(zone.parent_zone_id);
  }
  return zones.filter((zone) => leafIds.has(zone.id));
}
