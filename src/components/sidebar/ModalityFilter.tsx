import { useEffect, useMemo, useState } from 'react';
import { useEquipmentStore, useZoneStore } from '../../stores';
import { expandZoneSelection } from '../../lib/zoneTree';
import { SidebarSection } from './SidebarSection';

// Filtro por modalidade de equipamento (LINAC, Flexitron, …), agrupado apenas pelas zonas-mãe
// (topo da hierarquia). Sob cada zona-mãe listam-se as modalidades presentes em TODO o seu
// equipamento (agregando as zonas-filha, sem as subdividir). A lista é restringida às zonas em
// âmbito (selectedZoneIds). Marcar modalidades restringe a lista de equipamentos abaixo
// (EquipmentList combina zona AND modalidade AND pesquisa); nada marcado = todas. O filtro é por
// NOME de modalidade — a mesma modalidade em duas zonas-mãe partilha o estado da checkbox.
export function ModalityFilter() {
  const equipment = useEquipmentStore((state) => state.equipment);
  const filters = useEquipmentStore((state) => state.filters);
  const setModalityFilter = useEquipmentStore((state) => state.setModalityFilter);
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

  const visibleEquipment = useMemo(() => {
    if (selectedZoneIds.length === 0) return equipment;
    const expanded = expandZoneSelection(selectedZoneIds, zones);
    return equipment.filter((item) => expanded.has(item.zone_id));
  }, [equipment, zones, selectedZoneIds]);

  // Uma linha por zona-mãe (topo da hierarquia) com as modalidades distintas de todo o seu
  // equipamento — a zona-filha de cada máquina é resolvida para a respectiva mãe. Ignora
  // modalidades vazias (equipment.modality é texto livre e pode vir por preencher). Zonas-mãe
  // sem equipamento em âmbito não aparecem.
  const groups = useMemo(() => {
    const topLevelZones = zones.filter((zone) => !zone.parent_zone_id);
    // zone_id (folha) → zona-mãe. Uma zona-mãe expande para si própria + descendentes.
    const zoneToTop = new Map<string, (typeof topLevelZones)[number]>();
    for (const top of topLevelZones) {
      for (const zoneId of expandZoneSelection([top.id], zones)) zoneToTop.set(zoneId, top);
    }

    const modalitiesByTop = new Map<string, Set<string>>();
    for (const item of visibleEquipment) {
      if (!item.modality) continue;
      const top = zoneToTop.get(item.zone_id);
      if (!top) continue;
      const set = modalitiesByTop.get(top.id) ?? new Set<string>();
      set.add(item.modality);
      modalitiesByTop.set(top.id, set);
    }

    return topLevelZones
      .filter((top) => (modalitiesByTop.get(top.id)?.size ?? 0) > 0)
      .map((top) => ({
        zone: top,
        modalities: [...modalitiesByTop.get(top.id)!].sort((a, b) => a.localeCompare(b)),
      }));
  }, [zones, visibleEquipment]);

  // Conjunto plano de todas as modalidades em âmbito — poda a selecção quando as zonas mudam
  // (evita um beco sem saída: modalidade marcada sem checkbox visível para a desmarcar).
  const availableModalities = useMemo(() => {
    const all = new Set<string>();
    for (const group of groups) for (const modality of group.modalities) all.add(modality);
    return all;
  }, [groups]);

  useEffect(() => {
    const stillValid = filters.modalities.filter((modality) => availableModalities.has(modality));
    if (stillValid.length !== filters.modalities.length) setModalityFilter(stillValid);
  }, [availableModalities, filters.modalities, setModalityFilter]);

  function toggleModality(modality: string) {
    const next = filters.modalities.includes(modality)
      ? filters.modalities.filter((current) => current !== modality)
      : [...filters.modalities, modality];
    setModalityFilter(next);
  }

  if (availableModalities.size === 0) return null;

  // Como a modalidade alimenta o calendário (em OR com zonas/engenheiros, ver MainCalendar),
  // "Todas" significa SELECCIONAR todas as modalidades em âmbito — não "filtro vazio". Só assim
  // marcar "Todas" mostra as PMs de todo o equipamento no calendário; nada marcado = vazio.
  // Mesmo padrão do "Todos" dos Engenheiros (EngineerFilter).
  const allModalities = [...availableModalities];
  const allSelected = allModalities.every((modality) => filters.modalities.includes(modality));

  function toggleAll() {
    setModalityFilter(allSelected ? [] : allModalities);
  }

  return (
    <SidebarSection title="Equipamentos">
      <div className="flex flex-col gap-0.5">
        <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-gray-50">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <span>Todos</span>
        </label>
        {groups.map(({ zone, modalities }) => {
          const collapsed = collapsedZoneIds.has(zone.id);
          return (
            <div key={zone.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-gray-50">
                <button
                  type="button"
                  onClick={() => toggleCollapse(zone.id)}
                  aria-label={collapsed ? `Expandir ${zone.name}` : `Colapsar ${zone.name}`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
                >
                  {collapsed ? '▸' : '▾'}
                </button>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: zone.color }} />
                <span className="truncate text-xs font-medium text-gray-600">{zone.name}</span>
              </div>
              {!collapsed &&
                modalities.map((modality) => (
                  <label
                    key={`${zone.id}-${modality}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-gray-50"
                    style={{ marginLeft: 16 }}
                  >
                    <input
                      type="checkbox"
                      checked={filters.modalities.includes(modality)}
                      onChange={() => toggleModality(modality)}
                    />
                    <span className="truncate">{modality}</span>
                  </label>
                ))}
            </div>
          );
        })}
      </div>
    </SidebarSection>
  );
}
