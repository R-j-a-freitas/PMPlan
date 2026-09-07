import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { useHolidays, useTableSort } from '../hooks';
import type { SortAccessors } from '../hooks';
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
import type { Country, Holiday, HolidayRule, HolidayRuleType, Zone } from '../types';
import { matchesSearch } from '../lib/searchText';
import { Button, Card, EmptyState, FormModal, PageHeader, SearchInput, SortableTh } from '../components/ui';
import { useT, type TFunction } from '../i18n';

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

function describeRule(rule: HolidayRule, t: TFunction): string {
  if (rule.rule_type === 'fixed_date') {
    return t('holidays.rules.describeFixed', {
      day: String(rule.fixed_day).padStart(2, '0'),
      month: String(rule.fixed_month).padStart(2, '0'),
    });
  }
  const offset = rule.easter_offset_days ?? 0;
  return t('holidays.rules.describeEaster', { offset: `${offset >= 0 ? '+' : ''}${offset}` });
}

/** Chave de ordenação da coluna "Recorrência": as regras de data fixa ordenam-se entre
 *  si por mês/dia e as móveis por distância à Páscoa, com os dois grupos separados —
 *  ordenar pelo texto ("Páscoa +60 dias" vs "Todos os anos: 13/06") misturava as duas
 *  famílias sem dizer nada sobre quando cada feriado cai. */
function ruleSortValue(rule: HolidayRule): string {
  if (rule.rule_type === 'fixed_date') {
    return `0-${String(rule.fixed_month).padStart(2, '0')}-${String(rule.fixed_day).padStart(2, '0')}`;
  }
  // Deslocamento com sinal e largura fixa, para -7 vir antes de +1 e +60 depois de +7.
  return `1-${String((rule.easter_offset_days ?? 0) + 1000).padStart(5, '0')}`;
}

type HolidayForm = typeof EMPTY_FORM;
type RuleForm = typeof EMPTY_RULE_FORM;

type HolidaySortKey = 'date' | 'name' | 'locality' | 'source';
type RuleSortKey = 'locality' | 'name' | 'recurrence';

// Rótulos da coluna "Localidade" ao nível do módulo (e não em linha no JSX): passam
// para HolidaySection como dependência da ordenação, e uma função nova a cada render
// mandava reordenar a tabela sem nada ter mudado.
const ptLocalityLabel = (holiday: Holiday) => holiday.locality ?? '';
const esLocalityLabel = (holiday: Holiday) => (holiday.locality ? spanishRegionName(holiday.locality) : '');

const RULE_SORT: SortAccessors<HolidayRule, RuleSortKey> = {
  locality: (rule) => rule.locality,
  name: (rule) => rule.name,
  recurrence: ruleSortValue,
};

// Introdução de feriado manual (um ano só) — ver FormModal para o porquê de estar em modal.
function HolidayFormModal({
  t,
  zones,
  saving,
  onCancel,
  onSubmit,
}: {
  t: TFunction;
  zones: Zone[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: HolidayForm) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  return (
    <FormModal
      title={t('holidays.new')}
      submitLabel={t('holidays.add')}
      saving={saving}
      canSubmit={Boolean(form.name.trim() && form.date)}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <input
        autoFocus
        placeholder={t('holidays.namePlaceholder')}
        className="pm-field"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <input
        type="date"
        className="pm-field"
        value={form.date}
        onChange={(event) => setForm({ ...form, date: event.target.value })}
      />
      <select
        className="pm-field"
        value={form.country}
        onChange={(event) => setForm({ ...form, country: event.target.value as Country, locality: '' })}
      >
        <option value="PT">{t('country.PT')}</option>
        <option value="ES">{t('country.ES')}</option>
      </select>
      {form.country === 'PT' ? (
        <input
          placeholder={t('holidays.ptLocality')}
          className="pm-field"
          value={form.locality}
          onChange={(event) => setForm({ ...form, locality: event.target.value })}
        />
      ) : (
        <select
          className="pm-field"
          value={form.locality}
          onChange={(event) => setForm({ ...form, locality: event.target.value })}
        >
          <option value="">{t('holidays.esRegion')}</option>
          {SPANISH_REGIONS.map((region) => (
            <option key={region.code} value={region.code}>
              {region.name}
            </option>
          ))}
        </select>
      )}
      <select
        className="col-span-2 pm-field"
        value={form.zoneId}
        onChange={(event) => setForm({ ...form, zoneId: event.target.value })}
      >
        <option value="">{t('holidays.noZone')}</option>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {t('holidays.zoneClosure', { zone: zone.name })}
          </option>
        ))}
      </select>
    </FormModal>
  );
}

