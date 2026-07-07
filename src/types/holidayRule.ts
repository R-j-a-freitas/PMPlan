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
  created_at: string;
};

export type HolidayRuleInsert = Omit<HolidayRule, 'id' | 'created_at'>;
export type HolidayRuleUpdate = Partial<HolidayRuleInsert>;
