import { useState } from 'react';
import { useHospitalStore, useUiStore, useZoneStore } from '../../stores';
import type { Zone } from '../../types';
import { Badge, Button } from '../ui';
import { ZoneEngineers } from './ZoneEngineers';

interface ZoneNodeProps {
  zone: Zone;
  depth: number;
  allZones: Zone[];
  canManageZones: boolean;
}

function buildForm(zone: Zone) {
  return { name: zone.name, code: zone.code, color: zone.color, parentZoneId: zone.parent_zone_id ?? '' };
}

// Todos os descendentes de uma zona — usado para nunca a deixar escolher um dos seus
// próprios filhos/netos como zona-mãe (o trigger no Postgres também bloqueia, isto é
// só para a UI não deixar tentar).
function getDescendantIds(zoneId: string, allZones: Zone[]): Set<string> {
  const result = new Set<string>();
  const stack = [zoneId];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const candidate of allZones) {
      if (candidate.parent_zone_id === current && !result.has(candidate.id)) {
        result.add(candidate.id);
        stack.push(candidate.id);
      }
    }
  }
  return result;
}

// Nó recursivo da árvore de zonas (secção: zona-mãe "Northwest" agrupando "Galiza",
// "Canárias", etc.) — cada zona gere a sua própria edição e renderiza as suas filhas.
export function ZoneNode({ zone, depth, allZones, canManageZones }: ZoneNodeProps) {
  const updateZone = useZoneStore((state) => state.updateZone);
  const deleteZone = useZoneStore((state) => state.deleteZone);
  const hospitals = useHospitalStore((state) => state.hospitals);
  const pushToast = useUiStore((state) => state.pushToast);

  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => buildForm(zone));

  const children = allZones.filter((candidate) => candidate.parent_zone_id === zone.id);
  const zoneHospitals = hospitals.filter((hospital) => hospital.zone_id === zone.id);
  const descendantIds = getDescendantIds(zone.id, allZones);
  const parentOptions = allZones.filter(
    (candidate) => candidate.id !== zone.id && !descendantIds.has(candidate.id),
  );

  function startEdit() {
    setForm(buildForm(zone));
    setEditing(true);
  }

  async function handleSave() {
    if (!form.name || !form.code) return;
    setSaving(true);
    try {
      await updateZone(zone.id, {
        name: form.name,
        code: form.code,
        color: form.color,
        parent_zone_id: form.parentZoneId || null,
      });
      setEditing(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao actualizar zona.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteZone(zone.id);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao eliminar zona.' });
    }
  }

  return (
    <div style={{ marginLeft: depth * 24 }} className="rounded-md border border-gray-200">
      <div className="flex items-center gap-2 px-3 py-2">
        {editing ? (
          <>
            <input
              type="color"
              className="h-8 w-10 rounded-md border border-gray-300"
              value={form.color}
              onChange={(event) => setForm({ ...form, color: event.target.value })}
            />
            <input
              className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
            <input
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.parentZoneId}
              onChange={(event) => setForm({ ...form, parentZoneId: event.target.value })}
            >
              <option value="">(zona de topo)</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <Badge color={zone.color}>{zone.code}</Badge>
            <span className="text-sm font-medium">{zone.name}</span>
            <span className="text-xs text-gray-400">{zoneHospitals.length} hospital(is)</span>
          </>
        )}
        <div className="ml-auto flex gap-2">
          {editing ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                Guardar
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Fechar' : 'Gerir'}
              </Button>
              {canManageZones && (
                <>
                  <Button variant="secondary" onClick={startEdit}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={handleDelete}>
                    Eliminar
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {expanded && !editing && (
        <div className="grid grid-cols-2 gap-4 border-t border-gray-200 p-3">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">Hospitais</h4>
            {zoneHospitals.length === 0 && <p className="text-sm text-gray-400">Sem hospitais nesta zona.</p>}
            <ul className="flex flex-col gap-0.5 text-sm">
              {zoneHospitals.map((hospital) => (
                <li key={hospital.id}>
                  {hospital.name} <span className="text-xs text-gray-400">({hospital.country})</span>
                </li>
              ))}
            </ul>
          </div>
          <ZoneEngineers zoneId={zone.id} readOnly={!canManageZones} />
        </div>
      )}

      {children.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-gray-200 p-2">
          {children.map((child) => (
            <ZoneNode key={child.id} zone={child} depth={depth + 1} allZones={allZones} canManageZones={canManageZones} />
          ))}
        </div>
      )}
    </div>
  );
}
