import { addDays, format } from 'date-fns';
import { computeEasterSunday } from './easter';
import type { HolidayInsert, HolidayRule } from '../types';

// Projecta uma regra recorrente (holiday_rules) para uma data concreta no ano pedido —
// é isto que permite a um concelho/Comunidade Autónoma ter o feriado atribuído uma única
// vez e aparecer automaticamente em qualquer ano de planeamento, móvel ou fixo.
export function expandHolidayRule(rule: HolidayRule, year: number): HolidayInsert {
  const date =
    rule.rule_type === 'fixed_date'
      ? new Date(year, rule.fixed_month! - 1, rule.fixed_day!)
      : addDays(computeEasterSunday(year), rule.easter_offset_days!);

  return {
    zone_id: null,
    locality: rule.locality,
    country: rule.country,
    date: format(date, 'yyyy-MM-dd'),
    name: rule.name,
    type: 'local',
    year,
    source: 'holiday-rule',
  };
}
