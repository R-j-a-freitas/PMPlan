import { useEngineerStore, useEquipmentStore } from '../../stores';
import type { PMStatus } from '../../types';
import { DateInput } from '../ui';

const STATUS_OPTIONS: { value: PMStatus; label: string }[] = [
  { value: 'planned', label: 'Planeada' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'in_progress', label: 'Em curso' },
  { value: 'completed', label: 'Concluída' },
  { value: 'delayed', label: 'Atrasada' },
  { value: 'cancelled', label: 'Cancelada' },
];

interface PMEventFormProps {
  equipmentId: string;
  engineerId: string;
  startDate: string;
  endDate: string;
  status: PMStatus;
  notes: string;
  showStatus: boolean;
  /** Modo só-leitura (engineer/readonly, ou utilizador sem canCreatePM/canEditPM). */
  disabled: boolean;
  onEquipmentChange: (id: string) => void;
  onEngineerChange: (id: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onStatusChange: (status: PMStatus) => void;
  onNotesChange: (value: string) => void;
}

export function PMEventForm(props: PMEventFormProps) {
  const equipment = useEquipmentStore((state) => state.equipment);
  const engineers = useEngineerStore((state) => state.engineers);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Equipamento
        <select
          className="rounded-md border border-gray-300 px-2 py-1 disabled:bg-gray-100"
          value={props.equipmentId}
          disabled={props.disabled}
          onChange={(event) => props.onEquipmentChange(event.target.value)}
        >
          <option value="">Seleccionar…</option>
          {equipment.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.hospital_name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Engenheiro
        <select
          className="rounded-md border border-gray-300 px-2 py-1 disabled:bg-gray-100"
          value={props.engineerId}
          disabled={props.disabled}
          onChange={(event) => props.onEngineerChange(event.target.value)}
        >
          <option value="">Seleccionar…</option>
          {engineers.map((engineer) => (
            <option key={engineer.id} value={engineer.id}>
              {engineer.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Início
          <DateInput value={props.startDate} disabled={props.disabled} onChange={props.onStartDateChange} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Fim
          <DateInput value={props.endDate} disabled={props.disabled} onChange={props.onEndDateChange} />
        </label>
      </div>

      {props.showStatus && (
        <label className="flex flex-col gap-1 text-sm">
          Estado
          <select
            className="rounded-md border border-gray-300 px-2 py-1 disabled:bg-gray-100"
            value={props.status}
            disabled={props.disabled}
            onChange={(event) => props.onStatusChange(event.target.value as PMStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Notas
        <textarea
          className="rounded-md border border-gray-300 px-2 py-1 disabled:bg-gray-100"
          rows={2}
          value={props.notes}
          disabled={props.disabled}
          onChange={(event) => props.onNotesChange(event.target.value)}
        />
      </label>
    </div>
  );
}
