import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { buildEngineerExportRows, parseEngineerImportRows } from '../lib/importers/engineerImportExport';
import type { EngineerImportRow } from '../lib/importers/engineerImportExport';
import { exportRowsToSpreadsheet, readSpreadsheetFile } from '../lib/spreadsheet';
import type { ParsedImportRow } from '../lib/spreadsheet';
import { supabase } from '../lib/supabase';
import { edgeFunctionErrorMessage } from '../lib/edgeError';
import { useAuthStore, useEngineerStore, useUiStore, useZoneStore } from '../stores';
import type { EngineerWithZones, UserProfile, Zone } from '../types';
import { ZoneMultiSelect } from '../components/engineers';
import { ImportPreviewModal } from '../components/modals/ImportPreviewModal';
import type { ImportAliases } from '../lib/importers/importHelpers';
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
import { useT, type TFunction } from '../i18n';

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  skills: '',
  active: true,
  zoneIds: [] as string[],
  primaryZoneId: '',
};

type EngineerSortKey = 'name' | 'email' | 'phone' | 'zones' | 'skills' | 'active' | 'login';

function splitSkills(value: string): string[] {
  return value
    .split(',')
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
}

// Traduz o erro de eliminação numa mensagem accionável. Um engenheiro não pode ser
// apagado enquanto for referenciado por outros registos (FK sem cascata): equipamentos,
// PMs ou uma conta de login associada.
function describeDeleteEngineerError(err: unknown, t: TFunction): string {
  const e = err as { code?: string; message?: string; details?: string };
  const text = `${e.message ?? ''} ${e.details ?? ''}`;
  if (e.code === '23503' || /foreign key|violates/i.test(text)) {
    if (/user_profiles/.test(text)) return t('engineers.deleteBlocked.account');
    if (/pm_events/.test(text)) return t('engineers.deleteBlocked.pms');
    if (/equipment/.test(text)) return t('engineers.deleteBlocked.equipment');
    return t('engineers.deleteBlocked.generic');
  }
  return e.message ?? t('engineers.deleteFailed');
}

type EngineerForm = typeof EMPTY_FORM;

