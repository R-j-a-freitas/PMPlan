import { useEngineerStore, useUiStore, useZoneStore } from '../../stores';
import type { EngineerWithZones, Zone } from '../../types';

interface ZoneEngineersProps {
  zoneId: string;
  /** Só admin (canManageZones) pode alterar — outros vêem a lista em modo leitura. */
  readOnly: boolean;
}

// Zonas-mãe (Northwest, etc.) até à raiz — usado para mostrar quem cobre esta zona por
// herança (ex: atribuído à zona-mãe), sem precisar de estar listado directamente aqui.
function getAncestorIds(zoneId: string, zones: Zone[]): string[] {
  const result: string[] = [];
  let current = zones.find((zone) => zone.id === zoneId);
  while (current?.parent_zone_id) {
    result.push(current.parent_zone_id);
    current = zones.find((zone) => zone.id === current?.parent_zone_id);
  }
  return result;
}

// Gestão de engenheiros por zona (secção: "na definição de zona, também têm de ter os
// engenheiros"). Reaproveita o RPC set_engineer_zones existente, recalculando a lista
// completa de zonas do engenheiro para não apagar as outras atribuições dele.
export function ZoneEngineers({ zoneId, readOnly }: ZoneEngineersProps) {
  const engineers = useEngineerStore((state) => state.engineers);
  const setEngineerZones = useEngineerStore((state) => state.setEngineerZones);
  const zones = useZoneStore((state) => state.zones);
  const pushToast = useUiStore((state) => state.pushToast);

  const ancestorIds = getAncestorIds(zoneId, zones);
  const inheritedEngineers = engineers.filter(
    (engineer) =>
      !engineer.zones.some((zone) => zone.zone_id === zoneId) &&
      engineer.zones.some((zone) => ancestorIds.includes(zone.zone_id)),
  );

  async function toggle(engineer: EngineerWithZones, checked: boolean) {
    const currentZoneIds = engineer.zones.map((zone) => zone.zone_id);
    const newZoneIds = checked
      ? Array.from(new Set([...currentZoneIds, zoneId]))
      : currentZoneIds.filter((id) => id !== zoneId);

    const newPrimary =
      engineer.primary_zone_id && newZoneIds.includes(engineer.primary_zone_id)
        ? engineer.primary_zone_id
        : (newZoneIds[0] ?? null);

    try {
      await setEngineerZones(engineer.id, newZoneIds, newPrimary);
    } catch (err) {
      pushToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Falha ao actualizar a zona do engenheiro.',
      });
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold uppercase text-gray-500">Engenheiros desta zona</h4>
      {engineers.length === 0 && <p className="text-sm text-gray-400">Sem engenheiros registados.</p>}
      {engineers.map((engineer) => {
        const covers = engineer.zones.some((zone) => zone.zone_id === zoneId);
        return (
          <label key={engineer.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={covers}
              disabled={readOnly}
              onChange={(event) => toggle(engineer, event.target.checked)}
            />
            {engineer.name}
            {engineer.primary_zone_id === zoneId && (
              <span className="text-xs text-gray-400">(principal)</span>
            )}
          </label>
        );
      })}

      {inheritedEngineers.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <h5 className="text-xs font-semibold uppercase text-gray-400">Herdados da zona-mãe</h5>
          {inheritedEngineers.map((engineer) => (
            <p key={engineer.id} className="text-sm text-gray-500">
              {engineer.name}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
