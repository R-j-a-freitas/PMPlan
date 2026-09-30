import type { Country } from './zone';

export type HolidayRuleType = 'fixed_date' | 'easter_relative';

/** Regra recorrente — useHolidays.ts expande-a para uma linha em `holidays` por ano
 *  pedido, em vez de cada concelho precisar de uma entrada manual por ano. */
export type HolidayRule = {
  id: string;
  country: Country;
  locality: string;
  name: string;
  rule_type: HolidayRuleType;
  /** 1-12, só para rule_type='fixed_date'. */
  fixed_month: number | null;
  /** 1-31, só para rule_type='fixed_date'. */
  fixed_day: number | null;
  /** Dias a somar ao Domingo de Páscoa, só para rule_type='easter_relative'
   *  (ex: +1 = Segunda-feira de Páscoa, +39 = Ascensão, +60 = Corpo de Deus). */
  easter_offset_days: number | null;
  active: boolean;
  /** Intervalo de anos em que esta versão da regra vale (null = sem limite). Editar "a
   *  partir de 2027" fecha a versão actual em 2026 e cria outra a partir de 2027 — as
   *  fiestas locales mudam de data todos os anos e os anos anteriores não podem mudar. */
  valid_from: number | null;
  valid_to: number | null;
  created_at: string;
};

export type HolidayRuleInsert = Omit<HolidayRule, 'id' | 'created_at'>;

/** Uma tentativa da importação automática dos feriados regionais ES a partir do BOE
 *  (scripts/sync-boe-holidays.mjs, migração 0025). Só leitura na app. */
export type HolidaySyncRun = {
  id: string;
  ran_at: string;
  target_year: number;
  status: 'imported' | 'unchanged' | 'not_published' | 'failed';
  boe_id: string | null;
  rows_count: number | null;
  message: string | null;
};
export type HolidayRuleUpdate = Partial<HolidayRuleInsert>;
