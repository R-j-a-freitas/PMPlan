import type { TFunction } from '../i18n';
import type { HolidayRule, HolidayRuleType } from '../types';

// Formulário e descrição das regras recorrentes de feriados (holiday_rules) — partilhado
// pelo modal e pela tabela de regras da página Feriados.

export type HolidayRuleForm = {
  name: string;
  locality: string;
  ruleType: HolidayRuleType;
  fixedMonth: string;
  fixedDay: string;
  easterOffsetDays: string;
};

export const EMPTY_RULE_FORM: HolidayRuleForm = {
  name: '',
  locality: '',
  ruleType: 'fixed_date',
  fixedMonth: '1',
  fixedDay: '1',
  easterOffsetDays: '0',
};

export function ruleToForm(rule: HolidayRule): HolidayRuleForm {
  return {
    name: rule.name,
    locality: rule.locality,
    ruleType: rule.rule_type,
    fixedMonth: String(rule.fixed_month ?? 1),
    fixedDay: String(rule.fixed_day ?? 1),
    easterOffsetDays: String(rule.easter_offset_days ?? 0),
  };
}

/** Campos da regra a gravar — os da recorrência que não se aplicam ficam a null, como
 *  exige o check de holiday_rules. */
export function formToRuleFields(form: HolidayRuleForm) {
  return {
    locality: form.locality.trim(),
    name: form.name.trim(),
    rule_type: form.ruleType,
    fixed_month: form.ruleType === 'fixed_date' ? Number(form.fixedMonth) : null,
    fixed_day: form.ruleType === 'fixed_date' ? Number(form.fixedDay) : null,
    easter_offset_days: form.ruleType === 'easter_relative' ? Number(form.easterOffsetDays) : null,
  };
}

export function describeRule(rule: HolidayRule, t: TFunction): string {
  if (rule.rule_type === 'fixed_date') {
    return t('holidays.rules.describeFixed', {
      day: String(rule.fixed_day).padStart(2, '0'),
      month: String(rule.fixed_month).padStart(2, '0'),
    });
  }
  const offset = rule.easter_offset_days ?? 0;
  return t('holidays.rules.describeEaster', { offset: `${offset >= 0 ? '+' : ''}${offset}` });
}
