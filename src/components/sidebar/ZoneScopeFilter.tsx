import { useEffect, useState } from 'react';
import { useEquipmentStore, useZoneStore } from '../../stores';
import { expandZoneSelection } from '../../lib/zoneTree';
import type { Zone } from '../../types';

interface ZoneRowProps {
  zone: Zone;
  depth: number;
  allZones: Zone[];
  selectedZoneIds: string[];
  onToggle: (id: string) => void;
  collapsedZoneIds: Set<string>;
  onToggleCollapse: (id: string) => void;
}

function ZoneRow({
  zone,
  depth,
  allZones,
  selectedZoneIds,
  onToggle,
  collapsedZoneIds,
  onToggleCollapse,
}: ZoneRowProps) {
  const children = allZones.filter((candidate) => candidate.parent_zone_id === zone.id);
  const hasChildren = children.length > 0;
  const collapsed = collapsedZoneIds.has(zone.id);

  return (
    <>
      <div className="flex items-center gap-1 rounded-md hover:bg-gray-50" style={{ marginLeft: depth * 16 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleCollapse(zone.id)}
            aria-label={collapsed ? `Expandir ${zone.name}` : `Colapsar ${zone.name}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
          >
            {collapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <label className="flex flex-1 items-center gap-2 px-1 py-1 text-sm">
          <input type="checkbox" checked={selectedZoneIds.includes(zone.id)} onChange={() => onToggle(zone.id)} />
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: zone.color }} />
          <span className="truncate">{zone.name}</span>
        </label>
      </div>
      {hasChildren &&
        !collapsed &&
        children.map((child) => (
          <ZoneRow
            key={child.id}
            zone={child}
            depth={depth + 1}
            allZones={allZones}
            selectedZoneIds={selectedZoneIds}
            onToggle={onToggle}
            collapsedZoneIds={collapsedZoneIds}
            onToggleCollapse={onToggleCollapse}
          />
        ))}
    </>
  );
}

// Filtro hierárquico por zona (zona-mãe ex. "NorthWest" agrupando zonas filhas como
// "Galiza"/"Lisboa"): marcar a zona-mãe dá logo acesso, nas listas de Engenheiros e
// Equipamentos abaixo, a todos os engenheiros/equipamentos das zonas filhas — sem as
// marcar uma a uma. Marcar só uma zona filha restringe às pessoas/máquinas dessa zona.
// Também filtra o calendário directamente em OR com engenheiros/equipamentos marcados
// (ver MainCalendar) — restringe ao mesmo tempo o que aparece nas listas seleccionáveis.
export function ZoneScopeFilter() {
  const zones = useZoneStore((state) => state.zones);
  const selectedZoneIds = useZoneStore((state) => state.selectedZoneIds);
  const toggleZoneSelection = useZoneStore((state) => state.toggleZoneSelection);
  const setZoneFilter = useEquipmentStore((state) => state.setZoneFilter);

  // Colapsar uma zona-mãe esconde as filhas só visualmente (poupa espaço no ecrã) — não
  // mexe na selecção/filtro, que continua a vir de `selectedZoneIds` independentemente
  // de estarem visíveis ou não.
  const [collapsedZoneIds, setCollapsedZoneIds] = useState<Set<string>>(new Set());

  function toggleCollapse(id: string) {
    setCollapsedZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const topLevelZones = zones.filter((zone) => !zone.parent_zone_id);

  // EquipmentList já filtra por `filters.zoneIds` (store) — mantém esse filtro
  // sincronizado com a selecção daqui, já expandida para incluir as zonas filhas.
  useEffect(() => {
    const expanded =
      selectedZoneIds.length === 0 ? [] : Array.from(expandZoneSelection(selectedZoneIds, zones));
    setZoneFilter(expanded);
  }, [selectedZoneIds, zones, setZoneFilter]);

  if (topLevelZones.length === 0) return null;

  return (
    <div className="border-b border-gray-200 p-2">
      <h3 className="mb-1 px-1 text-xs font-semibold uppercase text-gray-500">Zonas</h3>
      <div className="flex flex-col gap-0.5">
        {topLevelZones.map((zone) => (
          <ZoneRow
            key={zone.id}
            zone={zone}
            depth={0}
            allZones={zones}
            selectedZoneIds={selectedZoneIds}
            onToggle={toggleZoneSelection}
            collapsedZoneIds={collapsedZoneIds}
            onToggleCollapse={toggleCollapse}
          />
        ))}
      </div>
    </div>
  );
}
