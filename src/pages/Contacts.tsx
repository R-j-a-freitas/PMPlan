import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { exportRowsToSpreadsheet, readSpreadsheetFile } from '../lib/spreadsheet';
import type { ParsedImportRow } from '../lib/spreadsheet';
import type { ImportAliases } from '../lib/importers/importHelpers';
import {
  buildContactExportRows,
  contactImportPreview,
  parseContactImportRows,
} from '../lib/importers/contactImportExport';
import { useAuthStore, useContactStore, useHospitalStore, useUiStore } from '../stores';
import type { ApprovalTrack, HospitalContact, HospitalContactInsert, HospitalWithZone } from '../types';
import { matchesSearch } from '../lib/searchText';
import { useTableSort } from '../hooks';
import type { SortAccessors } from '../hooks';
import { ImportPreviewModal } from '../components/modals/ImportPreviewModal';
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
import { APPROVAL_TRACK_KEYS } from '../i18n/labels';
import { useT, type TFunction } from '../i18n';

/** Linha da tabela: o contacto mais o hospital a que pertence (o nome do hospital não vem
 *  na tabela `hospital_contacts` — junta-se aqui com a lista da hospitalStore). */
interface ContactRow {
  contact: HospitalContact;
  hospitalName: string;
  zoneName: string;
  trackLabel: string;
}

type ContactSortKey = 'name' | 'role' | 'email' | 'phone' | 'track' | 'hospitalName' | 'zoneName';

const CONTACT_SORT: SortAccessors<ContactRow, ContactSortKey> = {
  name: (row) => row.contact.name,
  role: (row) => row.contact.role,
  email: (row) => row.contact.email,
  phone: (row) => row.contact.phone,
  track: (row) => row.trackLabel,
  hospitalName: (row) => row.hospitalName,
  zoneName: (row) => row.zoneName,
};

interface ContactForm {
  hospitalId: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  mobile: string;
  fax: string;
  /** '' = as duas vias (approval_track a null). */
  track: ApprovalTrack | '';
  isPrimary: boolean;
  active: boolean;
  notes: string;
}

const EMPTY_FORM: ContactForm = {
  hospitalId: '',
  name: '',
  role: '',
  email: '',
  phone: '',
  mobile: '',
  fax: '',
  track: '',
  isPrimary: false,
  active: true,
  notes: '',
};

function formFromContact(contact: HospitalContact): ContactForm {
  return {
    hospitalId: contact.hospital_id,
    name: contact.name,
    role: contact.role ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    mobile: contact.mobile ?? '',
    fax: contact.fax ?? '',
    track: contact.approval_track ?? '',
    isPrimary: contact.is_primary,
    active: contact.active,
    notes: contact.notes ?? '',
  };
}

/** Campos do formulário → linha da BD. Texto vazio grava-se como null, e não como '': a
 *  coluna é opcional e uma string vazia faria "tem email" passar a verdadeiro. */
function toInsert(form: ContactForm): HospitalContactInsert {
  return {
    hospital_id: form.hospitalId,
    name: form.name.trim(),
    role: form.role.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    mobile: form.mobile.trim() || null,
    fax: form.fax.trim() || null,
    approval_track: form.track === '' ? null : form.track,
    is_primary: form.isPrimary,
    active: form.active,
    notes: form.notes.trim() || null,
  };
}

