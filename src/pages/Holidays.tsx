import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { useHolidays, useTableSort } from '../hooks';
import type { SortAccessors } from '../hooks';
import { computeActiveLocalities } from '../lib/activeLocalities';
import { ruleAppliesToYear } from '../lib/expandHolidayRule';
import { toDisplayDate } from '../lib/dateFormat';
import { spanishRegionName, SPANISH_REGIONS } from '../lib/spanishRegions';
import {
  RULE_SOURCE,
  useAuthStore,
  useEquipmentStore,
  useHolidayRuleStore,
  useHolidayStore,
  useUiStore,
  useZoneStore,
} from '../stores';
import type { Country, Holiday, HolidayRule, Zone } from '../types';
import { matchesSearch } from '../lib/searchText';
import { Button, Card, EmptyState, FormModal, PageHeader, SearchInput, SortableTh } from '../components/ui';
import { HolidayRuleFormModal, HolidayRulesCard, HolidaySourcesNote } from '../components/holidays';
import { spanishCityCalendarUrl } from '../lib/holidayReferenceLinks';
import { describeRule, formToRuleFields, ruleToForm, type HolidayRuleForm } from '../lib/holidayRuleForm';
import { useT, type TFunction } from '../i18n';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

const EMPTY_FORM = { name: '', date: '', country: 'PT' as Country, zoneId: '', locality: '' };

type HolidayForm = typeof EMPTY_FORM;

type HolidaySortKey = 'date' | 'name' | 'locality' | 'source';

/** Regra a criar (rule=null) ou a editar, no país indicado — um modal só serve os dois
 *  cartões de regras (PT e ES). */
type RuleEditing = { country: Country; rule: HolidayRule | null };

// Rótulos da coluna "Localidade" ao nível do módulo (e não em linha no JSX): passam
// para HolidaySection como dependência da ordenação, e uma função nova a cada render
// mandava reordenar a tabela sem nada ter mudado.
const plainLocalityLabel = (holiday: Holiday) => holiday.locality ?? '';
const esRegionLabel = (holiday: Holiday) => (holiday.locality ? spanishRegionName(holiday.locality) : '');

/** holidays.locality em ES guarda tanto códigos de Comunidade Autónoma ("ES-GA") como
 *  nomes de cidade ("Vigo") — os códigos são o que separa uma coisa da outra. */
function isSpanishRegionCode(locality: string): boolean {
  return locality.startsWith('ES-');
}

function sourceLabel(source: string, t: TFunction): string {
  if (source.startsWith('manual')) return t('holidays.source.manual');
  if (source === RULE_SOURCE) return t('holidays.source.rule');
  if (source === 'boe') return t('holidays.source.boe');
  return t('holidays.source.auto');
}

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

interface HolidaySectionProps {
  t: TFunction;
  title: string;
  hint?: string;
  holidays: Holiday[];
  canManageHolidays: boolean;
  onDelete: (id: string) => void;
  localityLabel?: (holiday: Holiday) => string;
}

