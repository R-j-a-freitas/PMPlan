import { useEffect, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { ZoneNode } from '../components/settings';
import { useAuthStore, useHospitalStore, useUiStore, useZoneStore } from '../stores';
import { Button } from '../components/ui';

const EMPTY_FORM = { name: '', code: '', color: '#6B7280', parentZoneId: '' };

// Configurações → Zonas (secção 3/4): CRUD completo pelo admin — nome, hospitais e
// engenheiros da zona. Hierárquica: uma zona-mãe (ex: "Northwest") pode agrupar
// várias zonas-filhas (ex: "Galiza", "Canárias") — ver ZoneNode para a árvore.
export function Settings() {
  const canManageZones = useAuthStore((state) => state.permissions.canManageZones);
  const zones = useZoneStore((state) => state.zones);
  const fetchZones = useZoneStore((state) => state.fetchZones);
  const createZone = useZoneStore((state) => state.createZone);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const pushToast = useUiStore((state) => state.pushToast);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchZones();
    fetchHospitals();
  }, [fetchZones, fetchHospitals]);

  async function handleCreate() {
    if (!form.name || !form.code) return;
    setSaving(true);
    try {
      await createZone({
        name: form.name,
        code: form.code,
        description: null,
        color: form.color,
        parent_zone_id: form.parentZoneId || null,
        active: true,
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao criar zona.' });
    } finally {
      setSaving(false);
    }
  }

  const topLevelZones = zones.filter((zone) => zone.parent_zone_id === null);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-4 text-lg font-semibold text-gray-900">Configurações — Zonas</h1>

        {canManageZones && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
            <input
              placeholder="Nome (ex: Galiza)"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <input
              placeholder="Código (ex: ES-GAL)"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.parentZoneId}
              onChange={(event) => setForm({ ...form, parentZoneId: event.target.value })}
            >
              <option value="">(zona de topo, sem zona-mãe)</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
            <input
              type="color"
              className="h-8 w-10 rounded-md border border-gray-300"
              value={form.color}
              onChange={(event) => setForm({ ...form, color: event.target.value })}
            />
            <Button onClick={handleCreate} disabled={saving || !form.name || !form.code}>
              Adicionar zona
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {topLevelZones.map((zone) => (
            <ZoneNode key={zone.id} zone={zone} depth={0} allZones={zones} canManageZones={canManageZones} />
          ))}
        </div>
      </div>
    </div>
  );
}
