import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { buildEquipmentExportRows, parseEquipmentImportRows } from '../lib/importers/equipmentImportExport';
import { matchesSearch } from '../lib/searchText';
import { exportRowsToSpreadsheet, readSpreadsheetFile } from '../lib/spreadsheet';
import type { ParsedImportRow } from '../lib/spreadsheet';
import {
  useAuthStore,
  useEngineerStore,
  useEquipmentStore,
  useHospitalStore,
  useModalityStore,
  useUiStore,
  useZoneStore,
} from '../stores';
import { KNOWN_MODALITIES } from '../types';
import type { EngineerWithZones, EquipmentInsert, HospitalWithZone, PmPerYear, WeekendWork } from '../types';
import { EquipmentRow } from '../components/equipment';
import { ImportPreviewModal } from '../components/modals/ImportPreviewModal';
import type { ImportAliases } from '../lib/importers/importHelpers';
import { ModalityManagerModal, MODALITY_MANAGE_VALUE } from '../components/modals';
import {
  Button,
  Card,
  EmptyState,
  FormModal,
  ImportExportButtons,
  PageHeader,
  SearchInput,
} from '../components/ui';

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

type EquipmentForm = typeof EMPTY_FORM;

// Introdução de novo equipamento — ver FormModal para o porquê de estar em modal. É o
// formulário mais longo da app (13 campos), o que o tornava o mais incómodo de ter
// sempre aberto por cima da lista.
function EquipmentFormModal({
  hospitals,
  engineers,
  modalityNames,
  onManageModalities,
  saving,
  onCancel,
  onSubmit,
}: {
  hospitals: HospitalWithZone[];
  engineers: EngineerWithZones[];
  modalityNames: string[];
  onManageModalities: () => void;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: EquipmentForm) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  // Garante que a modalidade actual aparece na lista mesmo que já não exista na BD.
  const modalityOptions =
    form.modality && !modalityNames.includes(form.modality) ? [form.modality, ...modalityNames] : modalityNames;

  return (
    <FormModal
      title="Novo equipamento"
      size="lg"
      saving={saving}
      canSubmit={Boolean(form.name.trim() && form.hospitalId)}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <input
        autoFocus
        placeholder="Nome"
        className="pm-field"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <select
        className="pm-field"
        value={form.hospitalId}
        onChange={(event) => setForm({ ...form, hospitalId: event.target.value })}
      >
        <option value="">Hospital… (obrigatório)</option>
        {hospitals.map((hospital) => (
          <option key={hospital.id} value={hospital.id}>
            {hospital.name} ({hospital.zone_code})
          </option>
        ))}
      </select>
      <input
        placeholder="Modelo"
        className="pm-field"
        value={form.model}
        onChange={(event) => setForm({ ...form, model: event.target.value })}
      />
      <input
        placeholder="Nº de Série"
        className="pm-field"
        value={form.serialNumber}
        onChange={(event) => setForm({ ...form, serialNumber: event.target.value })}
      />
      <select
        className="pm-field"
        value={form.modality}
        onChange={(event) => {
          if (event.target.value === MODALITY_MANAGE_VALUE) {
            onManageModalities();
            return;
          }
          setForm({ ...form, modality: event.target.value });
        }}
      >
        {modalityOptions.map((modality) => (
          <option key={modality} value={modality}>
            {modality}
          </option>
        ))}
        <option disabled>──────────</option>
        <option value={MODALITY_MANAGE_VALUE}>✏️ Editar modalidades…</option>
      </select>
      <select
        className="pm-field"
        value={form.pmPerYear}
        onChange={(event) => setForm({ ...form, pmPerYear: event.target.value as `${PmPerYear}` })}
      >
        {[1, 2, 3, 4].map((n) => (
          <option key={n} value={n}>
            {n}x PM/ano
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-gray-600">
        Duração (dias)
        <input
          type="number"
          min={1}
          className="w-20 pm-field"
          value={form.pmDurationDays}
          onChange={(event) => setForm({ ...form, pmDurationDays: event.target.value })}
        />
      </label>
      <select
        className="pm-field"
        value={form.weekendWork}
        title="Trabalho ao fim-de-semana (contrato)"
        onChange={(event) => setForm({ ...form, weekendWork: event.target.value as WeekendWork })}
      >
        <option value="none">Só dias úteis</option>
        <option value="saturday">Inclui sábado</option>
        <option value="both">Inclui sáb + dom</option>
      </select>
      <select
        className="pm-field"
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
        className="pm-field"
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
      <label className="flex items-center gap-2 text-sm text-gray-600">
        Cor no calendário
        <input
          type="color"
          className="h-8 w-10 rounded-md border border-gray-300"
          value={form.color}
          onChange={(event) => setForm({ ...form, color: event.target.value })}
        />
      </label>
      <label className="flex items-center gap-1 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={form.needsShutdown}
          onChange={(event) => setForm({ ...form, needsShutdown: event.target.checked })}
        />
        Necessita paragem
      </label>
      <label className="flex items-center gap-1 text-sm text-gray-600">
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
  const modalities = useModalityStore((state) => state.modalities);
  const fetchModalities = useModalityStore((state) => state.fetchModalities);
  const pushToast = useUiStore((state) => state.pushToast);

  const [creating, setCreating] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);
  // Guarda-se o ficheiro em cru (e não as linhas já validadas): as correspondências
  // escolhidas na pré-visualização obrigam a validar tudo outra vez.
  const [importRaw, setImportRaw] = useState<Record<string, string>[] | null>(null);
  const [importAliases, setImportAliases] = useState<ImportAliases>({});
  const [importing, setImporting] = useState(false);
  const [showModalityManager, setShowModalityManager] = useState(false);

  useEffect(() => {
    fetchEquipment();
    fetchHospitals();
    fetchEngineers();
    fetchZones();
    fetchModalities();
  }, [fetchEquipment, fetchHospitals, fetchEngineers, fetchZones, fetchModalities]);

  const importRows = useMemo(
    () => (importRaw ? parseEquipmentImportRows(importRaw, { hospitals, engineers }, importAliases) : null),
    [importRaw, hospitals, engineers, importAliases],
  );

  // Nomes das modalidades para o dropdown (da BD; fallback à lista fixa antes do fetch).
  const modalityNames = modalities.length > 0 ? modalities.map((modality) => modality.name) : [...KNOWN_MODALITIES];

  // Procura pelos campos que identificam a máquina na lista — nome, hospital, modelo,
  // nº de série e modalidade.
  const filteredEquipment = useMemo(
    () =>
      equipment.filter((item) =>
        matchesSearch(searchText, [item.name, item.hospital_name, item.model, item.serial_number, item.modality]),
      ),
    [equipment, searchText],
  );

  async function handleCreate(form: EquipmentForm) {
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
      setCreating(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao criar equipamento.' });
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
      setImportAliases({});
      setImportRaw(raw);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao ler o ficheiro.' });
    }
  }

  function closeImport() {
    setImportRaw(null);
    setImportAliases({});
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
      closeImport();
    } finally {
      setImporting(false);
    }
  }

  return (
    <PageShell wide>
      <PageHeader
        title="Equipamentos"
        description="A zona de cada equipamento vem sempre do hospital onde está instalado. A cor é a que o identifica no calendário."
        actions={
          canManageEquipment && (
            <>
              <ImportExportButtons onExport={handleExport} onFileSelected={handleFileSelected} />
              <Button onClick={() => setCreating(true)}>Adicionar equipamento</Button>
            </>
          )
        }
      />

      <Card
        padded={false}
        title={`${filteredEquipment.length} equipamento(s)`}
        actions={
          <SearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Procurar por nome, hospital, modelo, nº de série…"
            className="w-72"
          />
        }
      >
        <div className="overflow-x-auto">
        <table className="pm-table">
          <thead>
            <tr>
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
            {filteredEquipment.map((item) => (
              <EquipmentRow
                key={item.id}
                item={item}
                canManageEquipment={canManageEquipment}
                onManageModalities={() => setShowModalityManager(true)}
              />
            ))}
          </tbody>
        </table>
        </div>

        {filteredEquipment.length === 0 && (
          <EmptyState
            action={
              equipment.length === 0 && canManageEquipment ? (
                <Button onClick={() => setCreating(true)}>Adicionar equipamento</Button>
              ) : undefined
            }
          >
            {equipment.length === 0
              ? 'Ainda não há equipamentos registados.'
              : 'Nenhum equipamento corresponde à pesquisa.'}
          </EmptyState>
        )}
      </Card>

      {creating && (
        <EquipmentFormModal
          hospitals={hospitals}
          engineers={engineers}
          modalityNames={modalityNames}
          onManageModalities={() => setShowModalityManager(true)}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}

      {importRows && (
        <ImportPreviewModal
          title="Importar equipamentos"
          rows={importRows}
          renderPreview={(data) => data.name}
          importing={importing}
          refOptions={{ hospital: hospitals, engineer: engineers }}
          aliases={importAliases}
          onAliasChange={(key, recordId) => setImportAliases((current) => ({ ...current, [key]: recordId }))}
          onConfirm={handleConfirmImport}
          onClose={closeImport}
        />
      )}

      {showModalityManager && <ModalityManagerModal onClose={() => setShowModalityManager(false)} />}
    </PageShell>
  );
}
