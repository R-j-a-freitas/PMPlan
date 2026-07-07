import { useEffect, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { buildEngineerExportRows, parseEngineerImportRows } from '../lib/importers/engineerImportExport';
import type { EngineerImportRow } from '../lib/importers/engineerImportExport';
import { exportRowsToSpreadsheet, readSpreadsheetFile } from '../lib/spreadsheet';
import type { ParsedImportRow } from '../lib/spreadsheet';
import { useAuthStore, useEngineerStore, useUiStore, useZoneStore } from '../stores';
import type { EngineerWithZones } from '../types';
import { ZoneMultiSelect } from '../components/engineers';
import { ImportPreviewModal } from '../components/modals/ImportPreviewModal';
import { Badge, Button, ImportExportButtons } from '../components/ui';

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

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [importRows, setImportRows] = useState<ParsedImportRow<EngineerImportRow>[] | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchEngineers();
    fetchZones();
  }, [fetchEngineers, fetchZones]);

  async function handleCreate() {
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
      setForm(EMPTY_FORM);
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
          {canManageEngineers && <ImportExportButtons onExport={handleExport} onFileSelected={handleFileSelected} />}
        </div>

        {canManageEngineers && (
          <div className="mb-4 flex flex-wrap items-start gap-2 rounded-md border border-gray-200 p-3">
            <input
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
            <ZoneMultiSelect
              zones={zones}
              selectedZoneIds={form.zoneIds}
              primaryZoneId={form.primaryZoneId}
              onChange={(zoneIds, primaryZoneId) => setForm({ ...form, zoneIds, primaryZoneId })}
            />
            <input
              placeholder="Skills (separadas por vírgula)"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.skills}
              onChange={(event) => setForm({ ...form, skills: event.target.value })}
            />
            <label className="flex items-center gap-1 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              Activo
            </label>
            <Button onClick={handleCreate} disabled={saving || !form.name || !form.email}>
              Adicionar
            </Button>
          </div>
        )}

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5 pr-2">Nome</th>
              <th className="py-1.5 pr-2">Email</th>
              <th className="py-1.5 pr-2">Telefone</th>
              <th className="py-1.5 pr-2">Zonas</th>
              <th className="py-1.5 pr-2">Skills</th>
              <th className="py-1.5 pr-2">Activo</th>
              <th className="py-1.5 pr-2" />
            </tr>
          </thead>
          <tbody>
            {engineers.map((engineer) => {
              const editing = editingId === engineer.id;
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
                      <td className="py-1.5 pr-2 text-right">
                        {canManageEngineers && (
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => startEdit(engineer)}>
                              Editar
                            </Button>
                            <Button variant="danger" onClick={() => deleteEngineer(engineer.id)}>
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
      </div>

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