// Criar/editar contacto. Modal e não edição em linha: com dez campos (incluindo via,
// principal e activo) uma linha da tabela ficaria com dez caixas de texto lado a lado.
function ContactFormModal({
  t,
  title,
  hospitals,
  initial,
  saving,
  onCancel,
  onSubmit,
}: {
  t: TFunction;
  title: string;
  hospitals: HospitalWithZone[];
  initial: ContactForm;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: ContactForm) => void;
}) {
  const [form, setForm] = useState(initial);

  return (
    <FormModal
      title={title}
      saving={saving}
      canSubmit={Boolean(form.hospitalId && form.name.trim())}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <select
        className="col-span-2 pm-field"
        value={form.hospitalId}
        onChange={(event) => setForm({ ...form, hospitalId: event.target.value })}
      >
        <option value="">{t('equipment.field.hospitalRequired')}</option>
        {hospitals.map((hospital) => (
          <option key={hospital.id} value={hospital.id}>
            {hospital.name}
          </option>
        ))}
      </select>
      <input
        autoFocus
        placeholder={t('common.name')}
        className="pm-field"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <input
        placeholder={t('hospitalContacts.rolePlaceholder')}
        className="pm-field"
        value={form.role}
        onChange={(event) => setForm({ ...form, role: event.target.value })}
      />
      <input
        type="email"
        placeholder={t('common.email')}
        className="pm-field"
        value={form.email}
        onChange={(event) => setForm({ ...form, email: event.target.value })}
      />
      <input
        placeholder={t('common.phone')}
        className="pm-field"
        value={form.phone}
        onChange={(event) => setForm({ ...form, phone: event.target.value })}
      />
      <input
        placeholder={t('contacts.field.mobile')}
        className="pm-field"
        value={form.mobile}
        onChange={(event) => setForm({ ...form, mobile: event.target.value })}
      />
      <input
        placeholder={t('contacts.field.fax')}
        className="pm-field"
        value={form.fax}
        onChange={(event) => setForm({ ...form, fax: event.target.value })}
      />

      <select
        className="col-span-2 pm-field"
        value={form.track}
        onChange={(event) => setForm({ ...form, track: event.target.value as ApprovalTrack | '' })}
      >
        <option value="">{t('contacts.track.both')}</option>
        <option value="standard">{t(APPROVAL_TRACK_KEYS.standard)}</option>
        <option value="brachytherapy">{t(APPROVAL_TRACK_KEYS.brachytherapy)}</option>
      </select>
      <p className="col-span-2 -mt-1 text-xs text-gray-500">{t('contacts.trackHelp')}</p>

      <input
        placeholder={t('contacts.field.notes')}
        className="col-span-2 pm-field"
        value={form.notes}
        onChange={(event) => setForm({ ...form, notes: event.target.value })}
      />

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.isPrimary}
          onChange={(event) => setForm({ ...form, isPrimary: event.target.checked })}
        />
        {t('contacts.field.primary')}
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(event) => setForm({ ...form, active: event.target.checked })}
        />
        {t('contacts.field.active')}
      </label>
    </FormModal>
  );
}

