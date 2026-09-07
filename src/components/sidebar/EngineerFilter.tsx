import { useMemo, useState } from 'react';
import { useEngineerStore, useZoneStore } from '../../stores';
import { expandZoneSelection } from '../../lib/zoneTree';
import type { EngineerWithZones, Zone } from '../../types';
import { SIDEBAR_INDENT_PX, SidebarSection } from './SidebarSection';
import { useT } from '../../i18n';

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
  const t = useT();

  if (!zoneHasContent(zone.id)) return null;

  const children = allZones.filter((candidate) => candidate.parent_zone_id === zone.id);
  const directEngineers = engineersByZone.get(zone.id) ?? [];
  const collapsed = collapsedZoneIds.has(zone.id);

  return (
    <>
      <div
        className="pm-sidebar-row hover:bg-gray-50"
        style={{ marginLeft: depth * SIDEBAR_INDENT_PX }}
      >
        <button
          type="button"
          onClick={() => onToggleCollapse(zone.id)}
          aria-label={
            collapsed
              ? t('sidebar.expandSection', { name: zone.name })
              : t('sidebar.collapseSection', { name: zone.name })
          }
          className="pm-sidebar-caret"
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="pm-sidebar-group">{zone.name}</span>
      </div>
      {!collapsed && (
        <>
          {directEngineers.map((engineer) => (
            <label
              key={engineer.id}
              className="pm-sidebar-row hover:bg-gray-50"
              style={{ marginLeft: (depth + 1) * SIDEBAR_INDENT_PX }}
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
  const t = useT();
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

  // Agrupa por zona primária — cada engenheiro aparece uma única vez, sob essa zona na
  // árvore.
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
    <SidebarSection title={t('sidebar.engineers')}>
      <div className="flex flex-col">
        <label className="pm-sidebar-row hover:bg-gray-50">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <span>{t('sidebar.allMasc')}</span>
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
            <div className="pm-sidebar-row">
              <span className="w-3.5 shrink-0" />
              <span className="pm-sidebar-group">{t('sidebar.noZone')}</span>
            </div>
            {unassignedEngineers.map((engineer) => (
              <label
                key={engineer.id}
                className="pm-sidebar-row hover:bg-gray-50"
                style={{ marginLeft: SIDEBAR_INDENT_PX }}
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
    </SidebarSection>
  );
}
