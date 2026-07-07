import { useEffect, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { buildEquipmentExportRows, parseEquipmentImportRows } from '../lib/importers/equipmentImportExport';
import { exportRowsToSpreadsheet, readSpreadsheetFile } from '../lib/spreadsheet';
import type { ParsedImportRow } from '../lib/spreadsheet';
import { useAuthStore, useEngineerStore, useEquipmentStore, useHospitalStore, useUiStore, useZoneStore } from '../stores';
import { KNOWN_MODALITIES } from '../types';
import type { EquipmentInsert, PmPerYear, WeekendWork } from '../types';
import { EquipmentRow } from '../components/equipment';
import { ImportPreviewModal } from '../components/modals/ImportPreviewModal';
import { Button, ImportExportButtons } from '../components/ui';

const EMPTY_FORM = {
  name: '',
  hospitalId: '',
  model: '',
  serialNumber: '',
  engineerPrimaryId: '',
  engineerSecondaryId: '',
  modality: KNOWN_MODALITIES[0] as string,
  pmPerYear: '1' as `${PmPerYear}`,
  pmDurationDays: '1',
  needsShutdown: false,
  weekendWork: 'none' as WeekendWork,
  color: '#3B82F6',
  active: true,
};

// CRUD equipamentos (secção 3) — zone_id é sempre derivado do hospital seleccionado (secção 4, regra 1).
export function Equipment() {
  const canManageEquipment = useAuthStore((state) => state.permissions.canManageEquipment);
  const equipment = useEquipmentStore((state) => state.equipment);
  const fetchEquipment = useEquipmentStore((state) => state.fetchEquipment);
  const createEquipment = useEquipmentStore((state) => state.createEquipment);
  const bulkCreateEquipment = useEquipmentStore((state) => state.bulkCreateEquipment);
  const hospitals = useHospitalStore((state) => state.hospitals);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const engineers = useEngineerStore((state) => state.engineers);
  const fetchEngineers = useEngineerStore((state) => state.fetchEngineers);
  const fetchZones = useZoneStore((state) => state.fetchZones);
  const pushToast = useUiStore((state) => state.pushToast);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importRows, setImportRows] = useState<ParsedImportRow<EquipmentInsert>[] | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchEquipment();
    fetchHospitals();
    fetchEngineers();
    fetchZones();
  }, [fetchEquipment, fetchHospitals, fetchEngineers, fetchZones]);

  async function handleCreate() {
    const hospital = hospitals.find((item) => item.id === form.hospitalId);
    if (!form.name || !hospital) return;

    setSaving(true);
    try {
      await createEquipment({
        name: form.name,
        manufacturer: null,
        model: form.model || null,
        modality: form.modality,
        serial_number: form.serialNumber || null,
        hospital_id: hospital.id,
        zone_id: hospital.zone_id,
        engineer_primary_id: form.engineerPrimaryId || null,
        engineer_secondary_id: form.engineerSecondaryId || null,
        pm_per_year: Number(form.pmPerYear) as PmPerYear,
        pm_duration_days: Number(form.pmDurationDays) || 1,
        needs_shutdown: form.needsShutdown,
        weekend_work: form.weekendWork,
        color: form.color,
        active: form.active,
      });
      setForm(EMPTY_FORM);
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    exportRowsToSpreadsheet(
      buildEquipmentExportRows(equipment, engineers),
      'pmplan-equipamentos.xlsx',
      'Equipamentos',
    );
  }

  async function handleFileSelected(file: File) {
    try {
      const raw = await readSpreadsheetFile(file);
      setImportRows(parseEquipmentImportRows(raw, { hospitals, engineers }));
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao ler o ficheiro.' });
    }
  }

  async function handleConfirmImport() {
    if (!importRows) return;
    const validRows = importRows
      .filter((row): row is ParsedImportRow<EquipmentInsert> & { data: EquipmentInsert } => row.data !== null)
      .map((row) => ({ rowNumber: row.rowNumber, data: row.data }));

    setImporting(true);
    try {
      const { success, errors } = await bulkCreateEquipment(validRows);
      pushToast({
        variant: errors.length > 0 ? 'warning' : 'success',
        message:
          errors.length > 0
            ? `${success} equipamento(s) importado(s), ${errors.length} falharam: ${errors.map((e) => `linha ${e.rowNumber}`).join(', ')}.`
            : `${success} equipamento(s) importado(s) com sucesso.`,
      });
      setImportRows(null);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Equipamentos</h1>
          {canManageEquipment && <ImportExportButtons onExport={handleExport} onFileSelected={handleFileSelected} />}
        </div>

        {canManageEquipment && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
            <input
              placeholder="Nome"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.hospitalId}
              onChange={(event) => setForm({ ...form, hospitalId: event.target.value })}
            >
              <option value="">Hospital…</option>
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name} ({hospital.zone_code})
                </option>
              ))}
            </select>
            <input
              placeholder="Modelo"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
            />
            <input
              placeholder="Nº de Série"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.serialNumber}
              onChange={(event) => setForm({ ...form, serialNumber: event.target.value })}
            />
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.modality}
              onChange={(event) => setForm({ ...form, modality: event.target.value })}
            >
              {KNOWN_MODALITIES.map((modality) => (
                <option key={modality} value={modality}>
                  {modality}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.pmPerYear}
              onChange={(event) => setForm({ ...form, pmPerYear: event.target.value as `${PmPerYear}` })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}x PM/ano
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              placeholder="Duração (dias)"
              className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.pmDurationDays}
              onChange={(event) => setForm({ ...form, pmDurationDays: event.target.value })}
            />
            <label className="flex items-center gap-1 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.needsShutdown}
                onChange={(event) => setForm({ ...form, needsShutdown: event.target.checked })}
              />
              Necessita paragem
            </label>
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.weekendWork}
              title="Trabalho ao fim-de-semana (contrato)"
              onChange={(event) => setForm({ ...form, weekendWork: event.target.value as WeekendWork })}
            >
              <option value="none">Só dias úteis</option>
              <option value="saturday">Inclui sábado</option>
              <option value="both">Inclui sáb + dom</option>
            </select>
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.engineerPrimaryId}
              onChange={(event) => setForm({ ...form, engineerPrimaryId: event.target.value })}
            >
              <option value="">Engenheiro principal…</option>
              {engineers.map((engineer) => (
                <option key={engineer.id} value={engineer.id}>
                  {engineer.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.engineerSecondaryId}
              onChange={(event) => setForm({ ...form, engineerSecondaryId: event.target.value })}
            >
              <option value="">Engenheiro secundário…</option>
              {engineers.map((engineer) => (
                <option key={engineer.id} value={engineer.id}>
                  {engineer.name}
                </option>
              ))}
            </select>
            <input
              type="color"
              className="h-8 w-10 rounded-md border border-gray-300"
              value={form.color}
              onChange={(event) => setForm({ ...form, color: event.target.value })}
            />
            <label className="flex items-center gap-1 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              Activo
            </label>
            <Button onClick={handleCreate} disabled={saving || !form.name || !form.hospitalId}>
              Adicionar
            </Button>
          </div>
        )}

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5 pr-2">Nome</th>
              <th className="py-1.5 pr-2">Hospital</th>
              <th className="py-1.5 pr-2">Zona</th>
              <th className="py-1.5 pr-2">Modelo</th>
              <th className="py-1.5 pr-2">Nº Série</th>
              <th className="py-1.5 pr-2">Modalidade</th>
              <th className="py-1.5 pr-2">PM/ano</th>
              <th className="py-1.5 pr-2">Duração (dias)</th>
              <th className="py-1.5 pr-2">Paragem</th>
              <th className="py-1.5 pr-2">Fim-de-semana</th>
              <th className="py-1.5 pr-2">Eng. principal</th>
              <th className="py-1.5 pr-2">Eng. secundário</th>
              <th className="py-1.5 pr-2">Activo</th>
              <th className="py-1.5 pr-2" />
            </tr>
          </thead>
          <tbody>
            {equipment.map((item) => (
              <EquipmentRow key={item.id} item={item} canManageEquipment={canManageEquipment} />
            ))}
          </tbody>
        </table>
      </div>

      {importRows && (
        <ImportPreviewModal
          title="Importar equipamentos"
          rows={importRows}
          renderPreview={(data) => data.name}
          importing={importing}
          onConfirm={handleConfirmImport}
          onClose={() => setImportRows(null)}
        />
      )}
    </div>
  );
}
