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

export function splitCsvList(value: string | undefined): string[] {
  if (!value || !value.trim()) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
