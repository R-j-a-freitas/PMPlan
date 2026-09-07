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
import type {
  EngineerWithZones,
  EquipmentFull,
  EquipmentInsert,
  HospitalWithZone,
  PmPerYear,
  WeekendWork,
} from '../types';
import { useTableSort } from '../hooks';
import type { SortAccessors } from '../hooks';
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
  SortableTh,
} from '../components/ui';
import { useT, type TFunction } from '../i18n';
import { WEEKEND_WORK_KEYS } from '../i18n/labels';

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

type EquipmentSortKey =
  | 'name'
  | 'hospital'
  | 'zone'
  | 'model'
  | 'serialNumber'
  | 'modality'
  | 'pmPerYear'
  | 'pmDurationDays'
  | 'needsShutdown'
  | 'weekendWork'
  | 'engineerPrimary'
  | 'engineerSecondary'
  | 'active';

// "Fim-de-semana" ordena por disponibilidade crescente (só úteis → sáb → sáb+dom) e não
// pelo rótulo: ordenar "Sáb" antes de "Sáb+Dom" antes de "Só úteis" seria alfabético e
// não diria nada sobre o contrato.
const WEEKEND_WORK_RANK: Record<WeekendWork, number> = { none: 0, saturday: 1, both: 2 };

// Introdução de novo equipamento — ver FormModal para o porquê de estar em modal. É o
// formulário mais longo da app (13 campos), o que o tornava o mais incómodo de ter
// sempre aberto por cima da lista.
function EquipmentFormModal({
  t,
  hospitals,
  engineers,
  modalityNames,
  onManageModalities,
  saving,
  onCancel,
  onSubmit,
}: {
  t: TFunction;
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
      title={t('equipment.new')}
      size="lg"
      saving={saving}
      canSubmit={Boolean(form.name.trim() && form.hospitalId)}
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
      <select
        className="pm-field"
        value={form.hospitalId}
        onChange={(event) => setForm({ ...form, hospitalId: event.target.value })}
      >
        <option value="">{t('equipment.field.hospitalRequired')}</option>
        {hospitals.map((hospital) => (
          <option key={hospital.id} value={hospital.id}>
            {hospital.name} ({hospital.zone_code})
          </option>
        ))}
      </select>
      <input
        placeholder={t('common.model')}
        className="pm-field"
        value={form.model}
        onChange={(event) => setForm({ ...form, model: event.target.value })}
      />
      <input
        placeholder={t('equipment.field.serialNumber')}
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
        <option value={MODALITY_MANAGE_VALUE}>{t('modality.manage')}</option>
      </select>
      <select
        className="pm-field"
        value={form.pmPerYear}
        onChange={(event) => setForm({ ...form, pmPerYear: event.target.value as `${PmPerYear}` })}
      >
        {[1, 2, 3, 4].map((n) => (
          <option key={n} value={n}>
            {t('equipment.field.pmPerYear', { count: n })}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-gray-600">
        {t('equipment.field.duration')}
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
        title={t('equipment.field.weekendTitle')}
        onChange={(event) => setForm({ ...form, weekendWork: event.target.value as WeekendWork })}
      >
        <option value="none">{t('weekend.none.long')}</option>
        <option value="saturday">{t('weekend.saturday.long')}</option>
        <option value="both">{t('weekend.both.long')}</option>
      </select>
      <select
        className="pm-field"
        value={form.engineerPrimaryId}
        onChange={(event) => setForm({ ...form, engineerPrimaryId: event.target.value })}
      >
        <option value="">{t('equipment.field.engineerPrimary')}</option>
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
        <option value="">{t('equipment.field.engineerSecondary')}</option>
        {engineers.map((engineer) => (
          <option key={engineer.id} value={engineer.id}>
            {engineer.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-gray-600">
        {t('equipment.field.color')}
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
        {t('equipment.field.needsShutdown')}
      </label>
      <label className="flex items-center gap-1 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(event) => setForm({ ...form, active: event.target.checked })}
        />
        {t('equipment.field.active')}
      </label>
    </FormModal>
  );
}

// CRUD equipamentos (secção 3) — zone_id é sempre derivado do hospital seleccionado (secção 4, regra 1).
export function Equipment() {
  const t = useT();
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

  // Procura sobre as treze colunas, cada uma pelo texto que mostra: os números vão a
  // texto, os sim/não e o estado pelos rótulos que se leem na linha, e os engenheiros
  // pelo nome (a linha nunca mostra o id).
  const filteredEquipment = useMemo(() => {
    const engineerName = (id: string | null) => engineers.find((engineer) => engineer.id === id)?.name ?? null;
    return equipment.filter((item) =>
      matchesSearch(searchText, [
        item.name,
        item.hospital_name,
        item.hospital_short_name,
        item.zone_code,
        item.zone_name,
        item.model,
        item.serial_number,
        item.modality,
        String(item.pm_per_year),
        String(item.pm_duration_days),
        item.needs_shutdown ? t('common.yes') : t('common.no'),
        t(WEEKEND_WORK_KEYS[item.weekend_work]),
        engineerName(item.engineer_primary_id),
        engineerName(item.engineer_secondary_id),
        item.active ? t('equipment.state.active') : t('equipment.state.inactive'),
      ]),
    );
  }, [equipment, engineers, searchText, t]);

  // Os extractores dependem da lista de engenheiros (as colunas de engenheiro mostram o
  // nome, não o id) — daí virem de um useMemo em vez de uma constante de módulo.
  const equipmentSort = useMemo<SortAccessors<EquipmentFull, EquipmentSortKey>>(() => {
    const engineerName = (id: string | null) => engineers.find((engineer) => engineer.id === id)?.name ?? null;
    return {
      name: (item) => item.name,
      hospital: (item) => item.hospital_name,
      zone: (item) => item.zone_code,
      model: (item) => item.model,
      serialNumber: (item) => item.serial_number,
      modality: (item) => item.modality,
      pmPerYear: (item) => item.pm_per_year,
      pmDurationDays: (item) => item.pm_duration_days,
      needsShutdown: (item) => item.needs_shutdown,
      weekendWork: (item) => WEEKEND_WORK_RANK[item.weekend_work],
      engineerPrimary: (item) => engineerName(item.engineer_primary_id),
      engineerSecondary: (item) => engineerName(item.engineer_secondary_id),
      active: (item) => item.active,
    };
  }, [engineers]);

  const { rows: visibleEquipment, sortableProps } = useTableSort(filteredEquipment, equipmentSort, 'name');

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
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('equipment.createFailed') });
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
      .filter((row): row is ParsedImportRow<EquipmentInsert> & { data: EquipmentInsert } => row.data !== null)
      .map((row) => ({ rowNumber: row.rowNumber, data: row.data }));

    setImporting(true);
    try {
      const { success, errors } = await bulkCreateEquipment(validRows);
      pushToast({
        variant: errors.length > 0 ? 'warning' : 'success',
        message:
          errors.length > 0
            ? t('equipment.importedWithErrors', {
                count: success,
                failed: errors.length,
                rows: errors.map((e) => t('import.rowNumber', { row: e.rowNumber })).join(', '),
              })
            : t('equipment.imported', { count: success }),
      });
      closeImport();
    } finally {
      setImporting(false);
    }
  }

  return (
    <PageShell wide>
      <PageHeader
        title={t('equipment.title')}
        description={t('equipment.description')}
        actions={
          canManageEquipment && (
            <>
              <ImportExportButtons onExport={handleExport} onFileSelected={handleFileSelected} />
              <Button onClick={() => setCreating(true)}>{t('equipment.add')}</Button>
            </>
          )
        }
      />

      <Card
        padded={false}
        title={t('equipment.count', { count: filteredEquipment.length })}
        actions={
          <SearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder={t('equipment.searchPlaceholder')}
            className="w-72"
          />
        }
      >
        <div className="overflow-x-auto">
        <table className="pm-table">
          <thead>
            <tr>
              <SortableTh {...sortableProps('name')}>{t('common.name')}</SortableTh>
              <SortableTh {...sortableProps('hospital')}>{t('common.hospital')}</SortableTh>
              <SortableTh {...sortableProps('zone')}>{t('common.zone')}</SortableTh>
              <SortableTh {...sortableProps('model')}>{t('common.model')}</SortableTh>
              <SortableTh {...sortableProps('serialNumber')}>{t('equipment.col.serialNumber')}</SortableTh>
              <SortableTh {...sortableProps('modality')}>{t('common.modality')}</SortableTh>
              <SortableTh {...sortableProps('pmPerYear')}>{t('equipment.col.pmPerYear')}</SortableTh>
              <SortableTh {...sortableProps('pmDurationDays')}>{t('equipment.col.duration')}</SortableTh>
              <SortableTh {...sortableProps('needsShutdown')}>{t('equipment.col.shutdown')}</SortableTh>
              <SortableTh {...sortableProps('weekendWork')}>{t('equipment.col.weekend')}</SortableTh>
              <SortableTh {...sortableProps('engineerPrimary')}>{t('equipment.col.engineerPrimary')}</SortableTh>
              <SortableTh {...sortableProps('engineerSecondary')}>{t('equipment.col.engineerSecondary')}</SortableTh>
              <SortableTh {...sortableProps('active')}>{t('equipment.col.active')}</SortableTh>
              <th className="py-1.5 pr-2" />
            </tr>
          </thead>
          <tbody>
            {visibleEquipment.map((item) => (
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
                <Button onClick={() => setCreating(true)}>{t('equipment.add')}</Button>
              ) : undefined
            }
          >
            {equipment.length === 0 ? t('equipment.empty') : t('equipment.noMatch')}
          </EmptyState>
        )}
      </Card>

      {creating && (
        <EquipmentFormModal
          t={t}
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
          title={t('equipment.importTitle')}
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