// Uma secção (tabela) por âmbito de feriado — reutilizada pelas 5 categorias da página.
function HolidaySection({ t, title, hint, holidays, canManageHolidays, onDelete, localityLabel }: HolidaySectionProps) {
  // holiday.date é ISO (AAAA-MM-DD): ordena cronologicamente já como texto, ao contrário
  // do DD/MM/AAAA que a célula mostra.
  const holidaySort = useMemo<SortAccessors<Holiday, HolidaySortKey>>(
    () => ({
      date: (holiday) => holiday.date,
      name: (holiday) => holiday.name,
      locality: (holiday) => localityLabel?.(holiday) ?? null,
      source: (holiday) => sourceLabel(holiday.source, t),
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
                  <td className="py-1.5 pr-2 text-xs text-gray-400">{sourceLabel(holiday.source, t)}</td>
                  <td className="py-1.5 pr-2 text-right">
                    {/* Linhas geradas por regra não se apagam aqui: voltavam no próximo
                        carregamento do ano. Edita-se ou elimina-se a regra. */}
                    {canManageHolidays && holiday.source !== RULE_SOURCE && (
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
// marcados no calendário"). Organizados em 5 categorias: nacionais PT/ES (Nager.Date),
// regionais ES (Comunidades Autónomas) e locais PT (concelhos) / ES (cidades) — só
// mostrados onde há equipamento real, já que um feriado local só importa onde há máquinas.
export function Holidays() {
  const t = useT();
  const canManageHolidays = useAuthStore((state) => state.permissions.canManageHolidays);
  const zones = useZoneStore((state) => state.zones);
  const fetchZones = useZoneStore((state) => state.fetchZones);
  const equipment = useEquipmentStore((state) => state.equipment);
  const fetchEquipment = useEquipmentStore((state) => state.fetchEquipment);
  const createHoliday = useHolidayStore((state) => state.createHoliday);
  const deleteHoliday = useHolidayStore((state) => state.deleteHoliday);
  const syncRuleHolidays = useHolidayStore((state) => state.syncRuleHolidays);
  const boeImports = useHolidayStore((state) => state.boeImports);
  const fetchBoeImport = useHolidayStore((state) => state.fetchBoeImport);
  const pushToast = useUiStore((state) => state.pushToast);
  const holidayRules = useHolidayRuleStore((state) => state.rules);
  const fetchHolidayRules = useHolidayRuleStore((state) => state.fetchRules);
  const createHolidayRule = useHolidayRuleStore((state) => state.createRule);
  const updateHolidayRule = useHolidayRuleStore((state) => state.updateRule);
  const deleteHolidayRule = useHolidayRuleStore((state) => state.deleteRule);

  const [year, setYear] = useState(CURRENT_YEAR);
  const { holidays } = useHolidays(year);
  const [creatingHoliday, setCreatingHoliday] = useState(false);
  const [ruleEditing, setRuleEditing] = useState<RuleEditing | null>(null);
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  useEffect(() => {
    fetchZones();
    fetchEquipment();
    fetchHolidayRules();
  }, [fetchZones, fetchEquipment, fetchHolidayRules]);

  useEffect(() => {
    fetchBoeImport(year);
  }, [fetchBoeImport, year]);

  // Só mostra feriados locais/regionais de localidades onde existe equipamento real —
  // um feriado de uma região sem nenhuma máquina lá não interessa ao planeamento.
  const activeLocalities = useMemo(() => computeActiveLocalities(equipment), [equipment]);
  const activeEsCities = useMemo(
    () => [...activeLocalities.es].filter((locality) => !isSpanishRegionCode(locality)).sort((a, b) => a.localeCompare(b)),
    [activeLocalities],
  );

  // A procura corta transversalmente as 5 categorias e as regras: filtra-se antes de
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
        sourceLabel(holiday.source, t),
      ]),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const nationalPT = sorted.filter((h) => h.country === 'PT' && !h.locality);
  const nationalES = sorted.filter((h) => h.country === 'ES' && !h.locality);
  const localPT = sorted.filter((h) => h.country === 'PT' && h.locality && activeLocalities.pt.has(h.locality));
  const spanishWithLocality = sorted.filter(
    (h): h is Holiday & { locality: string } =>
      h.country === 'ES' && h.locality !== null && activeLocalities.es.has(h.locality),
  );
  const regionalES = spanishWithLocality.filter((h) => isSpanishRegionCode(h.locality));
  const localES = spanishWithLocality.filter((h) => !isSpanishRegionCode(h.locality));

  // Fonte dos regionais ES do ano em vista: BOE (importação automática da VPS) ou, até a
  // resolução sair, a Nager.Date — que erra, e por isso se diz.
  const hasBoeRegionals = holidays.some((h) => h.country === 'ES' && h.source === 'boe');
  const regionalESHint = `${t('holidays.regionalESHint')} ${
    hasBoeRegionals ? t('holidays.regionalES.fromBoe') : t('holidays.regionalES.fromNager', { year })
  }`;
  const boeImport = boeImports[year];
  const esRulesNotice = boeImport
    ? t('holidays.rules.boeImported', {
        year,
        boeId: boeImport.boe_id ?? '',
        date: toDisplayDate(boeImport.ran_at.slice(0, 10)),
      })
    : null;

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
  // Só as versões das regras que valem no ano em vista — é nesse ano que se edita.
  const rulesOfYear = useMemo(
    () => holidayRules.filter((rule) => ruleAppliesToYear(rule, year)),
    [holidayRules, year],
  );
  const visibleRules = useMemo(
    () =>
      rulesOfYear
        .filter((rule) => (rule.country === 'PT' ? activeLocalities.pt : activeLocalities.es).has(rule.locality))
        .filter((rule) => matchesSearch(searchText, [rule.locality, rule.name, describeRule(rule, t)])),
    [rulesOfYear, activeLocalities, searchText, t],
  );
  const ptRules = visibleRules.filter((rule) => rule.country === 'PT');
  const esRules = visibleRules.filter((rule) => rule.country === 'ES');

  // Localidades com equipamento sem nenhuma regra: sem este aviso, uma cidade sem
  // feriados locais simplesmente não aparecia na página e a falta passava despercebida.
  const missingPT = useMemo(() => {
    const withRules = new Set(rulesOfYear.filter((rule) => rule.country === 'PT').map((rule) => rule.locality));
    return [...activeLocalities.pt].filter((locality) => !withRules.has(locality)).sort((a, b) => a.localeCompare(b));
  }, [rulesOfYear, activeLocalities]);
  const missingES = useMemo(() => {
    const withRules = new Set(rulesOfYear.filter((rule) => rule.country === 'ES').map((rule) => rule.locality));
    return activeEsCities.filter((city) => !withRules.has(city));
  }, [rulesOfYear, activeEsCities]);

  // Sugestões do campo de localidade no modal: concelhos já conhecidos (PT) ou as
  // cidades dos hospitais espanhóis (ES), escritas exactamente como em hospitals.city.
  const ptRuleLocalities = useMemo(
    () => [...new Set(holidayRules.filter((rule) => rule.country === 'PT').map((rule) => rule.locality))].sort(),
    [holidayRules],
  );

  async function handleSaveRule(form: HolidayRuleForm) {
    if (!ruleEditing) return;
    const fields = formToRuleFields(form);
    if (!fields.name || !fields.locality) return;
    setSavingRule(true);
    try {
      const previous = ruleEditing.rule;
      const unchanged =
        previous !== null &&
        (Object.keys(fields) as (keyof typeof fields)[]).every((key) => fields[key] === previous[key]);
      if (unchanged) {
        // Guardar sem mexer em nada não pode criar uma versão nova.
      } else if (!previous) {
        // Regra nova: vale a partir do ano em vista (os anteriores já estão fechados).
        const created = await createHolidayRule({
          country: ruleEditing.country,
          ...fields,
          active: true,
          valid_from: year,
          valid_to: null,
        });
        await syncRuleHolidays(null, created);
      } else if (previous.valid_from !== null && previous.valid_from >= year) {
        // A versão começa neste ano (ou depois): não há anos anteriores a proteger.
        await updateHolidayRule(previous.id, fields);
        await syncRuleHolidays(previous, { ...previous, ...fields });
      } else {
        // A versão vem de anos anteriores: fecha-se no ano passado e cria-se outra a
        // partir do ano em vista, para as datas dos anos anteriores não mudarem.
        const closed = { ...previous, valid_to: year - 1 };
        await updateHolidayRule(previous.id, { valid_to: closed.valid_to });
        await syncRuleHolidays(previous, closed);
        const created = await createHolidayRule({
          country: previous.country,
          ...fields,
          active: true,
          valid_from: year,
          valid_to: previous.valid_to,
        });
        await syncRuleHolidays(null, created);
      }
      setRuleEditing(null);
    } catch (err) {
      const fallback = ruleEditing.rule ? t('holidays.rules.updateFailed') : t('holidays.rules.createFailed');
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : fallback });
    } finally {
      setSavingRule(false);
    }
  }

  // Eliminar também é "a partir do ano em vista": os anos anteriores mantêm o feriado.
  async function handleDeleteRule(rule: HolidayRule) {
    try {
      if (rule.valid_from !== null && rule.valid_from >= year) {
        await deleteHolidayRule(rule.id);
        await syncRuleHolidays(rule, null);
      } else {
        const closed = { ...rule, valid_to: year - 1 };
        await updateHolidayRule(rule.id, { valid_to: closed.valid_to });
        await syncRuleHolidays(rule, closed);
      }
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('holidays.rules.deleteFailed') });
    }
  }

  const editingSpanish = ruleEditing?.country === 'ES';

  return (
    <PageShell>
      <PageHeader
        title={t('holidays.title')}
        description={t('holidays.description')}
        actions={canManageHolidays && <Button onClick={() => setCreatingHoliday(true)}>{t('holidays.add')}</Button>}
      />

      <HolidaySourcesNote t={t} year={year} boeImport={boeImport} />

      {/* Ano e procura numa barra só: a procura aplica-se às categorias e às regras em
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
          localityLabel={plainLocalityLabel}
        />
        <HolidaySection
          t={t}
          title={t('holidays.regionalES')}
          hint={regionalESHint}
          holidays={regionalES}
          canManageHolidays={canManageHolidays}
          onDelete={handleDelete}
          localityLabel={esRegionLabel}
        />
        <HolidaySection
          t={t}
          title={t('holidays.localES')}
          hint={t('holidays.localESHint')}
          holidays={localES}
          canManageHolidays={canManageHolidays}
          onDelete={handleDelete}
          localityLabel={plainLocalityLabel}
        />

        <HolidayRulesCard
          t={t}
          title={t('holidays.rules.title')}
          subtitle={t('holidays.rules.subtitle')}
          localityLabel={t('holidays.rules.locality')}
          emptyLabel={t('holidays.rules.empty')}
          rules={ptRules}
          missingLocalities={missingPT}
          canManage={canManageHolidays}
          onAdd={() => setRuleEditing({ country: 'PT', rule: null })}
          onEdit={(rule) => setRuleEditing({ country: 'PT', rule })}
          onDelete={handleDeleteRule}
        />
        <HolidayRulesCard
          t={t}
          title={t('holidays.rules.titleES')}
          subtitle={t('holidays.rules.subtitleES')}
          localityLabel={t('common.city')}
          emptyLabel={t('holidays.rules.emptyES')}
          rules={esRules}
          missingLocalities={missingES}
          notice={esRulesNotice}
          confirmUrl={(rule) => spanishCityCalendarUrl(rule.locality, year)}
          canManage={canManageHolidays}
          onAdd={() => setRuleEditing({ country: 'ES', rule: null })}
          onEdit={(rule) => setRuleEditing({ country: 'ES', rule })}
          onDelete={handleDeleteRule}
        />
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

      {ruleEditing && (
        <HolidayRuleFormModal
          t={t}
          title={
            ruleEditing.rule
              ? t('holidays.rules.editFrom', { year })
              : editingSpanish
                ? t('holidays.rules.newES')
                : t('holidays.rules.new')
          }
          submitLabel={ruleEditing.rule ? t('common.save') : t('holidays.rules.add')}
          localityLabel={editingSpanish ? t('common.city') : t('holidays.rules.locality')}
          localities={editingSpanish ? activeEsCities : ptRuleLocalities}
          initial={ruleEditing.rule ? ruleToForm(ruleEditing.rule) : undefined}
          saving={savingRule}
          onCancel={() => setRuleEditing(null)}
          onSubmit={handleSaveRule}
        />
      )}
    </PageShell>
  );
}
