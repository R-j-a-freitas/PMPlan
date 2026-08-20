import type { RefKind } from '../spreadsheet';

// Aceita "Sim"/"Não" (PT) e algumas variantes comuns — usado pelos 3 importadores para a
// coluna "Activo" e similares, sempre opcionais com valor por omissão.
export function parseBooleanPt(value: string | undefined, defaultValue: boolean): boolean {
  if (!value || !value.trim()) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['sim', 'true', '1', 'yes'].includes(normalized)) return true;
  if (['não', 'nao', 'false', '0', 'no'].includes(normalized)) return false;
  return defaultValue;
}

export function boolToPt(value: boolean): string {
  return value ? 'Sim' : 'Não';
}

/** Procura por nome (case/espaços-insensitive) — usado para resolver foreign keys
 *  (hospital, zona, engenheiro) a partir do texto humano numa folha de cálculo. */
export function findByName<T extends { name: string }>(list: T[], name: string | undefined): T | undefined {
  if (!name || !name.trim()) return undefined;
  const needle = name.trim().toLowerCase();
  return list.find((item) => item.name.trim().toLowerCase() === needle);
}

/** Correspondências escolhidas à mão na pré-visualização: `aliasKey()` → id do registo.
 *  Vivem só durante a importação (não são gravadas) — o ficheiro fica na mesma. */
export type ImportAliases = Record<string, string>;

/** Chave estável de uma referência: o mesmo texto na mesma coluna resolve-se uma vez só,
 *  e vale para todas as linhas que o repetem. */
export function aliasKey(kind: RefKind, value: string | undefined): string {
  return `${kind}:${(value ?? '').trim().toLowerCase()}`;
}

/** Como `findByName`, mas com a correspondência manual à frente: se o utilizador já disse
 *  a que registo é que este texto corresponde, é esse que vale. */
export function resolveRef<T extends { id: string; name: string }>(
  list: T[],
  kind: RefKind,
  value: string | undefined,
  aliases: ImportAliases,
): T | undefined {
  const chosenId = aliases[aliasKey(kind, value)];
  if (chosenId) return list.find((item) => item.id === chosenId);
  return findByName(list, value);
}

export function splitCsvList(value: string | undefined): string[] {
  if (!value || !value.trim()) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
