import type { Engineer, EngineerWithZones, Zone } from '../types';

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

/** Âmbito de uma zona para efeitos de CARGA: uma zona-mãe é só a soma das filhas — o que
 *  estiver atribuído directamente à própria mãe (engenheiros, equipamentos) fica de fora,
 *  senão a percentagem da mãe deixava de bater com as das filhas. Uma zona sem filhas é
 *  apenas ela própria. Difere de expandZoneSelection (filtros), que inclui a mãe. */
export function getZoneLoadScopeIds(zoneId: string, zones: Zone[]): Set<string> {
  const scope = getZoneScopeIds(zoneId, zones);
  if (scope.size > 1) scope.delete(zoneId);
  return scope;
}

/** Team Leader efectivo de uma zona: o seu próprio, ou — se não tiver — o da zona-mãe mais
 *  próxima que tenha um. É por isso que basta definir o TL nas zonas de topo ("North & West",
 *  "South & Eastern Spain") para todos os hospitais das zonas-filhas (Galiza, Lisboa, Norte,
 *  Madrid, ...) ficarem cobertos, sem repetir a configuração zona a zona. Definir um TL numa
 *  zona-filha sobrepõe-se ao da mãe, para o caso de uma zona vir a ter responsável próprio.
 *
 *  Devolve o id do engenheiro TL, ou null se nem a zona nem nenhuma ascendente tiver um. */
export function resolveZoneTeamLeaderId(zoneId: string | null, zones: Zone[]): string | null {
  // `visited` protege de um ciclo pai↔filho: o Postgres já o impede (trigger
  // prevent_zone_cycle), mas os dados aqui vêm do estado do cliente e um ciclo tornaria
  // isto num loop infinito no meio de um envio de emails.
  const visited = new Set<string>();
  let current = zoneId ? zones.find((zone) => zone.id === zoneId) : undefined;

  while (current && !visited.has(current.id)) {
    if (current.team_leader_engineer_id) return current.team_leader_engineer_id;
    visited.add(current.id);
    current = current.parent_zone_id
      ? zones.find((zone) => zone.id === current!.parent_zone_id)
      : undefined;
  }
  return null;
}

/** Equipa de uma zona: os engenheiros activos atribuídos DIRECTAMENTE a ela (Configurações →
 *  Zonas → "Engenheiros nesta zona"). Os herdados da zona-mãe ficam de fora de propósito:
 *  quem está só em "North & West" não é da equipa de Lisboa, e receberia os envios de todos
 *  os hospitais da região. Só os que têm email — é para eles que se envia. */
export function resolveZoneTeam(zoneId: string | null, engineers: EngineerWithZones[]): Engineer[] {
  if (!zoneId) return [];
  return engineers.filter(
    (engineer) =>
      engineer.active && !!engineer.email && engineer.zones.some((assignment) => assignment.zone_id === zoneId),
  );
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
