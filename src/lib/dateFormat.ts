/** Datas da BD vêm sempre como 'yyyy-MM-dd' (coluna `date` do Postgres) — reformatar por
 *  string evita o desvio de fuso horário que um `new Date(...)` introduziria. */
export function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}
