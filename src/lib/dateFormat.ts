/** Datas da BD vêm sempre como 'yyyy-MM-dd' (coluna `date` do Postgres) — reformatar por
 *  string evita o desvio de fuso horário que um `new Date(...)` introduziria. */
export function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

/** Soma dias a uma data 'yyyy-MM-dd' sem passar por `new Date(isoString)` (que ancora em
 *  UTC) — a aritmética corre inteiramente em UTC, do input ao output, por isso nunca sofre
 *  o desvio de fuso horário que motivou o bug do calendário a mostrar um dia a mais. */
export function addDaysToIsoDate(isoDate: string, amount: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}
