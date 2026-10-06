import { Fragment, useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { buildHospitalExportRows, parseHospitalImportRows } from '../lib/importers/hospitalImportExport';
import type { HospitalImportRow } from '../lib/importers/hospitalImportExport';
import type { ImportAliases } from '../lib/importers/importHelpers';
import { SPANISH_REGIONS, spanishRegionName } from '../lib/spanishRegions';
import { exportRowsToSpreadsheet, readSpreadsheetFile } from '../lib/spreadsheet';
import type { ParsedImportRow } from '../lib/spreadsheet';
import { getLeafZones } from '../lib/zoneTree';
import {
  useAuthStore,
  useContactStore,
  useHolidayRuleStore,
  useHospitalStore,
  useSignedDocumentStore,
  useUiStore,
  useZoneStore,
} from '../stores';
import type { Country, HospitalContact, HospitalWithZone, Zone } from '../types';
import { HospitalContactsModal } from '../components/modals/HospitalContactsModal';
import { ImportPreviewModal } from '../components/modals/ImportPreviewModal';
import { HospitalSignedDocuments, UnmatchedSignedDocuments } from '../components/documents';
import { matchesSearch } from '../lib/searchText';
import { useTableSort } from '../hooks';
import type { SortAccessors } from '../hooks';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormModal,
  ImportExportButtons,
  PageHeader,
  SearchInput,
  SortableTh,
} from '../components/ui';
import { useT, type TFunction, type TranslationKey } from '../i18n';

const EMPTY_FORM = {
  name: '',
  shortName: '',
  country: 'PT' as Country,
  locality: '',
  city: '',
  zoneId: '',
  letterName: '',
  address: '',
  postalCode: '',
  elektaId: '',
};

const COUNTRY_LABEL_KEYS: Record<Country, TranslationKey> = { PT: 'country.PT', ES: 'country.ES' };

type HospitalSortKey =
  | 'name'
  | 'shortName'
  | 'letterName'
  | 'country'
  | 'locality'
  | 'city'
  | 'address'
  | 'elektaId'
  | 'zone'
  | 'contacts';

/** Localidade como a coluna a mostra: o concelho em PT, o nome da Comunidade Autónoma
 *  em ES ("Galiza" e não "ES-GA", que é o código que a Nager.Date usa). */
function localityLabel(hospital: HospitalWithZone): string | null {
  if (!hospital.locality) return null;
  return hospital.country === 'ES' ? spanishRegionName(hospital.locality) : hospital.locality;
}

/** Nomes dos contactos de um hospital, como a coluna os mostra. */
function contactNames(contacts: HospitalContact[]): string {
  return contacts.map((contact) => contact.name).join(', ');
}

// Ordenação pelo que a célula mostra, e não pelo que está guardado. Os contactos deixaram
// de vir dentro do hospital (migração 0021, tabela hospital_contacts), por isso a coluna
// que os mostra ordena-se por um mapa construído a partir da store dos contactos.
function hospitalSortAccessors(
  contactsByHospital: Map<string, HospitalContact[]>,
): SortAccessors<HospitalWithZone, HospitalSortKey> {
  return {
    name: (hospital) => hospital.name,
    shortName: (hospital) => hospital.short_name,
    letterName: (hospital) => hospital.letter_name,
    country: (hospital) => hospital.country,
    locality: localityLabel,
    city: (hospital) => hospital.city,
    address: (hospital) => hospital.address,
    elektaId: (hospital) => hospital.elekta_id,
    zone: (hospital) => hospital.zone_code,
    contacts: (hospital) => contactNames(contactsByHospital.get(hospital.id) ?? []),
  };
}

// Procura sobre tudo o que a linha mostra, mais o que está por trás do que mostra: o
// país também pelo nome por extenso ("Portugal" encontra as linhas com "PT"), a zona
// também pelo nome (a coluna só tem o código) e os contactos por inteiro — na tabela
// aparecem só os nomes, mas quem procura por um email ou por um cargo quer chegar ao
// hospital onde essa pessoa está registada.
function hospitalSearchFields(
  hospital: HospitalWithZone,
  contacts: HospitalContact[],
  t: TFunction,
): (string | null)[] {
  return [
    hospital.name,
    hospital.short_name,
    hospital.letter_name,
    hospital.address,
    hospital.postal_code,
    hospital.elekta_id,
    hospital.country,
    t(COUNTRY_LABEL_KEYS[hospital.country]),
    localityLabel(hospital),
    hospital.city,
    hospital.zone_code,
    hospital.zone_name,
    ...contacts.flatMap((contact) => [contact.name, contact.role, contact.email, contact.phone]),
  ];
}

