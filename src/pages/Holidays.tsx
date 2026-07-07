import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { useHolidays } from '../hooks';
import { computeActiveLocalities } from '../lib/activeLocalities';
import { toDisplayDate } from '../lib/dateFormat';
import { expandHolidayRule } from '../lib/expandHolidayRule';
import { spanishRegionName, SPANISH_REGIONS } from '../lib/spanishRegions';
import {
  useAuthStore,
  useEquipmentStore,
  useHolidayRuleStore,
  useHolidayStore,
  useUiStore,
  useZoneStore,
} from '../stores';
import type { Country, Holiday, HolidayRule, HolidayRuleType } from '../types';
import { Button } from '../components/ui';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

const EMPTY_FORM = { name: '', date: '', country: 'PT' as Country, zoneId: '', locality: '' };

const EMPTY_RULE_FORM = {
  name: '',
  locality: '',
  ruleType: 'fixed_date' as HolidayRuleType,
  fixedMonth: '1',
  fixedDay: '1',
  easterOffsetDays: '0',
};

function describeRule(rule: HolidayRule): string {
  if (rule.rule_type === 'fixed_date') {
    return `Todos os anos: ${String(rule.fixed_day).padStart(2, '0')}/${String(rule.fixed_month).padStart(2, '0')}`;
  }
  const offset = rule.easter_offset_days ?? 0;
  return `Páscoa ${offset >= 0 ? '+' : ''}${offset} dias`;
}

interface HolidaySectionProps {
  title: string;
  hint?: string;
  holidays: Holiday[];
  canManageHolidays: boolean;
  onDelete: (id: string) => void;
  localityLabel?: (holiday: Holiday) => string;
}

