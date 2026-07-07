import { useMemo, useState } from 'react';
import { useEngineerStore, useZoneStore } from '../../stores';
import { expandZoneSelection } from '../../lib/zoneTree';
import type { EngineerWithZones, Zone } from '../../types';

interface EngineerZoneNodeProps {
  zone: Zone;
  depth: number;
  allZones: Zone[];
  engineersByZone: Map<string, EngineerWithZones[]>;
  zoneHasContent: (zoneId: string) => boolean;
  selectedEngineerIds: string[];
  onToggleEngineer: (id: string) => void;
  collapsedZoneIds: Set<string>;
  onToggleCollapse: (id: string) => void;
}

function EngineerZoneNode({
  zone,
  depth,
  allZones,
  engineersByZone,
  zoneHasContent,
  selectedEngineerIds,
  onToggleEngineer,
  collapsedZoneIds,
  onToggleCollapse,
}: EngineerZoneNodeProps) {
  if (!zoneHasContent(zone.id)) return null;

  const children = allZones.filter((candidate) => candidate.parent_zone_id === zone.id);
  const directEngineers = engineersByZone.get(zone.id) ?? [];
  const collapsed = collapsedZoneIds.has(zone.id);

  return (
    <>
      <div className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-gray-50" style={{ marginLeft: depth * 16 }}>
        <button
          type="button"
          onClick={() => onToggleCollapse(zone.id)}
          aria-label={collapsed ? `Expandir ${zone.name}` : `Colapsar ${zone.name}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: zone.color }} />
        <span className="truncate text-xs font-medium text-gray-600">{zone.name}</span>
      </div>
      {!collapsed && (
        <>
          {directEngineers.map((engineer) => (
            <label
              key={engineer.id}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-gray-50"
              style={{ marginLeft: (depth + 1) * 16 }}
            >
              <input
                type="checkbox"
                checked={selectedEngineerIds.includes(engineer.id)}
                onChange={() => onToggleEngineer(engineer.id)}
              />
              <span className="truncate">{engineer.name}</span>
            </label>
          ))}
          {children.map((child) => (
            <EngineerZoneNode
              key={child.id}
              zone={child}
              depth={depth + 1}
              allZones={allZones}
              engineersByZone={engineersByZone}
              zoneHasContent={zoneHasContent}
              selectedEngineerIds={selectedEngineerIds}
              onToggleEngineer={onToggleEngineer}
              collapsedZoneIds={collapsedZoneIds}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </>
      )}
    </>
  );
}

// Filtro multi-selecção de engenheiros (secção 6), organizado pela mesma hierarquia de
// zonas do ZoneScopeFilter (zona-mãe agrupando zonas filhas) — cada zona é colapsável
// para poupar espaço, tal como nas Zonas. Marcar engenheiros filtra o calendário em OR
// com zonas/equipamentos marcados (ver MainCalendar) — o calendário reflecte sempre
// exactamente o que está marcado; nada marcado em lado nenhum do planeamento =
// calendário vazio, não "mostra todos". A lista é restringida pelas zonas marcadas em
// ZoneScopeFilter (mostra só engenheiros das zonas em âmbito).
export function EngineerFilter() {
  const engineers = useEngineerStore((state) => state.engineers);
  const selectedEngineerIds = useEngineerStore((state) => state.selectedEngineerIds);
  const toggleEngineerSelection = useEngineerStore((state) => state.toggleEngineerSelection);
  const setSelectedEngineerIds = useEngineerStore((state) => state.setSelectedEngineerIds);
  const zones = useZoneStore((state) => state.zones);
  const selectedZoneIds = useZoneStore((state) => state.selectedZoneIds);

  const [collapsedZoneIds, setCollapsedZoneIds] = useState<Set<string>>(new Set());

  function toggleCollapse(id: string) {
    setCollapsedZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleEngineers = useMemo(() => {
    if (selectedZoneIds.length === 0) return engineers;
    const expanded = expandZoneSelection(selectedZoneIds, zones);
    return engineers.filter((engineer) => engineer.zones.some((zone) => expanded.has(zone.zone_id)));
  }, [engineers, zones, selectedZoneIds]);

  // Agrupa por zona primária (mesma zona usada antes para o "pontinho" de cor) — cada
  // engenheiro aparece uma única vez, sob essa zona na árvore.
  const engineersByZone = useMemo(() => {
    const map = new Map<string, EngineerWithZones[]>();
    for (const engineer of visibleEngineers) {
      if (!engineer.primary_zone_id) continue;
      const list = map.get(engineer.primary_zone_id) ?? [];
      list.push(engineer);
      map.set(engineer.primary_zone_id, list);
    }
    return map;
  }, [visibleEngineers]);

  const unassignedEngineers = useMemo(
    () => visibleEngineers.filter((engineer) => !engineer.primary_zone_id),
    [visibleEngineers],
  );

  // Uma zona só aparece na árvore se tiver engenheiros directos ou alguma zona filha com
  // conteúdo — evita cabeçalhos de zona vazios a poluir a lista.
  const zoneHasContent = useMemo(() => {
    const cache = new Map<string, boolean>();
    function compute(zoneId: string): boolean {
      if (cache.has(zoneId)) return cache.get(zoneId)!;
      const hasDirect = (engineersByZone.get(zoneId)?.length ?? 0) > 0;
      const hasChildWithContent = zones
        .filter((candidate) => candidate.parent_zone_id === zoneId)
        .some((child) => compute(child.id));
      const result = hasDirect || hasChildWithContent;
      cache.set(zoneId, result);
      return result;
    }
    return (zoneId: string) => compute(zoneId);
  }, [zones, engineersByZone]);

  const topLevelZones = zones.filter((zone) => !zone.parent_zone_id);

  const allSelected =
    visibleEngineers.length > 0 && visibleEngineers.every((engineer) => selectedEngineerIds.includes(engineer.id));

  // Marca/desmarca de uma vez todos os engenheiros actualmente visíveis (já restringidos
  // pela zona) — é assim que se vê "todos os engenheiros dessa zona-mãe" com um clique.
  function toggleAll() {
    if (allSelected) {
      const visibleIds = new Set(visibleEngineers.map((engineer) => engineer.id));
      setSelectedEngineerIds(selectedEngineerIds.filter((id) => !visibleIds.has(id)));
    } else {
      setSelectedEngineerIds([...new Set([...selectedEngineerIds, ...visibleEngineers.map((e) => e.id)])]);
    }
  }

  return (
    <div className="border-b border-gray-200 p-2">
      <h3 className="mb-1 px-1 text-xs font-semibold uppercase text-gray-500">Engenheiros</h3>
      <div className="flex flex-col gap-0.5">
        <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-gray-50">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <span>Todos</span>
        </label>
        {topLevelZones.map((zone) => (
          <EngineerZoneNode
            key={zone.id}
            zone={zone}
            depth={0}
            allZones={zones}
            engineersByZone={engineersByZone}
            zoneHasContent={zoneHasContent}
            selectedEngineerIds={selectedEngineerIds}
            onToggleEngineer={toggleEngineerSelection}
            collapsedZoneIds={collapsedZoneIds}
            onToggleCollapse={toggleCollapse}
          />
        ))}
        {unassignedEngineers.length > 0 && (
          <>
            <div className="flex items-center gap-1 rounded-md px-1 py-1">
              <span className="w-5 shrink-0" />
              <span className="truncate text-xs font-medium text-gray-600">Sem zona</span>
            </div>
            {unassignedEngineers.map((engineer) => (
              <label
                key={engineer.id}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-gray-50"
                style={{ marginLeft: 16 }}
              >
                <input
                  type="checkbox"
                  checked={selectedEngineerIds.includes(engineer.id)}
                  onChange={() => toggleEngineerSelection(engineer.id)}
                />
                <span className="truncate">{engineer.name}</span>
              </label>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
