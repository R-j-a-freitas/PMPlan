import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
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
import { matchesSearch } from '../lib/searchText';
import { Badge, Button, FormModal, ImportExportButtons, SearchInput } from '../components/ui';

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  skills: '',
  active: true,
  zoneIds: [] as string[],
  primaryZoneId: '',
};

function splitSkills(value: string): string[] {
  return value
    .split(',')
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
}

// Traduz o erro de eliminação numa mensagem accionável. Um engenheiro não pode ser
// apagado enquanto for referenciado por outros registos (FK sem cascata): equipamentos,
// PMs ou uma conta de login associada.
function describeDeleteEngineerError(err: unknown): string {
  const e = err as { code?: string; message?: string; details?: string };
  const text = `${e.message ?? ''} ${e.details ?? ''}`;
  if (e.code === '23503' || /foreign key|violates/i.test(text)) {
    if (/user_profiles/.test(text)) {
      return 'Este engenheiro tem uma conta de login associada. Em "Editar", clique em "Remover acesso" antes de o eliminar.';
    }
    if (/pm_events/.test(text)) {
      return 'Este engenheiro tem PMs (manutenções) associadas. Reatribua ou remova essas PMs antes de o eliminar.';
    }
    if (/equipment/.test(text)) {
      return 'Este engenheiro está atribuído a equipamentos (principal/secundário). Reatribua esses equipamentos antes de o eliminar.';
    }
    return 'Não é possível eliminar: existem registos associados a este engenheiro.';
  }
  return e.message ?? 'Falha ao eliminar o engenheiro.';
}

type EngineerForm = typeof EMPTY_FORM;