// Uma secção (tabela) por âmbito de feriado — reutilizada pelas 4 categorias da página.
function HolidaySection({ title, hint, holidays, canManageHolidays, onDelete, localityLabel }: HolidaySectionProps) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold uppercase text-gray-500">{title}</h2>
      {hint && <p className="mb-2 text-xs text-gray-400">{hint}</p>}
      {holidays.length === 0 ? (
        <p className="text-sm text-gray-400">Sem feriados.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5 pr-2">Data</th>
              <th className="py-1.5 pr-2">Nome</th>
              {localityLabel && <th className="py-1.5 pr-2">Localidade</th>}
              <th className="py-1.5 pr-2">Origem</th>
              <th className="py-1.5 pr-2" />
            </tr>
          </thead>
          <tbody>
            {holidays.map((holiday) => (
              <tr key={holiday.id} className="border-b border-gray-100">
                <td className="py-1.5 pr-2">{toDisplayDate(holiday.date)}</td>
                <td className="py-1.5 pr-2">{holiday.name}</td>
                {localityLabel && <td className="py-1.5 pr-2">{localityLabel(holiday)}</td>}
                <td className="py-1.5 pr-2 text-xs text-gray-400">
                  {holiday.source.startsWith('manual') ? 'Manual' : 'Nager.Date'}
                </td>
                <td className="py-1.5 pr-2 text-right">
                  {canManageHolidays && (
                    <Button variant="danger" onClick={() => onDelete(holiday.id)}>
                      Eliminar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Feriados por zona (secção: "os feriados de cada zona têm de ser reflectidos e
// marcados no calendário"). Organizados em 4 categorias: nacionais PT/ES (vêm
// automaticamente da Nager.Date) e locais PT / regionais ES — só mostrados onde há
// equipamento real, já que um feriado municipal/regional só importa onde há máquinas.
export function Holidays() {
  const canManageHolidays = useAuthStore((state) => state.permissions.canManageHolidays);
  const zones = useZoneStore((state) => state.zones);
  const fetchZones = useZoneStore((state) => state.fetchZones);
  const equipment = useEquipmentStore((state) => state.equipment);
  const fetchEquipment = useEquipmentStore((state) => state.fetchEquipment);
  const createHoliday = useHolidayStore((state) => state.createHoliday);
  const deleteHoliday = useHolidayStore((state) => state.deleteHoliday);
  const pushToast = useUiStore((state) => state.pushToast);
  const holidayRules = useHolidayRuleStore((state) => state.rules);
  const fetchHolidayRules = useHolidayRuleStore((state) => state.fetchRules);
  const createHolidayRule = useHolidayRuleStore((state) => state.createRule);
  const deleteHolidayRule = useHolidayRuleStore((state) => state.deleteRule);

  const [year, setYear] = useState(CURRENT_YEAR);
  const { holidays } = useHolidays(year);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM);
  const [savingRule, setSavingRule] = useState(false);

  useEffect(() => {
    fetchZones();
    fetchEquipment();
    fetchHolidayRules();
  }, [fetchZones, fetchEquipment, fetchHolidayRules]);

  // Só mostra feriados locais/regionais de localidades onde existe equipamento real —
  // um feriado de uma região sem nenhuma máquina lá não interessa ao planeamento.
  const activeLocalities = useMemo(() => computeActiveLocalities(equipment), [equipment]);

  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const nationalPT = sorted.filter((h) => h.country === 'PT' && !h.locality);
  const nationalES = sorted.filter((h) => h.country === 'ES' && !h.locality);
  const localPT = sorted.filter((h) => h.country === 'PT' && h.locality && activeLocalities.pt.has(h.locality));
  const regionalES = sorted.filter((h) => h.country === 'ES' && h.locality && activeLocalities.es.has(h.locality));

  async function handleCreate() {
    if (!form.name || !form.date) return;
    setSaving(true);
    try {
      await createHoliday({
        zone_id: form.zoneId || null,
        locality: form.locality || null,
        country: form.country,
        date: form.date,
        name: form.name,
        type: form.locality ? 'regional' : form.zoneId ? 'regional' : 'national',
        year: new Date(form.date).getFullYear(),
        source: 'manual',
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao criar feriado.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteHoliday(id);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao eliminar feriado.' });
    }
  }

  // Só mostra regras de localidades onde já há equipamento — as restantes ~300 (de
  // concelhos sem máquinas) ficam disponíveis na BD mas não poluem esta lista.
  const visibleRules = [...holidayRules]
    .filter((rule) => activeLocalities.pt.has(rule.locality) || activeLocalities.es.has(rule.locality))
    .sort((a, b) => a.locality.localeCompare(b.locality));

  async function handleCreateRule() {
    if (!ruleForm.name || !ruleForm.locality) return;
    setSavingRule(true);
    try {
      const rule = await createHolidayRule({
        country: 'PT',
        locality: ruleForm.locality,
        name: ruleForm.name,
        rule_type: ruleForm.ruleType,
        fixed_month: ruleForm.ruleType === 'fixed_date' ? Number(ruleForm.fixedMonth) : null,
        fixed_day: ruleForm.ruleType === 'fixed_date' ? Number(ruleForm.fixedDay) : null,
        easter_offset_days: ruleForm.ruleType === 'easter_relative' ? Number(ruleForm.easterOffsetDays) : null,
        active: true,
      });
      // Aplica já ao ano em vista — sem isto, só apareceria depois de um reload (a cache
      // de anos carregados em holidayStore não sabe que esta regra é nova).
      await createHoliday(expandHolidayRule(rule, year));
      setRuleForm(EMPTY_RULE_FORM);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao criar regra.' });
    } finally {
      setSavingRule(false);
    }
  }

  async function handleDeleteRule(id: string) {
    try {
      await deleteHolidayRule(id);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao eliminar regra.' });
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-4 text-lg font-semibold text-gray-900">Feriados</h1>

        <label className="mb-4 flex w-fit flex-col gap-1 text-sm">
          Ano
          <select
            className="rounded-md border border-gray-300 px-2 py-1"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {YEAR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {canManageHolidays && (
          <div className="mb-6 flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
            <input
              placeholder="Nome do feriado"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <input
              type="date"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.country}
              onChange={(event) => setForm({ ...form, country: event.target.value as Country, locality: '' })}
            >
              <option value="PT">Portugal</option>
              <option value="ES">Espanha</option>
            </select>
            {form.country === 'PT' ? (
              <input
                placeholder="Concelho (vazio = nacional)"
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={form.locality}
                onChange={(event) => setForm({ ...form, locality: event.target.value })}
              />
            ) : (
              <select
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={form.locality}
                onChange={(event) => setForm({ ...form, locality: event.target.value })}
              >
                <option value="">Comunidade Autónoma… (vazio = nacional)</option>
                {SPANISH_REGIONS.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.name}
                  </option>
                ))}
              </select>
            )}
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.zoneId}
              onChange={(event) => setForm({ ...form, zoneId: event.target.value })}
            >
              <option value="">Sem zona específica</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  Fecho da zona: {zone.name}
                </option>
              ))}
            </select>
            <Button onClick={handleCreate} disabled={saving || !form.name || !form.date}>
              Adicionar feriado
            </Button>
          </div>
        )}

        <HolidaySection
          title="Feriados Nacionais Portugueses"
          holidays={nationalPT}
          canManageHolidays={canManageHolidays}
          onDelete={handleDelete}
        />
        <HolidaySection
          title="Feriados Nacionais Espanhóis"
          holidays={nationalES}
          canManageHolidays={canManageHolidays}
          onDelete={handleDelete}
        />
        <HolidaySection
          title="Feriados Locais de Portugal"
          hint="Concelhos onde existem equipamentos instalados."
          holidays={localPT}
          canManageHolidays={canManageHolidays}
          onDelete={handleDelete}
          localityLabel={(holiday) => holiday.locality ?? ''}
        />
        <HolidaySection
          title="Feriados Regionais de Espanha"
          hint="Comunidades Autónomas onde existem equipamentos instalados."
          holidays={regionalES}
          canManageHolidays={canManageHolidays}
          onDelete={handleDelete}
          localityLabel={(holiday) => (holiday.locality ? spanishRegionName(holiday.locality) : '')}
        />

        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase text-gray-500">Regras Recorrentes (Feriados Locais PT)</h2>
          <p className="mb-2 text-xs text-gray-400">
            Em vez de adicionar o feriado ano a ano, define-se aqui uma vez — fixo (mesmo dia todos os anos) ou móvel
            (dias relativos à Páscoa, ex: Segunda-feira de Páscoa = +1, Corpo de Deus = +60). A app projecta-o
            automaticamente para qualquer ano de planeamento.
          </p>

          {canManageHolidays && (
            <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
              <input
                list="pt-concelhos-regras"
                placeholder="Concelho"
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={ruleForm.locality}
                onChange={(event) => setRuleForm({ ...ruleForm, locality: event.target.value })}
              />
              <datalist id="pt-concelhos-regras">
                {[...new Set(holidayRules.map((rule) => rule.locality))].sort().map((locality) => (
                  <option key={locality} value={locality} />
                ))}
              </datalist>
              <input
                placeholder="Nome do feriado"
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={ruleForm.name}
                onChange={(event) => setRuleForm({ ...ruleForm, name: event.target.value })}
              />
              <select
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={ruleForm.ruleType}
                onChange={(event) => setRuleForm({ ...ruleForm, ruleType: event.target.value as HolidayRuleType })}
              >
                <option value="fixed_date">Data fixa</option>
                <option value="easter_relative">Móvel (relativo à Páscoa)</option>
              </select>
              {ruleForm.ruleType === 'fixed_date' ? (
                <>
                  <select
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    value={ruleForm.fixedMonth}
                    onChange={(event) => setRuleForm({ ...ruleForm, fixedMonth: event.target.value })}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={month}>
                        Mês {month}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    value={ruleForm.fixedDay}
                    onChange={(event) => setRuleForm({ ...ruleForm, fixedDay: event.target.value })}
                  />
                </>
              ) : (
                <input
                  type="number"
                  placeholder="Dias após a Páscoa"
                  className="w-36 rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={ruleForm.easterOffsetDays}
                  onChange={(event) => setRuleForm({ ...ruleForm, easterOffsetDays: event.target.value })}
                />
              )}
              <Button onClick={handleCreateRule} disabled={savingRule || !ruleForm.name || !ruleForm.locality}>
                Adicionar regra
              </Button>
            </div>
          )}

          {visibleRules.length === 0 ? (
            <p className="text-sm text-gray-400">Sem regras para concelhos com equipamentos instalados.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-1.5 pr-2">Concelho</th>
                  <th className="py-1.5 pr-2">Nome</th>
                  <th className="py-1.5 pr-2">Recorrência</th>
                  <th className="py-1.5 pr-2" />
                </tr>
              </thead>
              <tbody>
                {visibleRules.map((rule) => (
                  <tr key={rule.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-2">{rule.locality}</td>
                    <td className="py-1.5 pr-2">{rule.name}</td>
                    <td className="py-1.5 pr-2 text-xs text-gray-400">{describeRule(rule)}</td>
                    <td className="py-1.5 pr-2 text-right">
                      {canManageHolidays && (
                        <Button variant="danger" onClick={() => handleDeleteRule(rule.id)}>
                          Eliminar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