// Introdução de regra recorrente (projectada para qualquer ano) — ver FormModal.
function HolidayRuleFormModal({
  t,
  localities,
  saving,
  onCancel,
  onSubmit,
}: {
  t: TFunction;
  localities: string[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: RuleForm) => void;
}) {
  const [form, setForm] = useState(EMPTY_RULE_FORM);

  return (
    <FormModal
      title={t('holidays.rules.new')}
      submitLabel={t('holidays.rules.add')}
      saving={saving}
      canSubmit={Boolean(form.name.trim() && form.locality.trim())}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <input
        autoFocus
        list="pt-concelhos-regras"
        placeholder={t('holidays.rules.locality')}
        className="pm-field"
        value={form.locality}
        onChange={(event) => setForm({ ...form, locality: event.target.value })}
      />
      <datalist id="pt-concelhos-regras">
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

interface HolidaySectionProps {
  t: TFunction;
  title: string;
  hint?: string;
  holidays: Holiday[];
  canManageHolidays: boolean;
  onDelete: (id: string) => void;
  localityLabel?: (holiday: Holiday) => string;
}

// Uma secção (tabela) por âmbito de feriado — reutilizada pelas 4 categorias da página.
function HolidaySection({ t, title, hint, holidays, canManageHolidays, onDelete, localityLabel }: HolidaySectionProps) {
  // holiday.date é ISO (AAAA-MM-DD): ordena cronologicamente já como texto, ao contrário
  // do DD/MM/AAAA que a célula mostra.
  const holidaySort = useMemo<SortAccessors<Holiday, HolidaySortKey>>(
    () => ({
      date: (holiday) => holiday.date,
      name: (holiday) => holiday.name,
      locality: (holiday) => localityLabel?.(holiday) ?? null,
      source: (holiday) =>
        holiday.source.startsWith('manual') ? t('holidays.source.manual') : t('holidays.source.auto'),
    }),
    [localityLabel, t],
  );

  const { rows: visibleHolidays, sortableProps } = useTableSort(holidays, holidaySort, 'date');

  return (
    <Card padded={false} title={title} subtitle={hint}>
      {holidays.length === 0 ? (
        <EmptyState size="compact">{t('holidays.emptyCategory')}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="pm-table">
            <thead>
              <tr>
                <SortableTh {...sortableProps('date')}>{t('common.date')}</SortableTh>
                <SortableTh {...sortableProps('name')}>{t('common.name')}</SortableTh>
                {localityLabel && <SortableTh {...sortableProps('locality')}>{t('common.locality')}</SortableTh>}
                <SortableTh {...sortableProps('source')}>{t('holidays.col.source')}</SortableTh>
                <th className="py-1.5 pr-2" />
              </tr>
            </thead>
            <tbody>
              {visibleHolidays.map((holiday) => (
                <tr key={holiday.id}>
                  <td className="py-1.5 pr-2 tabular-nums">{toDisplayDate(holiday.date)}</td>
                  <td className="py-1.5 pr-2 font-medium text-gray-800">{holiday.name}</td>
                  {localityLabel && <td className="py-1.5 pr-2">{localityLabel(holiday)}</td>}
                  <td className="py-1.5 pr-2 text-xs text-gray-400">
                    {holiday.source.startsWith('manual') ? t('holidays.source.manual') : t('holidays.source.auto')}
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    {canManageHolidays && (
                      <Button variant="dangerGhost" size="sm" onClick={() => onDelete(holiday.id)}>
                        {t('common.delete')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// Feriados por zona (secção: "os feriados de cada zona têm de ser reflectidos e
// marcados no calendário"). Organizados em 4 categorias: nacionais PT/ES (vêm
// automaticamente da Nager.Date) e locais PT / regionais ES — só mostrados onde há
// equipamento real, já que um feriado municipal/regional só importa onde há máquinas.
export function Holidays() {
  const t = useT();
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
  const [creatingHoliday, setCreatingHoliday] = useState(false);
  const [creatingRule, setCreatingRule] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  useEffect(() => {
    fetchZones();
    fetchEquipment();
    fetchHolidayRules();
  }, [fetchZones, fetchEquipment, fetchHolidayRules]);

  // Só mostra feriados locais/regionais de localidades onde existe equipamento real —
  // um feriado de uma região sem nenhuma máquina lá não interessa ao planeamento.
  const activeLocalities = useMemo(() => computeActiveLocalities(equipment), [equipment]);

  // A procura corta transversalmente as 4 categorias e as regras: filtra-se antes de
  // separar por âmbito, para o mesmo texto valer em toda a página.
  const sorted = [...holidays]
    .filter((holiday) =>
      matchesSearch(searchText, [
        toDisplayDate(holiday.date),
        holiday.date,
        holiday.name,
        holiday.locality,
        // A coluna mostra o nome da região em ES; procura-se tanto por "ES-GA" como por
        // "Galiza", já que o código anda nos ficheiros e o nome anda no ecrã.
        holiday.locality ? spanishRegionName(holiday.locality) : null,
        holiday.source.startsWith('manual') ? t('holidays.source.manual') : t('holidays.source.auto'),
      ]),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const nationalPT = sorted.filter((h) => h.country === 'PT' && !h.locality);
  const nationalES = sorted.filter((h) => h.country === 'ES' && !h.locality);
  const localPT = sorted.filter((h) => h.country === 'PT' && h.locality && activeLocalities.pt.has(h.locality));
  const regionalES = sorted.filter((h) => h.country === 'ES' && h.locality && activeLocalities.es.has(h.locality));

  async function handleCreate(form: HolidayForm) {
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
      setCreatingHoliday(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('holidays.createFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteHoliday(id);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('holidays.deleteFailed') });
    }
  }

  // Só mostra regras de localidades onde já há equipamento — as restantes ~300 (de
  // concelhos sem máquinas) ficam disponíveis na BD mas não poluem esta lista.
  const filteredRules = useMemo(
    () =>
      holidayRules
        .filter((rule) => activeLocalities.pt.has(rule.locality) || activeLocalities.es.has(rule.locality))
        .filter((rule) => matchesSearch(searchText, [rule.locality, rule.name, describeRule(rule, t)])),
    [holidayRules, activeLocalities, searchText, t],
  );

  const { rows: visibleRules, sortableProps: ruleSortableProps } = useTableSort(filteredRules, RULE_SORT, 'locality');

  // Concelhos já conhecidos, para sugerir no campo do modal de regras.
  const ruleLocalities = [...new Set(holidayRules.map((rule) => rule.locality))].sort();

  async function handleCreateRule(ruleForm: RuleForm) {
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
      setCreatingRule(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('holidays.rules.createFailed') });
    } finally {
      setSavingRule(false);
    }
  }

  async function handleDeleteRule(id: string) {
    try {
      await deleteHolidayRule(id);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('holidays.rules.deleteFailed') });
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={t('holidays.title')}
        description={t('holidays.description')}
        actions={canManageHolidays && <Button onClick={() => setCreatingHoliday(true)}>{t('holidays.add')}</Button>}
      />

      {/* Ano e procura numa barra só: a procura aplica-se às 4 categorias e às regras em
          simultâneo, por isso pertence ao topo da página e não a cada secção. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          {t('common.year')}
          <select className="pm-field" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {YEAR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <SearchInput value={searchText} onChange={setSearchText} placeholder={t('contacts.searchPlaceholder')} />
      </div>

      <div className="flex flex-col gap-4">
        <HolidaySection
          t={t}
          title={t('holidays.nationalPT')}
          holidays={nationalPT}
          canManageHolidays={canManageHolidays}
          onDelete={handleDelete}
        />
        <HolidaySection
          t={t}
          title={t('holidays.nationalES')}
          holidays={nationalES}
          canManageHolidays={canManageHolidays}
          onDelete={handleDelete}
        />
        <HolidaySection
          t={t}
          title={t('holidays.localPT')}
          hint={t('holidays.localPTHint')}
          holidays={localPT}
          canManageHolidays={canManageHolidays}
          onDelete={handleDelete}
          localityLabel={ptLocalityLabel}
        />
        <HolidaySection
          t={t}
          title={t('holidays.regionalES')}
          hint={t('holidays.regionalESHint')}
          holidays={regionalES}
          canManageHolidays={canManageHolidays}
          onDelete={handleDelete}
          localityLabel={esLocalityLabel}
        />

        {/* O botão fica nesta secção, e não no topo da página, porque uma regra
            recorrente é outra coisa que não um feriado manual — separar evita
            adicionar-se uma julgando estar a adicionar a outra. */}
        <Card
          padded={false}
          title={t('holidays.rules.title')}
          subtitle={t('holidays.rules.subtitle')}
          actions={
            canManageHolidays && (
              <Button variant="secondary" onClick={() => setCreatingRule(true)}>
                {t('holidays.rules.add')}
              </Button>
            )
          }
        >
          {visibleRules.length === 0 ? (
            <EmptyState size="compact">{t('holidays.rules.empty')}</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="pm-table">
                <thead>
                  <tr>
                    <SortableTh {...ruleSortableProps('locality')}>{t('holidays.rules.locality')}</SortableTh>
                    <SortableTh {...ruleSortableProps('name')}>{t('common.name')}</SortableTh>
                    <SortableTh {...ruleSortableProps('recurrence')}>{t('holidays.rules.recurrence')}</SortableTh>
                    <th className="py-1.5 pr-2" />
                  </tr>
                </thead>
                <tbody>
                  {visibleRules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="py-1.5 pr-2">{rule.locality}</td>
                      <td className="py-1.5 pr-2 font-medium text-gray-800">{rule.name}</td>
                      <td className="py-1.5 pr-2 text-xs text-gray-400">{describeRule(rule, t)}</td>
                      <td className="py-1.5 pr-2 text-right">
                        {canManageHolidays && (
                          <Button variant="dangerGhost" size="sm" onClick={() => handleDeleteRule(rule.id)}>
                            {t('common.delete')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {creatingHoliday && (
        <HolidayFormModal
          t={t}
          zones={zones}
          saving={saving}
          onCancel={() => setCreatingHoliday(false)}
          onSubmit={handleCreate}
        />
      )}

      {creatingRule && (
        <HolidayRuleFormModal
          t={t}
          localities={ruleLocalities}
          saving={savingRule}
          onCancel={() => setCreatingRule(false)}
          onSubmit={handleCreateRule}
        />
      )}
    </PageShell>
  );
}