// Introdução de novo engenheiro — ver FormModal para o porquê de estar em modal.
function EngineerFormModal({
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
  onSubmit: (values: EngineerForm) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  return (
    <FormModal
      title={t('engineers.new')}
      saving={saving}
      canSubmit={Boolean(form.name.trim() && form.email.trim())}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <input
        autoFocus
        placeholder={t('common.name')}
        className="pm-field"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <input
        placeholder={t('common.email')}
        type="email"
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
        placeholder={t('engineers.skillsPlaceholder')}
        className="pm-field"
        value={form.skills}
        onChange={(event) => setForm({ ...form, skills: event.target.value })}
      />
      <div className="col-span-2">
        <ZoneMultiSelect
          zones={zones}
          selectedZoneIds={form.zoneIds}
          primaryZoneId={form.primaryZoneId}
          onChange={(zoneIds, primaryZoneId) => setForm({ ...form, zoneIds, primaryZoneId })}
        />
      </div>
      <label className="col-span-2 flex items-center gap-1 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(event) => setForm({ ...form, active: event.target.checked })}
        />
        {t('engineers.active')}
      </label>
    </FormModal>
  );
}

// CRUD engenheiros (secção 3). Um engenheiro pode cobrir várias zonas em simultâneo
// (ex: Norte + Galiza) — zoneIds vai todo para engineer_zones via RPC set_engineer_zones,
// com primaryZoneId a marcar qual delas é a principal (secção 4, regra 2).
export function Engineers() {
  const t = useT();
  const canManageEngineers = useAuthStore((state) => state.permissions.canManageEngineers);
  const engineers = useEngineerStore((state) => state.engineers);
  const fetchEngineers = useEngineerStore((state) => state.fetchEngineers);
  const createEngineer = useEngineerStore((state) => state.createEngineer);
  const updateEngineer = useEngineerStore((state) => state.updateEngineer);
  const setEngineerZones = useEngineerStore((state) => state.setEngineerZones);
  const deleteEngineer = useEngineerStore((state) => state.deleteEngineer);
  const bulkCreateEngineer = useEngineerStore((state) => state.bulkCreateEngineer);
  const zones = useZoneStore((state) => state.zones);
  const fetchZones = useZoneStore((state) => state.fetchZones);
  const pushToast = useUiStore((state) => state.pushToast);

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
  // Contas de login existentes (user_profiles) — para saber que engenheiros já têm acesso.
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    fetchEngineers();
    fetchZones();
  }, [fetchEngineers, fetchZones]);

  const importRows = useMemo(
    () => (importRaw ? parseEngineerImportRows(importRaw, zones, importAliases) : null),
    [importRaw, zones, importAliases],
  );

  // Procura sobre as sete colunas: as zonas tanto pelo código como pelo nome (a linha
  // só mostra o código, mas quem procura pensa em "Galiza" e não em "GAL"), e o estado
  // e o acesso pelos rótulos que se leem na linha.
  const filteredEngineers = useMemo(
    () =>
      engineers.filter((engineer) => {
        const engineerZones = engineer.zones.flatMap((engineerZone) => {
          const zone = zones.find((candidate) => candidate.id === engineerZone.zone_id);
          return zone ? [zone.code, zone.name] : [];
        });
        const account = accounts.find((candidate) => candidate.engineer_id === engineer.id);
        return matchesSearch(searchText, [
          engineer.name,
          engineer.email,
          engineer.phone,
          ...engineerZones,
          ...engineer.skills,
          engineer.active ? t('engineers.state.active') : t('engineers.state.inactive'),
          account
            ? account.must_change_password
              ? t('engineers.login.pendingFirstLogin')
              : t('engineers.login.active')
            : t('engineers.login.none'),
        ]);
      }),
    [engineers, zones, accounts, searchText, t],
  );

  // Zonas e conta de login vivem fora da linha (zones/accounts), por isso os extractores
  // são memoizados em vez de constantes de módulo. "Zonas" ordena pelo código da zona
  // principal (a que a linha marca com ★) — é a que decide a quem o trabalho pertence;
  // "Login" ordena por acesso crescente: sem conta, conta por estrear, conta em uso.
  const engineerSort = useMemo<SortAccessors<EngineerWithZones, EngineerSortKey>>(
    () => ({
      name: (engineer) => engineer.name,
      email: (engineer) => engineer.email,
      phone: (engineer) => engineer.phone,
      zones: (engineer) => {
        const primary = engineer.zones.find((engineerZone) => engineerZone.is_primary) ?? engineer.zones[0];
        return primary ? (zones.find((zone) => zone.id === primary.zone_id)?.code ?? null) : null;
      },
      skills: (engineer) => engineer.skills.join(', '),
      active: (engineer) => engineer.active,
      login: (engineer) => {
        const account = accounts.find((candidate) => candidate.engineer_id === engineer.id);
        if (!account) return 0;
        return account.must_change_password ? 1 : 2;
      },
    }),
    [zones, accounts],
  );

  const { rows: visibleEngineers, sortableProps } = useTableSort(filteredEngineers, engineerSort, 'name');

  // Só admin (canManageEngineers) consegue ler os perfis de outros (RLS) e criar contas.
  useEffect(() => {
    if (canManageEngineers) fetchAccounts();
  }, [canManageEngineers]);

  async function fetchAccounts() {
    const { data, error } = await supabase.from('user_profiles').select('*');
    if (!error && data) setAccounts(data);
  }

  // Cria a conta de login do engenheiro (role 'engineer', ligada por engineer_id) via a
  // Edge Function admin-create-user — a criação exige a service_role key, que nunca pode
  // estar no browser. A partir daí o engenheiro define a palavra-passe em "Esqueci-me da
  // palavra-passe" (envio via Resend), sem precisar da temporária.
  async function handleActivateLogin(engineer: EngineerWithZones) {
    setActivatingId(engineer.id);
    try {
      const { data, error } = await supabase.functions.invoke<{ existed?: boolean }>('admin-create-user', {
        body: { email: engineer.email, name: engineer.name, role: 'engineer', engineerId: engineer.id },
      });
      if (error) throw error;
      pushToast({
        variant: 'success',
        message: data?.existed
          ? t('engineers.login.linked', { email: engineer.email })
          : t('engineers.login.created', { email: engineer.email }),
      });
      await fetchAccounts();
    } catch (err) {
      pushToast({
        variant: 'error',
        message: await edgeFunctionErrorMessage(err, t('engineers.login.createFailed')),
      });
    } finally {
      setActivatingId(null);
    }
  }

  // Remove a conta de login do engenheiro (apaga o utilizador de auth via Edge Function
  // admin-delete-user; o perfil desaparece em cascata). Pode recriar-se depois com
  // "Criar acesso". Acção destrutiva — pede confirmação.
  async function handleRemoveLogin(engineer: EngineerWithZones, userId: string) {
    const confirmed = window.confirm(t('engineers.login.confirmRemove', { name: engineer.name }));
    if (!confirmed) return;
    setRemovingId(engineer.id);
    try {
      const { error } = await supabase.functions.invoke('admin-delete-user', { body: { userId } });
      if (error) throw error;
      pushToast({ variant: 'success', message: t('engineers.login.removed', { email: engineer.email }) });
      await fetchAccounts();
    } catch (err) {
      pushToast({
        variant: 'error',
        message: await edgeFunctionErrorMessage(err, t('engineers.login.removeFailed')),
      });
    } finally {
      setRemovingId(null);
    }
  }

  async function handleCreate(form: EngineerForm) {
    if (!form.name || !form.email) return;
    setSaving(true);
    try {
      const created = await createEngineer({
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        primary_zone_id: form.primaryZoneId || null,
        skills: splitSkills(form.skills),
        outlook_calendar_id: null,
        active: form.active,
      });
      if (form.zoneIds.length > 0) {
        await setEngineerZones(created.id, form.zoneIds, form.primaryZoneId || form.zoneIds[0] || null);
      }
      setCreating(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('engineers.createFailed') });
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    exportRowsToSpreadsheet(buildEngineerExportRows(engineers, zones), 'pmplan-engenheiros.xlsx', 'Engenheiros');
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
      .filter((row): row is ParsedImportRow<EngineerImportRow> & { data: EngineerImportRow } => row.data !== null)
      .map((row) => ({ rowNumber: row.rowNumber, ...row.data }));

    setImporting(true);
    try {
      const { success, errors } = await bulkCreateEngineer(validRows);
      pushToast({
        variant: errors.length > 0 ? 'warning' : 'success',
        message:
          errors.length > 0
            ? t('engineers.importedWithErrors', {
                count: success,
                failed: errors.length,
                rows: errors.map((e) => t('import.rowNumber', { row: e.rowNumber })).join(', '),
              })
            : t('engineers.imported', { count: success }),
      });
      closeImport();
    } finally {
      setImporting(false);
    }
  }

  function startEdit(engineer: EngineerWithZones) {
    setEditingId(engineer.id);
    setEditForm({
      name: engineer.name,
      email: engineer.email,
      phone: engineer.phone ?? '',
      skills: engineer.skills.join(', '),
      active: engineer.active,
      zoneIds: engineer.zones.map((zone) => zone.zone_id),
      primaryZoneId: engineer.primary_zone_id ?? '',
    });
  }

  async function handleDeleteEngineer(engineer: EngineerWithZones) {
    const confirmed = window.confirm(t('engineers.confirmDelete', { name: engineer.name }));
    if (!confirmed) return;
    try {
      await deleteEngineer(engineer.id);
      pushToast({ variant: 'success', message: t('engineers.deleted', { name: engineer.name }) });
    } catch (err) {
      pushToast({ variant: 'error', message: describeDeleteEngineerError(err, t) });
    }
  }

  async function handleSaveEdit(engineer: EngineerWithZones) {
    if (!editForm.name || !editForm.email) return;
    setSaving(true);
    try {
      await updateEngineer(engineer.id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone || null,
        skills: splitSkills(editForm.skills),
        active: editForm.active,
      });

      const currentZoneIds = engineer.zones.map((zone) => zone.zone_id);
      const zonesChanged =
        editForm.zoneIds.length !== currentZoneIds.length ||
        !editForm.zoneIds.every((id) => currentZoneIds.includes(id));
      if (zonesChanged || editForm.primaryZoneId !== (engineer.primary_zone_id ?? '')) {
        await setEngineerZones(engineer.id, editForm.zoneIds, editForm.primaryZoneId || editForm.zoneIds[0] || null);
      }
      setEditingId(null);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('engineers.updateFailed') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell wide>
      <PageHeader
        title={t('engineers.title')}
        description={t('engineers.description')}
        actions={
          canManageEngineers && (
            <>
              <ImportExportButtons onExport={handleExport} onFileSelected={handleFileSelected} />
              <Button onClick={() => setCreating(true)}>{t('engineers.add')}</Button>
            </>
          )
        }
      />

      <Card
        padded={false}
        title={t('engineers.count', { count: filteredEngineers.length })}
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
              <SortableTh {...sortableProps('email')}>{t('common.email')}</SortableTh>
              <SortableTh {...sortableProps('phone')}>{t('common.phone')}</SortableTh>
              <SortableTh {...sortableProps('zones')}>{t('common.zones')}</SortableTh>
              <SortableTh {...sortableProps('skills')}>{t('engineers.skills')}</SortableTh>
              <SortableTh {...sortableProps('active')}>{t('engineers.active')}</SortableTh>
              {canManageEngineers && <SortableTh {...sortableProps('login')}>{t('engineers.login')}</SortableTh>}
              <th className="py-1.5 pr-2" />
            </tr>
          </thead>
          <tbody>
            {visibleEngineers.map((engineer) => {
              const editing = editingId === engineer.id;
              // "Activa" = conta de login já ligada a este engenheiro. Uma conta órfã
              // (email igual mas sem engineer_id) não conta como activa — o botão fica
              // disponível e a Edge Function idempotente completa a ligação ao clicar.
              const account = accounts.find((a) => a.engineer_id === engineer.id);
              return (
                <tr key={engineer.id}>
                  {editing ? (
                    <>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          className="pm-field w-full"
                          value={editForm.name}
                          onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          type="email"
                          className="pm-field w-full"
                          value={editForm.email}
                          onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          className="pm-field w-full"
                          value={editForm.phone}
                          onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <ZoneMultiSelect
                          zones={zones}
                          selectedZoneIds={editForm.zoneIds}
                          primaryZoneId={editForm.primaryZoneId}
                          onChange={(zoneIds, primaryZoneId) => setEditForm({ ...editForm, zoneIds, primaryZoneId })}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          placeholder={t('engineers.skillsShort')}
                          className="pm-field w-full"
                          value={editForm.skills}
                          onChange={(event) => setEditForm({ ...editForm, skills: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          type="checkbox"
                          checked={editForm.active}
                          onChange={(event) => setEditForm({ ...editForm, active: event.target.checked })}
                        />
                      </td>
                      {canManageEngineers && (
                        <td className="py-1.5 pr-2 align-top">
                          {account ? (
                            <Button
                              variant="dangerGhost"
                              size="sm"
                              onClick={() => handleRemoveLogin(engineer, account.id)}
                              disabled={removingId === engineer.id}
                            >
                              {removingId === engineer.id
                                ? t('engineers.login.removing')
                                : t('engineers.login.remove')}
                            </Button>
                          ) : (
                            <span className="text-sm text-gray-400">{t('engineers.login.none')}</span>
                          )}
                        </td>
                      )}
                      <td className="py-1.5 pr-2 text-right align-top">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="secondary" size="sm" onClick={() => setEditingId(null)} disabled={saving}>
                            {t('common.cancel')}
                          </Button>
                          <Button size="sm" onClick={() => handleSaveEdit(engineer)} disabled={saving}>
                            {t('common.save')}
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2">{engineer.name}</td>
                      <td className="py-1.5 pr-2">{engineer.email}</td>
                      <td className="py-1.5 pr-2">{engineer.phone ?? '—'}</td>
                      <td className="py-1.5 pr-2">
                        <div className="flex flex-wrap gap-1">
                          {engineer.zones.map((engineerZone) => {
                            const zone = zones.find((z) => z.id === engineerZone.zone_id);
                            if (!zone) return null;
                            return (
                              <Badge key={zone.id} variant="neutral">
                                {zone.code}
                                {engineerZone.is_primary ? ' ★' : ''}
                              </Badge>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2">{engineer.skills.length > 0 ? engineer.skills.join(', ') : '—'}</td>
                      <td className="py-1.5 pr-2">
                        <Badge tone={engineer.active ? 'success' : 'neutral'}>
                          {engineer.active ? t('engineers.state.active') : t('engineers.state.inactive')}
                        </Badge>
                      </td>
                      {canManageEngineers && (
                        <td className="py-1.5 pr-2">
                          <label
                            className="flex items-center gap-1.5 text-sm text-gray-600"
                            title={account ? t('engineers.login.activeTitle') : t('engineers.login.createTitle')}
                          >
                            <input
                              type="checkbox"
                              checked={!!account}
                              disabled={!!account || activatingId === engineer.id}
                              onChange={() => handleActivateLogin(engineer)}
                            />
                            {account
                              ? account.must_change_password
                                ? t('engineers.login.pendingFirstLogin')
                                : t('engineers.login.active')
                              : activatingId === engineer.id
                                ? t('engineers.login.creating')
                                : t('engineers.login.create')}
                          </label>
                        </td>
                      )}
                      <td className="py-1.5 pr-2 text-right">
                        {canManageEngineers && (
                          <div className="flex justify-end gap-1">
                            <Button variant="secondary" size="sm" onClick={() => startEdit(engineer)}>
                              {t('common.edit')}
                            </Button>
                            <Button variant="dangerGhost" size="sm" onClick={() => handleDeleteEngineer(engineer)}>
                              {t('common.delete')}
                            </Button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {filteredEngineers.length === 0 && (
          <EmptyState
            action={
              engineers.length === 0 && canManageEngineers ? (
                <Button onClick={() => setCreating(true)}>{t('engineers.add')}</Button>
              ) : undefined
            }
          >
            {engineers.length === 0 ? t('engineers.empty') : t('engineers.noMatch')}
          </EmptyState>
        )}
      </Card>

      {creating && (
        <EngineerFormModal
          t={t}
          zones={zones}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}

      {importRows && (
        <ImportPreviewModal
          title={t('engineers.importTitle')}
          rows={importRows}
          renderPreview={(data) => data.engineer.name}
          importing={importing}
          refOptions={{ zone: zones }}
          aliases={importAliases}
          onAliasChange={(key, recordId) => setImportAliases((current) => ({ ...current, [key]: recordId }))}
          onConfirm={handleConfirmImport}
          onClose={closeImport}
        />
      )}
    </PageShell>
  );
}
