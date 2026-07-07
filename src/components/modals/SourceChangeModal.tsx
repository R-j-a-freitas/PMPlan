import { useState } from 'react';
import { useSourceChanges } from '../../hooks';
import { useEquipmentStore, useUiStore } from '../../stores';
import { Button, DateInput } from '../ui';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          Trocas de fonte — {equipment?.name ?? 'Equipamento'}
        </h2>

        <div className="mb-3 max-h-40 overflow-y-auto rounded-md border border-gray-200">
          {loading && <p className="p-2 text-sm text-gray-500">A carregar…</p>}
          {!loading && sourceChanges.length === 0 && (
            <p className="p-2 text-sm text-gray-500">Sem trocas registadas.</p>
          )}
          {sourceChanges.map((change) => (
            <div key={change.id} className="border-b border-gray-100 px-2 py-1.5 text-sm last:border-0">
              <span className="font-medium">{toDisplayDate(change.planned_date)}</span> — {change.source_type}
              {change.initial_activity_gbq != null && ` (${change.initial_activity_gbq} GBq)`}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Tipo de fonte
            <input
              className="rounded-md border border-gray-300 px-2 py-1"
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Actividade inicial (GBq)
            <input
              type="number"
              className="rounded-md border border-gray-300 px-2 py-1"
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
              className="rounded-md border border-gray-300 px-2 py-1"
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm">
            Fabricante
            <input
              className="rounded-md border border-gray-300 px-2 py-1"
              value={manufacturer}
              onChange={(event) => setManufacturer(event.target.value)}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm">
            Notas
            <textarea
              className="rounded-md border border-gray-300 px-2 py-1"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}
