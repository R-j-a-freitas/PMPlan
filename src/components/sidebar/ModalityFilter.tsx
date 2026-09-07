import { useEffect, useMemo, useState } from 'react';
import { useEquipmentStore, useZoneStore } from '../../stores';
import { expandZoneSelection } from '../../lib/zoneTree';
import { modalityScopeKey } from '../../lib/modalityScope';
import { SIDEBAR_INDENT_PX, SidebarSection } from './SidebarSection';
import { useT } from '../../i18n';

// Filtro por modalidade de equipamento (LINAC, Flexitron, …), agrupado apenas pelas zonas-mãe
// (topo da hierarquia). Sob cada zona-mãe listam-se as modalidades presentes em TODO o seu
// equipamento (agregando as zonas-filha, sem as subdividir). A lista é restringida às zonas em
// âmbito (selectedZoneIds). Marcar modalidades restringe a lista de equipamentos abaixo
// (EquipmentList combina zona AND modalidade AND pesquisa); nada marcado = todas. O filtro é por
// PAR (zona-mãe, modalidade) — cada linha é independente, marcar "Flexitron" no Sul não mexe no
// "Flexitron" do Norte (ver lib/modalityScope).
export function ModalityFilter() {
  const t = useT();
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

  // Conjunto plano de todas as chaves (zona, modalidade) em âmbito — poda a selecção quando as
  // zonas mudam (evita um beco sem saída: modalidade marcada sem checkbox visível para a desmarcar).
  const availableKeys = useMemo(() => {
    const all = new Set<string>();
    for (const group of groups) {
      for (const modality of group.modalities) all.add(modalityScopeKey(group.zone.id, modality));
    }
    return all;
  }, [groups]);

  useEffect(() => {
    const stillValid = filters.modalityKeys.filter((key) => availableKeys.has(key));
    if (stillValid.length !== filters.modalityKeys.length) setModalityFilter(stillValid);
  }, [availableKeys, filters.modalityKeys, setModalityFilter]);

  function toggleModality(key: string) {
    const next = filters.modalityKeys.includes(key)
      ? filters.modalityKeys.filter((current) => current !== key)
      : [...filters.modalityKeys, key];
    setModalityFilter(next);
  }

  if (availableKeys.size === 0) return null;

  // Como a modalidade alimenta o calendário (em OR com zonas/engenheiros, ver MainCalendar),
  // "Todas" significa SELECCIONAR todas as modalidades em âmbito — não "filtro vazio". Só assim
  // marcar "Todas" mostra as PMs de todo o equipamento no calendário; nada marcado = vazio.
  // Mesmo padrão do "Todos" dos Engenheiros (EngineerFilter).
  const allKeys = [...availableKeys];
  const allSelected = allKeys.every((key) => filters.modalityKeys.includes(key));

  function toggleAll() {
    setModalityFilter(allSelected ? [] : allKeys);
  }

  return (
    <SidebarSection title={t('sidebar.equipment')}>
      <div className="flex flex-col">
        <label className="pm-sidebar-row hover:bg-gray-50">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <span>{t('sidebar.allMasc')}</span>
        </label>
        {groups.map(({ zone, modalities }) => {
          const collapsed = collapsedZoneIds.has(zone.id);
          return (
            <div key={zone.id} className="flex flex-col">
              <div className="pm-sidebar-row hover:bg-gray-50">
                <button
                  type="button"
                  onClick={() => toggleCollapse(zone.id)}
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
              {!collapsed &&
                modalities.map((modality) => {
                  const key = modalityScopeKey(zone.id, modality);
                  return (
                    <label
                      key={key}
                      className="pm-sidebar-row hover:bg-gray-50"
                      style={{ marginLeft: SIDEBAR_INDENT_PX }}
                    >
                      <input
                        type="checkbox"
                        checked={filters.modalityKeys.includes(key)}
                        onChange={() => toggleModality(key)}
                      />
                      <span className="truncate">{modality}</span>
                    </label>
                  );
                })}
            </div>
          );
        })}
      </div>
    </SidebarSection>
  );
}
