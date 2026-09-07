import type { Zone } from '../types';
import { expandZoneSelection } from './zoneTree';

// Separador da chave composta zona + modalidade. Os ids de zona são UUID e nunca o contêm;
// a modalidade é texto livre e poderia contê-lo, por isso parte-se sempre na PRIMEIRA
// ocorrência (o resto da string é o nome da modalidade, tal e qual).
const SEPARATOR = '::';

/** Chave de uma modalidade DENTRO de uma zona-mãe. O filtro de equipamentos da sidebar é
 *  por par (zona, modalidade) e não só por nome de modalidade: marcar "Flexitron" em
 *  "South & Eastern Spain" não pode marcar o "Flexitron" de "North & West" — são linhas
 *  independentes, com equipamento diferente por trás. */
export function modalityScopeKey(zoneId: string, modality: string): string {
  return `${zoneId}${SEPARATOR}${modality}`;
}

export function parseModalityScopeKey(key: string): { zoneId: string; modality: string } | null {
  const index = key.indexOf(SEPARATOR);
  if (index < 0) return null;
  return { zoneId: key.slice(0, index), modality: key.slice(index + SEPARATOR.length) };
}

/** Predicado (zona do equipamento, modalidade) → está marcado? A zona da chave é a zona-mãe
 *  onde a checkbox aparece, mas o equipamento vive numa zona-folha (Galiza, Madrid, …) — por
 *  isso cada zona-mãe é expandida para os seus descendentes antes de comparar. Sem chaves
 *  marcadas devolve sempre false; é o chamador que decide o que "nada marcado" significa. */
export function buildModalityScopeMatcher(
  keys: string[],
  zones: Zone[],
): (zoneId: string | null | undefined, modality: string | null | undefined) => boolean {
  const scoped = new Set<string>();
  for (const key of keys) {
    const parsed = parseModalityScopeKey(key);
    if (!parsed) continue;
    for (const zoneId of expandZoneSelection([parsed.zoneId], zones)) {
      scoped.add(modalityScopeKey(zoneId, parsed.modality));
    }
  }
  return (zoneId, modality) =>
    !!zoneId && !!modality && scoped.has(modalityScopeKey(zoneId, modality));
}