// PT: concelho em texto livre, sugerido por datalist a partir dos concelhos com regra de
// feriado municipal já conhecida (holiday_rules) — escolher um destes garante que o
// feriado fica logo associado, sem precisar de mais nenhum passo. ES: Comunidade
// Autónoma por selector — o código tem de bater certo com o que a Nager.Date usa em
// "counties" para os feriados regionais casarem automaticamente.
function LocalityField({
  t,
  country,
  value,
  onChange,
}: {
  t: TFunction;
  country: Country;
  value: string;
  onChange: (value: string) => void;
}) {
  if (country === 'PT') {
    // datalist partilhado, definido uma única vez no componente pai (ver "pt-concelhos"
    // abaixo) — dois <input list="pt-concelhos"> em simultâneo (criar + editar) não
    // podem ter cada um o seu próprio <datalist> com o mesmo id (HTML inválido).
    return (
      <input
        list="pt-concelhos"
        placeholder={t('hospitals.field.ptLocality')}
        className="pm-field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <select
      className="pm-field"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{t('hospitals.field.esRegion')}</option>
      {SPANISH_REGIONS.map((region) => (
        <option key={region.code} value={region.code}>
          {region.name}
        </option>
      ))}
    </select>
  );
}

// Zona-mãe (ex: "Northwest") agrupa zonas-filhas (ex: Galiza, Canárias) só para
// atribuição de engenheiros — hospitais ficam sempre numa zona-folha (leafZones), mas o
// selector mostra a zona-mãe como agrupamento visual para ser fácil perceber a que
// "família" cada zona-folha pertence. Zonas-folha sem mãe (topo da hierarquia) ficam
// fora de qualquer optgroup.
function ZoneSelect({
  value,
  onChange,
  leafZones,
  zones,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  leafZones: Zone[];
  zones: Zone[];
  placeholder?: string;
}) {
  const ungrouped = leafZones.filter((zone) => !zone.parent_zone_id);
  const groups = new Map<string, { parentName: string; children: Zone[] }>();
  for (const zone of leafZones) {
    if (!zone.parent_zone_id) continue;
    const parent = zones.find((candidate) => candidate.id === zone.parent_zone_id);
    if (!parent) continue;
    const group = groups.get(parent.id) ?? { parentName: parent.name, children: [] };
    group.children.push(zone);
    groups.set(parent.id, group);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => a.parentName.localeCompare(b.parentName));

  return (
    <select
      className="pm-field"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {ungrouped.map((zone) => (
        <option key={zone.id} value={zone.id}>
          {zone.name}
        </option>
      ))}
      {sortedGroups.map((group) => (
        <optgroup key={group.parentName} label={group.parentName}>
          {group.children.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

type HospitalForm = typeof EMPTY_FORM;

// Introdução de novo hospital — em modal, para a lista não ficar permanentemente empurrada
// para baixo por um formulário que só se usa de vez em quando. Estado próprio: como só é
// montado enquanto está aberto, cada abertura começa com os campos limpos.
function HospitalFormModal({
  t,
  leafZones,
  zones,
  saving,
  onCancel,
  onSubmit,
}: {
  t: TFunction;
  leafZones: Zone[];
  zones: Zone[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: HospitalForm) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  return (
    <FormModal
      title={t('hospitals.new')}
      saving={saving}
      canSubmit={Boolean(form.name.trim() && form.zoneId)}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <input
        autoFocus
        placeholder={t('common.name')}
        className="col-span-2 pm-field"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <input
        placeholder={t('hospitals.field.shortName')}
        className="pm-field"
        value={form.shortName}
        onChange={(event) => setForm({ ...form, shortName: event.target.value })}
      />
      <select
        className="pm-field"
        value={form.country}
        onChange={(event) => setForm({ ...form, country: event.target.value as Country, locality: '', city: '' })}
      >
        <option value="PT">{t('country.PT')}</option>
        <option value="ES">{t('country.ES')}</option>
      </select>
      <LocalityField
        t={t}
        country={form.country}
        value={form.locality}
        onChange={(locality) => setForm({ ...form, locality })}
      />
      {form.country === 'ES' && (
        <input
          placeholder={t('hospitals.field.city')}
          className="pm-field"
          value={form.city}
          onChange={(event) => setForm({ ...form, city: event.target.value })}
        />
      )}
      <ZoneSelect
        value={form.zoneId}
        onChange={(zoneId) => setForm({ ...form, zoneId })}
        leafZones={leafZones}
        zones={zones}
        placeholder={t('hospitals.field.zoneRequired')}
      />
      {/* Dados da lista do cliente (migração 0021) — opcionais. */}
      <input
        placeholder={t('hospitals.field.letterName')}
        className="col-span-2 pm-field"
        value={form.letterName}
        onChange={(event) => setForm({ ...form, letterName: event.target.value })}
      />
      <input
        placeholder={t('hospitals.field.address')}
        className="col-span-2 pm-field"
        value={form.address}
        onChange={(event) => setForm({ ...form, address: event.target.value })}
      />
      <input
        placeholder={t('hospitals.field.postalCode')}
        className="pm-field"
        value={form.postalCode}
        onChange={(event) => setForm({ ...form, postalCode: event.target.value })}
      />
      <input
        placeholder={t('hospitals.field.elektaId')}
        className="pm-field"
        value={form.elektaId}
        onChange={(event) => setForm({ ...form, elektaId: event.target.value })}
      />
    </FormModal>
  );
}

// CRUD clientes/hospitais (secção 3) — zona é sempre obrigatória (secção 4: é a origem da
// hierarquia; equipment.zone_id deriva sempre de hospitals.zone_id). País fica aqui (não
// na zona): a mesma zona pode agrupar hospitais de PT e de ES. Gestão exclusiva do admin.
export function Clients() {
  const t = useT();
  const canManageHospitals = useAuthStore((state) => state.permissions.canManageHospitals);
  // Documentos assinados fazem parte das aprovações — só admin (migração 0028).
  const canViewSignedDocuments = useAuthStore((state) => state.permissions.canApproveSchedule);
  const hospitals = useHospitalStore((state) => state.hospitals);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const createHospital = useHospitalStore((state) => state.createHospital);
  const updateHospital = useHospitalStore((state) => state.updateHospital);
  const deleteHospital = useHospitalStore((state) => state.deleteHospital);
  const bulkImportHospitals = useHospitalStore((state) => state.bulkImportHospitals);
  const zones = useZoneStore((state) => state.zones);
  const fetchZones = useZoneStore((state) => state.fetchZones);
  const pushToast = useUiStore((state) => state.pushToast);
  const holidayRules = useHolidayRuleStore((state) => state.rules);
  const fetchHolidayRules = useHolidayRuleStore((state) => state.fetchRules);
  const contacts = useContactStore((state) => state.contacts);
  const fetchContacts = useContactStore((state) => state.fetchContacts);
  const signedDocuments = useSignedDocumentStore((state) => state.documents);
  const fetchSignedDocuments = useSignedDocumentStore((state) => state.fetchSignedDocuments);

  const [creating, setCreating] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  // Guarda-se o ficheiro em cru (e não as linhas já validadas): as correspondências
  // escolhidas na pré-visualização obrigam a validar tudo outra vez.
  const [importRaw, setImportRaw] = useState<Record<string, string>[] | null>(null);
  const [importAliases, setImportAliases] = useState<ImportAliases>({});
  const [importing, setImporting] = useState(false);
  const [contactsHospitalId, setContactsHospitalId] = useState<string | null>(null);
  // Hospital com o arquivo de documentos assinados aberto (linha expandida por baixo).
  const [documentsHospitalId, setDocumentsHospitalId] = useState<string | null>(null);

  const leafZones = useMemo(() => getLeafZones(zones), [zones]);

  const importRows = useMemo(
    () => (importRaw ? parseHospitalImportRows(importRaw, leafZones, hospitals, importAliases) : null),
    [importRaw, leafZones, hospitals, importAliases],
  );

  const ptLocalities = useMemo(
    () =>
      [...new Set(holidayRules.filter((rule) => rule.country === 'PT').map((rule) => rule.locality))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [holidayRules],
  );

  // Contactos agrupados por hospital — servem a coluna, a ordenação e a procura.
  const contactsByHospital = useMemo(() => {
    const byHospital = new Map<string, HospitalContact[]>();
    for (const contact of contacts) {
      const list = byHospital.get(contact.hospital_id);
      if (list) list.push(contact);
      else byHospital.set(contact.hospital_id, [contact]);
    }
    return byHospital;
  }, [contacts]);

  // Filtro de texto sobre a lista, campo a campo (ver hospitalSearchFields).
  const filteredHospitals = useMemo(
    () =>
      hospitals.filter((hospital) =>
        matchesSearch(searchText, hospitalSearchFields(hospital, contactsByHospital.get(hospital.id) ?? [], t)),
      ),
    [hospitals, contactsByHospital, searchText, t],
  );

  const hospitalSort = useMemo(() => hospitalSortAccessors(contactsByHospital), [contactsByHospital]);

  // A lista chega da BD por nome — é essa a ordenação inicial, para a coluna activa
  // dizer a verdade sobre o que se está a ver logo à entrada.
  const { rows: visibleHospitals, sortableProps } = useTableSort(filteredHospitals, hospitalSort, 'name');

  useEffect(() => {
    fetchHospitals();
    fetchContacts();
    fetchZones();
    fetchHolidayRules();
    // Documentos assinados devolvidos pelos clientes — arquivados a partir das respostas
    // à carta de assinatura (Edge Function inbound-signed-document).
    if (canViewSignedDocuments) fetchSignedDocuments();
  }, [fetchHospitals, fetchContacts, fetchZones, fetchHolidayRules, fetchSignedDocuments, canViewSignedDocuments]);

  async function handleCreate(form: HospitalForm) {
    if (!form.name || !form.zoneId) return;
    setSaving(true);
    try {
      await createHospital({
        name: form.name,
        short_name: form.shortName || null,
        letter_name: form.letterName.trim() || null,
        address: form.address.trim() || null,
        postal_code: form.postalCode.trim() || null,
        elekta_id: form.elektaId.trim() || null,
        country: form.country,
        locality: form.locality || null,
        city: form.country === 'ES' ? form.city || null : null,
        zone_id: form.zoneId,
        contacts: [],
        active: true,
      });
      setCreating(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('hospitals.createFailed') });
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    exportRowsToSpreadsheet(buildHospitalExportRows(hospitals), 'pmplan-hospitais.xlsx', 'Hospitais');
  }

  async function handleFileSelected(file: File) {
    try {
      const raw = await readSpreadsheetFile(file);
      setImportAliases({});
      setImportRaw(raw);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('import.readFileFailed') });
    }
  }

  function closeImport() {
    setImportRaw(null);
    setImportAliases({});
  }

  async function handleConfirmImport() {
    if (!importRows) return;
    const validRows = importRows
      .filter((row): row is ParsedImportRow<HospitalImportRow> & { data: HospitalImportRow } => row.data !== null)
      .map((row) => ({
        rowNumber: row.rowNumber,
        existingId: row.data.existingId,
        insert: row.data.insert,
        update: row.data.update,
      }));

    setImporting(true);
    try {
      const { created, updated, errors } = await bulkImportHospitals(validRows);
      pushToast({
        variant: errors.length > 0 ? 'warning' : 'success',
        message:
          errors.length > 0
            ? t('hospitals.importedWithErrors', {
                created,
                updated,
                failed: errors.length,
                rows: errors.map((e) => t('import.rowNumber', { row: e.rowNumber })).join(', '),
              })
            : t('hospitals.imported', { created, updated }),
      });
      closeImport();
    } finally {
      setImporting(false);
    }
  }

  function startEdit(hospital: {
    id: string;
    name: string;
    short_name: string | null;
    country: Country;
    locality: string | null;
    city: string | null;
    zone_id: string;
    letter_name: string | null;
    address: string | null;
    postal_code: string | null;
    elekta_id: string | null;
  }) {
    setEditingId(hospital.id);
    setEditForm({
      name: hospital.name,
      shortName: hospital.short_name ?? '',
      country: hospital.country,
      locality: hospital.locality ?? '',
      city: hospital.city ?? '',
      zoneId: hospital.zone_id,
      letterName: hospital.letter_name ?? '',
      address: hospital.address ?? '',
      postalCode: hospital.postal_code ?? '',
      elektaId: hospital.elekta_id ?? '',
    });
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.name || !editForm.zoneId) return;
    setSaving(true);
    try {
      await updateHospital(id, {
        name: editForm.name,
        short_name: editForm.shortName || null,
        country: editForm.country,
        locality: editForm.locality || null,
        city: editForm.country === 'ES' ? editForm.city || null : null,
        zone_id: editForm.zoneId,
        letter_name: editForm.letterName.trim() || null,
        address: editForm.address.trim() || null,
        postal_code: editForm.postalCode.trim() || null,
        elekta_id: editForm.elektaId.trim() || null,
      });
      setEditingId(null);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('hospitals.updateFailed') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell wide>
      <datalist id="pt-concelhos">
        {ptLocalities.map((locality) => (
          <option key={locality} value={locality} />
        ))}
      </datalist>

      <PageHeader
        title={t('hospitals.title')}
        description={t('hospitals.description')}
        actions={
          canManageHospitals && (
            <>
              <ImportExportButtons onExport={handleExport} onFileSelected={handleFileSelected} />
              <Button onClick={() => setCreating(true)}>{t('hospitals.add')}</Button>
            </>
          )
        }
      />

      {/* Documentos assinados que chegaram sem hospital identificado — no topo, porque
          ficarem esquecidos numa fila que ninguém vê é a única forma de este mecanismo
          falhar em silêncio. Só aparece quando existe algum. */}
      {canViewSignedDocuments && <UnmatchedSignedDocuments />}

      <Card
        padded={false}
        title={t('hospitals.count', { count: filteredHospitals.length })}
        actions={
          <SearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder={t('contacts.searchPlaceholder')}
            className="w-72"
          />
        }
      >
        <div className="overflow-x-auto">
        <table className="pm-table">
          <thead>
            <tr>
              <SortableTh {...sortableProps('name')}>{t('common.name')}</SortableTh>
              <SortableTh {...sortableProps('shortName')}>{t('hospitals.col.shortName')}</SortableTh>
              <SortableTh {...sortableProps('letterName')}>{t('hospitals.col.letterName')}</SortableTh>
              <SortableTh {...sortableProps('country')}>{t('common.country')}</SortableTh>
              <SortableTh {...sortableProps('locality')}>{t('common.locality')}</SortableTh>
              <SortableTh {...sortableProps('city')}>{t('common.city')}</SortableTh>
              <SortableTh {...sortableProps('address')}>{t('hospitals.col.address')}</SortableTh>
              <SortableTh {...sortableProps('elektaId')}>{t('hospitals.col.elektaId')}</SortableTh>
              <SortableTh {...sortableProps('zone')}>{t('common.zone')}</SortableTh>
              <SortableTh {...sortableProps('contacts')}>{t('common.contacts')}</SortableTh>
              <th className="py-1.5 pr-2" />
            </tr>
          </thead>
          <tbody>
            {visibleHospitals.map((hospital) => {
              const editing = editingId === hospital.id;
              const documentsOpen = documentsHospitalId === hospital.id;
              const documentCount = signedDocuments.filter(
                (document) => document.hospital_id === hospital.id,
              ).length;
              return (
                <Fragment key={hospital.id}>
                <tr>
                  {editing ? (
                    <>
                      <td className="py-1.5 pr-2">
                        <input
                          className="pm-field w-full"
                          value={editForm.name}
                          onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          className="pm-field w-full"
                          value={editForm.shortName}
                          onChange={(event) => setEditForm({ ...editForm, shortName: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          className="pm-field w-full"
                          placeholder={t('hospitals.field.letterName')}
                          value={editForm.letterName}
                          onChange={(event) => setEditForm({ ...editForm, letterName: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <select
                          className="pm-field"
                          value={editForm.country}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              country: event.target.value as Country,
                              locality: '',
                              city: '',
                            })
                          }
                        >
                          <option value="PT">{t('country.PT')}</option>
                          <option value="ES">{t('country.ES')}</option>
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <LocalityField
                          t={t}
                          country={editForm.country}
                          value={editForm.locality}
                          onChange={(locality) => setEditForm({ ...editForm, locality })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        {editForm.country === 'ES' && (
                          <input
                            placeholder={t('common.city')}
                            className="pm-field w-full"
                            value={editForm.city}
                            onChange={(event) => setEditForm({ ...editForm, city: event.target.value })}
                          />
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="flex flex-col gap-1">
                          <input
                            className="pm-field w-full"
                            placeholder={t('hospitals.field.address')}
                            value={editForm.address}
                            onChange={(event) => setEditForm({ ...editForm, address: event.target.value })}
                          />
                          <input
                            className="pm-field w-28"
                            placeholder={t('hospitals.field.postalCode')}
                            value={editForm.postalCode}
                            onChange={(event) => setEditForm({ ...editForm, postalCode: event.target.value })}
                          />
                        </div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          className="pm-field w-24"
                          placeholder={t('hospitals.field.elektaId')}
                          value={editForm.elektaId}
                          onChange={(event) => setEditForm({ ...editForm, elektaId: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <ZoneSelect
                          value={editForm.zoneId}
                          onChange={(zoneId) => setEditForm({ ...editForm, zoneId })}
                          leafZones={leafZones}
                          zones={zones}
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-xs text-gray-400">
                        {contactNames(contactsByHospital.get(hospital.id) ?? []) || '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="secondary" size="sm" onClick={() => setEditingId(null)} disabled={saving}>
                            {t('common.cancel')}
                          </Button>
                          <Button size="sm" onClick={() => handleSaveEdit(hospital.id)} disabled={saving}>
                            {t('common.save')}
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2">{hospital.name}</td>
                      <td className="py-1.5 pr-2">{hospital.short_name}</td>
                      <td className="py-1.5 pr-2 text-xs">{hospital.letter_name ?? '—'}</td>
                      <td className="py-1.5 pr-2">{hospital.country}</td>
                      <td className="py-1.5 pr-2">
                        {hospital.locality
                          ? hospital.country === 'ES'
                            ? spanishRegionName(hospital.locality)
                            : hospital.locality
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-2">{hospital.city ?? '—'}</td>
                      <td className="py-1.5 pr-2 text-xs">
                        {hospital.address || hospital.postal_code ? (
                          <>
                            {hospital.address && <div>{hospital.address}</div>}
                            {hospital.postal_code && <div className="text-gray-500">{hospital.postal_code}</div>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-xs">{hospital.elekta_id ?? '—'}</td>
                      <td className="py-1.5 pr-2">
                        <Badge variant="neutral">{hospital.zone_code}</Badge>
                      </td>
                      <td className="py-1.5 pr-2">
                        {contactNames(contactsByHospital.get(hospital.id) ?? []) || '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <div className="flex justify-end gap-1">
                          {/* Documentos assinados são parte das aprovações — só para quem
                              as vê (admin), mesmo que não seja preciso editar o hospital. */}
                          {canViewSignedDocuments && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDocumentsHospitalId(documentsOpen ? null : hospital.id)}
                            >
                              {t('hospitals.documents')}
                              {documentCount > 0 ? ` (${documentCount})` : ''}
                            </Button>
                          )}
                          {canManageHospitals && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => setContactsHospitalId(hospital.id)}>
                                {t('common.contacts')}
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => startEdit(hospital)}>
                                {t('common.edit')}
                              </Button>
                              <Button variant="dangerGhost" size="sm" onClick={() => deleteHospital(hospital.id)}>
                                {t('common.delete')}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
                {documentsOpen && !editing && canViewSignedDocuments && (
                  <tr className="pm-row-detail bg-gray-50">
                    <td colSpan={11} className="p-2">
                      <HospitalSignedDocuments hospitalId={hospital.id} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>

        {filteredHospitals.length === 0 && (
          <EmptyState
            action={
              hospitals.length === 0 && canManageHospitals ? (
                <Button onClick={() => setCreating(true)}>{t('hospitals.add')}</Button>
              ) : undefined
            }
          >
            {hospitals.length === 0 ? t('hospitals.empty') : t('hospitals.noMatch')}
          </EmptyState>
        )}
      </Card>

      {creating && (
        <HospitalFormModal
          t={t}
          leafZones={leafZones}
          zones={zones}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}

      {importRows && (
        <ImportPreviewModal
          title={t('hospitals.importTitle')}
          rows={importRows}
          // Distinguir criação de actualização é o essencial da pré-visualização: uma
          // linha que casa com um hospital existente vai alterá-lo, e isso tem de se ver
          // antes de confirmar.
          renderPreview={(data) =>
            data.existingId
              ? t('hospitals.importUpdate', { name: data.existingName ?? '' })
              : t('hospitals.importNew', { name: data.insert?.name ?? '' })
          }
          importing={importing}
          refOptions={{ zone: leafZones }}
          aliases={importAliases}
          onAliasChange={(key, recordId) => setImportAliases((current) => ({ ...current, [key]: recordId }))}
          onConfirm={handleConfirmImport}
          onClose={closeImport}
        />
      )}

      {contactsHospitalId && (
        <HospitalContactsModal
          hospitalId={contactsHospitalId}
          hospitalName={hospitals.find((hospital) => hospital.id === contactsHospitalId)?.name ?? ''}
          onClose={() => setContactsHospitalId(null)}
        />
      )}
    </PageShell>
  );
}
