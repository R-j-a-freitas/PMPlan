import { useState } from 'react';
import { useSourceChanges } from '../../hooks';
import { useEquipmentStore, useUiStore } from '../../stores';
import { Button, DateInput, EmptyState, Modal } from '../ui';
import { toDisplayDate } from '../../lib/dateFormat';

interface SourceChangeModalProps {
  equipmentId: string;
  onClose: () => void;
}

// Troca de fonte radioactiva — específico de equipamentos de Braquiterapia (secção 1).
export function SourceChangeModal({ equipmentId, onClose }: SourceChangeModalProps) {
  const equipment = useEquipmentStore((state) => state.equipment.find((item) => item.id === equipmentId));
  const { sourceChanges, createSourceChange, loading } = useSourceChanges(equipmentId);
  const pushToast = useUiStore((state) => state.pushToast);

  const [sourceType, setSourceType] = useState('Ir-192');
  const [initialActivity, setInitialActivity] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!plannedDate) {
      pushToast({ variant: 'error', message: 'Indique a data planeada.' });
      return;
    }
    setSaving(true);
    try {
      await createSourceChange({
        equipment_id: equipmentId,
        source_type: sourceType,
        initial_activity_gbq: initialActivity ? Number(initialActivity) : null,
        planned_date: plannedDate,
        actual_date: null,
        serial_number: serialNumber || null,
        manufacturer: manufacturer || null,
        notes: notes || null,
        status: 'planned',
      });
      setPlannedDate('');
      setInitialActivity('');
      setSerialNumber('');
      setManufacturer('');
      setNotes('');
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao gravar.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Trocas de fonte — ${equipment?.name ?? 'Equipamento'}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'A guardar…' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <div className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-gray-200">
        {loading && <EmptyState size="compact">A carregar…</EmptyState>}
        {!loading && sourceChanges.length === 0 && <EmptyState size="compact">Sem trocas registadas.</EmptyState>}
        {sourceChanges.map((change) => (
          <div key={change.id} className="border-b border-gray-100 px-3 py-2 text-sm last:border-0">
            <span className="font-medium text-gray-800">{toDisplayDate(change.planned_date)}</span> —{' '}
            {change.source_type}
            {change.initial_activity_gbq != null && ` (${change.initial_activity_gbq} GBq)`}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Tipo de fonte
            <input
              className="pm-field"
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Actividade inicial (GBq)
            <input
              type="number"
              className="pm-field"
              value={initialActivity}
              onChange={(event) => setInitialActivity(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Data planeada
            <DateInput value={plannedDate} onChange={setPlannedDate} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Nº de série
            <input
              className="pm-field"
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm">
            Fabricante
            <input
              className="pm-field"
              value={manufacturer}
              onChange={(event) => setManufacturer(event.target.value)}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm">
            Notas
            <textarea
              className="pm-field"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
        </label>
      </div>
    </Modal>
  );
}