// Vista consolidada de todos os contactos dos clientes. A gestão (criar/editar/apagar/
// importar) fica reservada a quem gere hospitais (canManageHospitals) — é a mesma
// permissão que a tabela hospital_contacts exige na base de dados (RLS: admin e planner).
export function Contacts() {
  const t = useT();
  const canManage = useAuthStore((state) => state.permissions.canManageHospitals);
  const hospitals = useHospitalStore((state) => state.hospitals);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const contacts = useContactStore((state) => state.contacts);
  const fetchContacts = useContactStore((state) => state.fetchContacts);
  const createContact = useContactStore((state) => state.createContact);
  const updateContact = useContactStore((state) => state.updateContact);
  const deleteContact = useContactStore((state) => state.deleteContact);
  const bulkCreateContacts = useContactStore((state) => state.bulkCreateContacts);
  const pushToast = useUiStore((state) => state.pushToast);

  const [searchText, setSearchText] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<HospitalContact | null>(null);
  const [saving, setSaving] = useState(false);
  // Guarda-se o ficheiro em cru (e não as linhas já validadas): as correspondências
  // escolhidas na pré-visualização obrigam a validar tudo outra vez.
  const [importRaw, setImportRaw] = useState<Record<string, string>[] | null>(null);
  const [importAliases, setImportAliases] = useState<ImportAliases>({});
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchHospitals();
    fetchContacts();
  }, [fetchHospitals, fetchContacts]);

  const importRows = useMemo(
    () => (importRaw ? parseContactImportRows(importRaw, hospitals, importAliases) : null),
    [importRaw, hospitals, importAliases],
  );

  const allRows = useMemo<ContactRow[]>(() => {
    const byId = new Map(hospitals.map((hospital) => [hospital.id, hospital]));
    return contacts.map((contact) => {
      const hospital = byId.get(contact.hospital_id);
      return {
        contact,
        hospitalName: hospital?.name ?? '',
        zoneName: hospital?.zone_name ?? '',
        trackLabel: contact.approval_track
          ? t(APPROVAL_TRACK_KEYS[contact.approval_track])
          : t('contacts.track.both'),
      };
    });
  }, [contacts, hospitals, t]);

  const filteredRows = useMemo(
    () =>
      allRows.filter((row) =>
        matchesSearch(searchText, [
          row.contact.name,
          row.contact.role,
          row.contact.email,
          row.contact.phone,
          row.contact.mobile,
          row.contact.fax,
          row.contact.notes,
          row.trackLabel,
          row.hospitalName,
          row.zoneName,
        ]),
      ),
    [allRows, searchText],
  );

  const { rows: visibleRows, sortableProps } = useTableSort(filteredRows, CONTACT_SORT, 'name');

  // Exporta o que está no ecrã, pela ordem em que está no ecrã — quem ordenou ou filtrou
  // a lista antes de exportar espera encontrar o Excel na mesma ordem. O ficheiro sai com
  // as colunas que a importação lê, e serve de modelo para reimportar.
  function handleExport() {
    exportRowsToSpreadsheet(
      buildContactExportRows(
        visibleRows.map((row) => row.contact),
        hospitals,
      ),
      'pmplan-contactos.xlsx',
      'Contactos',
    );
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
      .filter((row): row is ParsedImportRow<HospitalContactInsert> & { data: HospitalContactInsert } => row.data !== null)
      .map((row) => ({ rowNumber: row.rowNumber, data: row.data }));

    setImporting(true);
    try {
      const { success, errors } = await bulkCreateContacts(validRows);
      pushToast({
        variant: errors.length > 0 ? 'warning' : 'success',
        message:
          errors.length > 0
            ? t('contacts.importedWithErrors', {
                count: success,
                failed: errors.length,
                rows: errors.map((e) => t('import.rowNumber', { row: e.rowNumber })).join(', '),
              })
            : t('contacts.imported', { count: success }),
      });
      closeImport();
    } finally {
      setImporting(false);
    }
  }

  async function handleAdd(form: ContactForm) {
    if (!form.hospitalId || !form.name.trim()) return;
    setSaving(true);
    try {
      await createContact(toInsert(form));
      setCreating(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('contacts.addFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(form: ContactForm) {
    if (!editing || !form.name.trim()) return;
    setSaving(true);
    try {
      await updateContact(editing.id, toInsert(form));
      setEditing(null);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('contacts.updateFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: ContactRow) {
    if (!window.confirm(t('contacts.confirmDelete', { name: row.contact.name, hospital: row.hospitalName }))) return;
    setSaving(true);
    try {
      await deleteContact(row.contact.id);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('contacts.deleteFailed') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell wide>
      <PageHeader
        title={t('contacts.title')}
        description={t('contacts.description')}
        actions={
          canManage ? (
            <>
              <ImportExportButtons onExport={handleExport} onFileSelected={handleFileSelected} />
              <Button onClick={() => setCreating(true)}>{t('contacts.add')}</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={handleExport} disabled={filteredRows.length === 0}>
              {t('common.export')}
            </Button>
          )
        }
      />

      <Card
        padded={false}
        title={t('contacts.count', { count: filteredRows.length })}
        actions={
          <SearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder={t('contacts.searchPlaceholder')}
            className="w-72"
          />
        }
      >
        {filteredRows.length === 0 ? (
          <EmptyState
            action={
              allRows.length === 0 && canManage ? (
                <Button onClick={() => setCreating(true)}>{t('contacts.add')}</Button>
              ) : undefined
            }
          >
            {allRows.length === 0 ? t('contacts.empty') : t('contacts.noMatch')}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="pm-table">
              <thead>
                <tr>
                  <SortableTh {...sortableProps('name')}>{t('common.name')}</SortableTh>
                  <SortableTh {...sortableProps('role')}>{t('common.role')}</SortableTh>
                  <SortableTh {...sortableProps('email')}>{t('common.email')}</SortableTh>
                  <SortableTh {...sortableProps('phone')}>{t('common.phone')}</SortableTh>
                  <th className="py-1.5 pr-2">{t('contacts.col.mobile')}</th>
                  <th className="py-1.5 pr-2">{t('contacts.col.fax')}</th>
                  <SortableTh {...sortableProps('track')}>{t('contacts.col.track')}</SortableTh>
                  <SortableTh {...sortableProps('hospitalName')}>{t('common.hospital')}</SortableTh>
                  <SortableTh {...sortableProps('zoneName')}>{t('common.zone')}</SortableTh>
                  {canManage && <th className="py-1.5 pr-2" />}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.contact.id} className={row.contact.active ? undefined : 'opacity-60'}>
                    <td className="py-1.5 pr-2">
                      <span className="font-medium text-gray-800">{row.contact.name}</span>
                      {row.contact.is_primary && (
                        <>
                          {' '}
                          <Badge tone="brand" size="sm">
                            {t('contacts.badge.primary')}
                          </Badge>
                        </>
                      )}
                      {!row.contact.active && (
                        <>
                          {' '}
                          <Badge tone="warning" size="sm">
                            {t('contacts.badge.inactive')}
                          </Badge>
                        </>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">{row.contact.role || '—'}</td>
                    <td className="py-1.5 pr-2">{row.contact.email || '—'}</td>
                    <td className="py-1.5 pr-2">{row.contact.phone || '—'}</td>
                    <td className="py-1.5 pr-2">{row.contact.mobile || '—'}</td>
                    <td className="py-1.5 pr-2">{row.contact.fax || '—'}</td>
                    <td className="py-1.5 pr-2">
                      {/* A via só se destaca quando é restrita: "Ambas" é o normal e não
                          precisa de chamar a atenção. */}
                      {row.contact.approval_track ? (
                        <Badge tone={row.contact.approval_track === 'brachytherapy' ? 'accent' : 'neutral'} size="sm">
                          {row.trackLabel}
                        </Badge>
                      ) : (
                        <span className="text-gray-500">{row.trackLabel}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">{row.hospitalName || '—'}</td>
                    <td className="py-1.5 pr-2">
                      <Badge variant="neutral">{row.zoneName}</Badge>
                    </td>
                    {canManage && (
                      <td className="py-1.5 pr-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditing(row.contact)}
                            disabled={saving}
                          >
                            {t('common.edit')}
                          </Button>
                          <Button variant="dangerGhost" size="sm" onClick={() => handleDelete(row)} disabled={saving}>
                            {t('common.delete')}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <ContactFormModal
          t={t}
          title={t('contacts.new')}
          hospitals={hospitals}
          initial={EMPTY_FORM}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={handleAdd}
        />
      )}

      {editing && (
        <ContactFormModal
          t={t}
          title={t('contacts.edit')}
          hospitals={hospitals}
          initial={formFromContact(editing)}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSubmit={handleSaveEdit}
        />
      )}

      {importRows && (
        <ImportPreviewModal
          title={t('contacts.importTitle')}
          rows={importRows}
          renderPreview={contactImportPreview}
          importing={importing}
          refOptions={{ hospital: hospitals.map((hospital) => ({ id: hospital.id, name: hospital.name })) }}
          aliases={importAliases}
          onAliasChange={(key, recordId) => setImportAliases((current) => ({ ...current, [key]: recordId }))}
          onConfirm={handleConfirmImport}
          onClose={closeImport}
        />
      )}
    </PageShell>
  );
}