// Introdução de novo engenheiro — ver FormModal para o porquê de estar em modal.
function EngineerFormModal({
  zones,
  saving,
  onCancel,
  onSubmit,
}: {
  zones: Zone[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: EngineerForm) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  return (
    <FormModal
      title="Novo engenheiro"
      saving={saving}
      canSubmit={Boolean(form.name.trim() && form.email.trim())}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <input
        autoFocus
        placeholder="Nome"
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <input
        placeholder="Email"
        type="email"
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={form.email}
        onChange={(event) => setForm({ ...form, email: event.target.value })}
      />
      <input
        placeholder="Telefone"
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={form.phone}
        onChange={(event) => setForm({ ...form, phone: event.target.value })}
      />
      <input
        placeholder="Skills (separadas por vírgula)"
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
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
        Activo
      </label>
    </FormModal>
  );
}

// CRUD engenheiros (secção 3). Um engenheiro pode cobrir várias zonas em simultâneo
// (ex: Norte + Galiza) — zoneIds vai todo para engineer_zones via RPC set_engineer_zones,
// com primaryZoneId a marcar qual delas é a principal (secção 4, regra 2).
export function Engineers() {
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
  const [importRows, setImportRows] = useState<ParsedImportRow<EngineerImportRow>[] | null>(null);
  const [importing, setImporting] = useState(false);
  // Contas de login existentes (user_profiles) — para saber que engenheiros já têm acesso.
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    fetchEngineers();
    fetchZones();
  }, [fetchEngineers, fetchZones]);

  // Procura por nome ou email — é por aí que se identifica um engenheiro na lista.
  const filteredEngineers = useMemo(
    () => engineers.filter((engineer) => matchesSearch(searchText, [engineer.name, engineer.email])),
    [engineers, searchText],
  );

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
        message: `${data?.existed ? 'Conta de login associada a' : 'Conta de login criada para'} ${engineer.email}. O engenheiro pode agora definir a palavra-passe em "Esqueci-me da palavra-passe".`,
      });
      await fetchAccounts();
    } catch (err) {
      pushToast({
        variant: 'error',
        message: await edgeFunctionErrorMessage(
          err,
          'Falha ao criar a conta de login (a Edge Function admin-create-user está deployed?).',
        ),
      });
    } finally {
      setActivatingId(null);
    }
  }

  // Remove a conta de login do engenheiro (apaga o utilizador de auth via Edge Function
  // admin-delete-user; o perfil desaparece em cascata). Pode recriar-se depois com
  // "Criar acesso". Acção destrutiva — pede confirmação.
  async function handleRemoveLogin(engineer: EngineerWithZones, userId: string) {
    const confirmed = window.confirm(
      `Remover o acesso de login de ${engineer.name}? A conta será eliminada; poderá recriá-la depois com "Criar acesso".`,
    );
    if (!confirmed) return;
    setRemovingId(engineer.id);
    try {
      const { error } = await supabase.functions.invoke('admin-delete-user', { body: { userId } });
      if (error) throw error;
      pushToast({ variant: 'success', message: `Acesso de login removido para ${engineer.email}.` });
      await fetchAccounts();
    } catch (err) {
      pushToast({
        variant: 'error',
        message: await edgeFunctionErrorMessage(err, 'Falha ao remover o acesso de login.'),
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
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao criar engenheiro.' });
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
      setImportRows(parseEngineerImportRows(raw, zones));
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao ler o ficheiro.' });
    }
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
            ? `${success} engenheiro(s) importado(s), ${errors.length} falharam: ${errors.map((e) => `linha ${e.rowNumber}`).join(', ')}.`
            : `${success} engenheiro(s) importado(s) com sucesso.`,
      });
      setImportRows(null);
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
    const confirmed = window.confirm(`Eliminar o engenheiro ${engineer.name}? Esta acção não pode ser desfeita.`);
    if (!confirmed) return;
    try {
      await deleteEngineer(engineer.id);
      pushToast({ variant: 'success', message: `Engenheiro ${engineer.name} eliminado.` });
    } catch (err) {
      pushToast({ variant: 'error', message: describeDeleteEngineerError(err) });
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
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao actualizar engenheiro.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Engenheiros</h1>
          {canManageEngineers && (
            <div className="flex items-center gap-2">
              <Button onClick={() => setCreating(true)}>Adicionar</Button>
              <ImportExportButtons onExport={handleExport} onFileSelected={handleFileSelected} />
            </div>
          )}
        </div>

        <SearchInput value={searchText} onChange={setSearchText} placeholder="Procurar engenheiro por nome ou email…" />

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5 pr-2">Nome</th>
              <th className="py-1.5 pr-2">Email</th>
              <th className="py-1.5 pr-2">Telefone</th>
              <th className="py-1.5 pr-2">Zonas</th>
              <th className="py-1.5 pr-2">Skills</th>
              <th className="py-1.5 pr-2">Activo</th>
              {canManageEngineers && <th className="py-1.5 pr-2">Login</th>}
              <th className="py-1.5 pr-2" />
            </tr>
          </thead>
          <tbody>
            {filteredEngineers.map((engineer) => {
              const editing = editingId === engineer.id;
              // "Activa" = conta de login já ligada a este engenheiro. Uma conta órfã
              // (email igual mas sem engineer_id) não conta como activa — o botão fica
              // disponível e a Edge Function idempotente completa a ligação ao clicar.
              const account = accounts.find((a) => a.engineer_id === engineer.id);
              return (
                <tr key={engineer.id} className="border-b border-gray-100">
                  {editing ? (
                    <>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          className="w-full rounded-md border border-gray-300 px-2 py-1"
                          value={editForm.name}
                          onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          type="email"
                          className="w-full rounded-md border border-gray-300 px-2 py-1"
                          value={editForm.email}
                          onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          className="w-full rounded-md border border-gray-300 px-2 py-1"
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
                          placeholder="Skills (vírgulas)"
                          className="w-full rounded-md border border-gray-300 px-2 py-1"
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
                              variant="danger"
                              onClick={() => handleRemoveLogin(engineer, account.id)}
                              disabled={removingId === engineer.id}
                            >
                              {removingId === engineer.id ? 'A remover…' : 'Remover acesso'}
                            </Button>
                          ) : (
                            <span className="text-gray-300">Sem acesso</span>
                          )}
                        </td>
                      )}
                      <td className="py-1.5 pr-2 text-right align-top">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => setEditingId(null)} disabled={saving}>
                            Cancelar
                          </Button>
                          <Button onClick={() => handleSaveEdit(engineer)} disabled={saving}>
                            Guardar
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
                              <Badge key={zone.id} color={zone.color}>
                                {zone.code}
                                {engineerZone.is_primary ? ' ★' : ''}
                              </Badge>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2">{engineer.skills.length > 0 ? engineer.skills.join(', ') : '—'}</td>
                      <td className="py-1.5 pr-2">{engineer.active ? 'Sim' : 'Não'}</td>
                      {canManageEngineers && (
                        <td className="py-1.5 pr-2">
                          <label
                            className="flex items-center gap-1.5 text-sm text-gray-600"
                            title={account ? 'Conta de login activa' : 'Criar conta de login para este engenheiro'}
                          >
                            <input
                              type="checkbox"
                              checked={!!account}
                              disabled={!!account || activatingId === engineer.id}
                              onChange={() => handleActivateLogin(engineer)}
                            />
                            {account
                              ? account.must_change_password
                                ? 'Activa · 1º login pendente'
                                : 'Activa'
                              : activatingId === engineer.id
                                ? 'A criar…'
                                : 'Criar acesso'}
                          </label>
                        </td>
                      )}
                      <td className="py-1.5 pr-2 text-right">
                        {canManageEngineers && (
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => startEdit(engineer)}>
                              Editar
                            </Button>
                            <Button variant="danger" onClick={() => handleDeleteEngineer(engineer)}>
                              Eliminar
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

        {filteredEngineers.length === 0 && (
          <p className="mt-3 text-sm text-gray-400">
            {engineers.length === 0 ? 'Sem engenheiros registados.' : 'Nenhum engenheiro corresponde à pesquisa.'}
          </p>
        )}
      </div>

      {creating && (
        <EngineerFormModal
          zones={zones}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}

      {importRows && (
        <ImportPreviewModal
          title="Importar engenheiros"
          rows={importRows}
          renderPreview={(data) => data.engineer.name}
          importing={importing}
          onConfirm={handleConfirmImport}
          onClose={() => setImportRows(null)}
        />
      )}
    </div>
  );
}
