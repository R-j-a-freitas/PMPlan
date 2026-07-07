import { useEffect, useRef } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import { useAuthStore, useEquipmentStore } from '../../stores';
import type { EquipmentFull } from '../../types';
import { Badge } from '../ui';

// Pesquisa dinâmica por TODOS os campos visíveis/relevantes da lista, não só o nome —
// equipamento, fabricante, modelo, modalidade, nº de série, hospital e zona.
const SEARCHABLE_FIELDS: (keyof EquipmentFull)[] = [
  'name',
  'manufacturer',
  'model',
  'modality',
  'serial_number',
  'hospital_name',
  'hospital_short_name',
  'zone_name',
  'zone_code',
];

function matchesSearch(item: EquipmentFull, searchText: string): boolean {
  const needle = searchText.toLowerCase();
  return SEARCHABLE_FIELDS.some((field) => {
    const value = item[field];
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  });
}

// Lista drag-source de equipamentos — arrasta directamente para o FullCalendar
// (eventReceive no MainCalendar abre o PMEventModal pré-preenchido, nunca grava directo).
// Clicar na linha (sem arrastar) "arma" o equipamento: seleccionar dias no calendário cria
// logo a PM para ele, com hospital/engenheiro pré-preenchidos (ver MainCalendar `select`).
// A checkbox é independente disso — marca/desmarca o equipamento para FILTRAR o que já
// está agendado no calendário (em OR com os engenheiros marcados em EngineerFilter), sem
// mexer no "armado" para criação. Lista restringida pelas zonas de ZoneScopeFilter.
// Só fica draggable/armável para quem tem canCreatePM (engineer/readonly só consultam) —
// a checkbox de filtragem fica sempre disponível, mesmo em modo só-consulta.
export function EquipmentList() {
  const canCreatePM = useAuthStore((state) => state.permissions.canCreatePM);
  const equipment = useEquipmentStore((state) => state.equipment);
  const filters = useEquipmentStore((state) => state.filters);
  const setSearchText = useEquipmentStore((state) => state.setSearchText);
  const selectedEquipmentId = useEquipmentStore((state) => state.selectedEquipmentId);
  const setSelectedEquipmentId = useEquipmentStore((state) => state.setSelectedEquipmentId);
  const selectedEquipmentIds = useEquipmentStore((state) => state.selectedEquipmentIds);
  const toggleEquipmentSelection = useEquipmentStore((state) => state.toggleEquipmentSelection);
  const setSelectedEquipmentIds = useEquipmentStore((state) => state.setSelectedEquipmentIds);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !canCreatePM) return;
    const draggable = new Draggable(containerRef.current, {
      itemSelector: '.pmplan-equipment-item',
      eventData: (el) => ({
        title: el.dataset['name'],
        duration: { days: Number(el.dataset['durationDays'] ?? 1) },
        backgroundColor: el.dataset['color'],
        borderColor: el.dataset['color'],
        extendedProps: {
          equipmentId: el.dataset['equipmentId'],
          engineerId: el.dataset['engineerId'] ?? '',
        },
      }),
    });
    return () => draggable.destroy();
  }, [canCreatePM]);

  const filtered = equipment.filter((item) => {
    if (filters.zoneIds.length > 0 && !filters.zoneIds.includes(item.zone_id)) return false;
    if (filters.modalities.length > 0 && !filters.modalities.includes(item.modality)) return false;
    if (filters.searchText && !matchesSearch(item, filters.searchText)) return false;
    return true;
  });

  const allSelected = filtered.length > 0 && filtered.every((item) => selectedEquipmentIds.includes(item.id));

  // Marca/desmarca de uma vez todos os equipamentos actualmente visíveis (já restringidos
  // pela zona + pesquisa) — é assim que se vê "todas as máquinas dessa zona" no calendário.
  function toggleAll() {
    if (allSelected) {
      const visibleIds = new Set(filtered.map((item) => item.id));
      setSelectedEquipmentIds(selectedEquipmentIds.filter((id) => !visibleIds.has(id)));
    } else {
      setSelectedEquipmentIds([...new Set([...selectedEquipmentIds, ...filtered.map((item) => item.id)])]);
    }
  }

  return (
    <div className="border-b border-gray-200 p-2">
      <input
        type="search"
        placeholder="Procurar equipamento…"
        className="mb-2 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={filters.searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />
      {filtered.length > 0 && (
        <label className="mb-1 flex items-center gap-2 px-1 text-xs text-gray-500">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Mostrar todos no calendário
        </label>
      )}
      <div ref={containerRef} className="flex flex-col gap-1">
        {filtered.map((item) => {
          const armed = item.id === selectedEquipmentId;
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={canCreatePM ? 0 : -1}
              onClick={() => canCreatePM && setSelectedEquipmentId(armed ? null : item.id)}
              className={`pmplan-equipment-item flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-gray-50 ${canCreatePM ? 'cursor-grab' : 'cursor-default'} ${armed ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200'}`}
              data-equipment-id={item.id}
              data-name={item.name}
              data-color={item.color}
              data-duration-days={item.pm_duration_days}
              data-engineer-id={item.engineer_primary_id ?? ''}
            >
              <input
                type="checkbox"
                checked={selectedEquipmentIds.includes(item.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleEquipmentSelection(item.id)}
              />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              {/* Nome do equipamento nunca trunca — é o hospital que encolhe (min-w-0
                  obrigatório num flex item para o truncate funcionar em vez de transbordar). */}
              <span className="shrink-0 whitespace-nowrap">{item.name}</span>
              {item.hospital_name && (
                <span className="min-w-0 flex-1 truncate text-xs text-gray-400">{item.hospital_name}</span>
              )}
              <Badge color={item.zone_color} className="ml-auto shrink-0">
                {item.zone_code}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
