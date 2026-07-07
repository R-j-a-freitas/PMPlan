import { useState } from 'react';
import { useEngineerStore, useEquipmentStore, useHospitalStore, useUiStore } from '../../stores';
import { KNOWN_MODALITIES } from '../../types';
import type { EquipmentFull, PmPerYear, WeekendWork } from '../../types';
import { Badge, Button } from '../ui';

interface EquipmentRowProps {
  item: EquipmentFull;
  canManageEquipment: boolean;
}

const WEEKEND_WORK_LABELS: Record<string, string> = {
  none: 'Só úteis',
  saturday: 'Sáb',
  both: 'Sáb+Dom',
};

function buildForm(item: EquipmentFull) {
  return {
    name: item.name,
    hospitalId: item.hospital_id,
    model: item.model ?? '',
    serialNumber: item.serial_number ?? '',
    engineerPrimaryId: item.engineer_primary_id ?? '',
    engineerSecondaryId: item.engineer_secondary_id ?? '',
    modality: item.modality,
    pmPerYear: String(item.pm_per_year) as `${PmPerYear}`,
    pmDurationDays: String(item.pm_duration_days),
    needsShutdown: item.needs_shutdown,
    weekendWork: item.weekend_work,
    color: item.color,
    active: item.active,
  };
}

// Linha de equipamento com edição inline — mesmos campos do formulário de criação em
// Equipment.tsx e do export/import (secção: "tudo o que o admin criar, também tem de
// editar"). Fabricante fica de fora (sempre a mesma marca, não vale a pena por linha).
export function EquipmentRow({ item, canManageEquipment }: EquipmentRowProps) {
  const hospitals = useHospitalStore((state) => state.hospitals);
  const engineers = useEngineerStore((state) => state.engineers);
  const updateEquipment = useEquipmentStore((state) => state.updateEquipment);
  const deleteEquipment = useEquipmentStore((state) => state.deleteEquipment);
  const pushToast = useUiStore((state) => state.pushToast);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => buildForm(item));

  function startEdit() {
    setForm(buildForm(item));
    setEditing(true);
  }

  async function handleSave() {
    const hospital = hospitals.find((candidate) => candidate.id === form.hospitalId);
    if (!form.name || !hospital) return;
    setSaving(true);
    try {
      await updateEquipment(item.id, {
        name: form.name,
        model: form.model || null,
        serial_number: form.serialNumber || null,
        modality: form.modality,
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
      setEditing(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao actualizar equipamento.' });
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const engineerPrimary = engineers.find((engineer) => engineer.id === item.engineer_primary_id);
    const engineerSecondary = engineers.find((engineer) => engineer.id === item.engineer_secondary_id);
    return (
      <tr className="border-b border-gray-100">
        <td className="flex items-center gap-2 py-1.5 pr-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          {item.name}
        </td>
        <td className="py-1.5 pr-2">{item.hospital_name}</td>
        <td className="py-1.5 pr-2">
          <Badge color={item.zone_color}>{item.zone_code}</Badge>
        </td>
        <td className="py-1.5 pr-2">{item.model ?? '—'}</td>
        <td className="py-1.5 pr-2">{item.serial_number ?? '—'}</td>
        <td className="py-1.5 pr-2">{item.modality}</td>
        <td className="py-1.5 pr-2">{item.pm_per_year}</td>
        <td className="py-1.5 pr-2">{item.pm_duration_days}</td>
        <td className="py-1.5 pr-2">{item.needs_shutdown ? 'Sim' : 'Não'}</td>
        <td className="py-1.5 pr-2">{WEEKEND_WORK_LABELS[item.weekend_work] ?? '—'}</td>
        <td className="py-1.5 pr-2">{engineerPrimary?.name ?? '—'}</td>
        <td className="py-1.5 pr-2">{engineerSecondary?.name ?? '—'}</td>
        <td className="py-1.5 pr-2">{item.active ? 'Sim' : 'Não'}</td>
        <td className="py-1.5 pr-2 text-right">
          {canManageEquipment && (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={startEdit}>
                Editar
              </Button>
              <Button variant="danger" onClick={() => deleteEquipment(item.id)}>
                Eliminar
              </Button>
            </div>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-100">
      <td className="py-1.5 pr-2">
        <div className="flex items-center gap-1">
          <input
            type="color"
            className="h-7 w-8 shrink-0 rounded-md border border-gray-300"
            value={form.color}
            onChange={(event) => setForm({ ...form, color: event.target.value })}
          />
          <input
            className="w-full rounded-md border border-gray-300 px-2 py-1"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
      </td>
      <td className="py-1.5 pr-2">
        <select
          className="rounded-md border border-gray-300 px-2 py-1"
          value={form.hospitalId}
          onChange={(event) => setForm({ ...form, hospitalId: event.target.value })}
        >
          {hospitals.map((hospital) => (
            <option key={hospital.id} value={hospital.id}>
              {hospital.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <Badge color={item.zone_color}>{item.zone_code}</Badge>
      </td>
      <td className="py-1.5 pr-2">
        <input
          className="w-full rounded-md border border-gray-300 px-2 py-1"
          value={form.model}
          onChange={(event) => setForm({ ...form, model: event.target.value })}
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          className="w-full rounded-md border border-gray-300 px-2 py-1"
          value={form.serialNumber}
          onChange={(event) => setForm({ ...form, serialNumber: event.target.value })}
        />
      </td>
      <td className="py-1.5 pr-2">
        <select
          className="rounded-md border border-gray-300 px-2 py-1"
          value={form.modality}
          onChange={(event) => setForm({ ...form, modality: event.target.value })}
        >
          {KNOWN_MODALITIES.map((modality) => (
            <option key={modality} value={modality}>
              {modality}
            </option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <select
          className="rounded-md border border-gray-300 px-2 py-1"
          value={form.pmPerYear}
          onChange={(event) => setForm({ ...form, pmPerYear: event.target.value as `${PmPerYear}` })}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}x/ano
            </option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="number"
          min={1}
          className="w-16 rounded-md border border-gray-300 px-2 py-1"
          value={form.pmDurationDays}
          onChange={(event) => setForm({ ...form, pmDurationDays: event.target.value })}
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="checkbox"
          checked={form.needsShutdown}
          onChange={(event) => setForm({ ...form, needsShutdown: event.target.checked })}
        />
      </td>
      <td className="py-1.5 pr-2">
        <select
          className="rounded-md border border-gray-300 px-2 py-1"
          value={form.weekendWork}
          onChange={(event) => setForm({ ...form, weekendWork: event.target.value as WeekendWork })}
        >
          <option value="none">Só úteis</option>
          <option value="saturday">Inclui sáb</option>
          <option value="both">Sáb+Dom</option>
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <select
          className="rounded-md border border-gray-300 px-2 py-1"
          value={form.engineerPrimaryId}
          onChange={(event) => setForm({ ...form, engineerPrimaryId: event.target.value })}
        >
          <option value="">—</option>
          {engineers.map((engineer) => (
            <option key={engineer.id} value={engineer.id}>
              {engineer.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <select
          className="rounded-md border border-gray-300 px-2 py-1"
          value={form.engineerSecondaryId}
          onChange={(event) => setForm({ ...form, engineerSecondaryId: event.target.value })}
        >
          <option value="">—</option>
          {engineers.map((engineer) => (
            <option key={engineer.id} value={engineer.id}>
              {engineer.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(event) => setForm({ ...form, active: event.target.checked })}
        />
      </td>
      <td className="py-1.5 pr-2 text-right">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Guardar
          </Button>
        </div>
      </td>
    </tr>
  );
}
