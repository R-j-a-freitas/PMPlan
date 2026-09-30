import { useState } from 'react';
import { FormModal } from '../ui';
import type { TFunction } from '../../i18n';
import { EMPTY_RULE_FORM, type HolidayRuleForm } from '../../lib/holidayRuleForm';
import type { HolidayRuleType } from '../../types';

interface HolidayRuleFormModalProps {
  t: TFunction;
  title: string;
  submitLabel: string;
  /** Rótulo do campo de localidade: "Concelho" (PT) ou "Cidade" (ES). */
  localityLabel: string;
  /** Sugestões para o campo de localidade — têm de casar à letra com hospitals.locality
   *  (PT) / hospitals.city (ES), senão o feriado não se aplica a nenhum hospital. */
  localities: string[];
  initial?: HolidayRuleForm;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: HolidayRuleForm) => void;
}

// Introdução e edição de regra recorrente (projectada para qualquer ano) — ver FormModal.
export function HolidayRuleFormModal({
  t,
  title,
  submitLabel,
  localityLabel,
  localities,
  initial = EMPTY_RULE_FORM,
  saving,
  onCancel,
  onSubmit,
}: HolidayRuleFormModalProps) {
  const [form, setForm] = useState(initial);

  return (
    <FormModal
      title={title}
      submitLabel={submitLabel}
      saving={saving}
      canSubmit={Boolean(form.name.trim() && form.locality.trim())}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <input
        autoFocus
        list="holiday-rule-localities"
        placeholder={localityLabel}
        className="pm-field"
        value={form.locality}
        onChange={(event) => setForm({ ...form, locality: event.target.value })}
      />
      <datalist id="holiday-rule-localities">
        {localities.map((locality) => (
          <option key={locality} value={locality} />
        ))}
      </datalist>
      <input
        placeholder={t('holidays.namePlaceholder')}
        className="pm-field"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <select
        className="col-span-2 pm-field"
        value={form.ruleType}
        onChange={(event) => setForm({ ...form, ruleType: event.target.value as HolidayRuleType })}
      >
        <option value="fixed_date">{t('holidays.rules.fixed')}</option>
        <option value="easter_relative">{t('holidays.rules.easter')}</option>
      </select>
      {form.ruleType === 'fixed_date' ? (
        <>
          <select
            className="pm-field"
            value={form.fixedMonth}
            onChange={(event) => setForm({ ...form, fixedMonth: event.target.value })}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
              <option key={month} value={month}>
                {t('holidays.rules.month', { month })}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            {t('holidays.rules.day')}
            <input
              type="number"
              min={1}
              max={31}
              className="w-20 pm-field"
              value={form.fixedDay}
              onChange={(event) => setForm({ ...form, fixedDay: event.target.value })}
            />
          </label>
        </>
      ) : (
        <input
          type="number"
          placeholder={t('holidays.rules.easterOffset')}
          className="col-span-2 pm-field"
          value={form.easterOffsetDays}
          onChange={(event) => setForm({ ...form, easterOffsetDays: event.target.value })}
        />
      )}
    </FormModal>
  );
}
