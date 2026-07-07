import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { EquipmentFull, EquipmentInsert, EquipmentUpdate } from '../types';

export interface EquipmentFilters {
  zoneIds: string[];
  modalities: string[];
  searchText: string;
}

const EMPTY_FILTERS: EquipmentFilters = { zoneIds: [], modalities: [], searchText: '' };

interface EquipmentState {
  equipment: EquipmentFull[];
  loading: boolean;
  error: string | null;
  filters: EquipmentFilters;
  /** Equipamento "armado" na sidebar — seleccionar dias no calendário cria logo a PM
   *  para este equipamento, sem precisar de arrastar (ver MainCalendar `select`). */
  selectedEquipmentId: string | null;
  /** Equipamentos marcados na sidebar para filtrar o calendário em OR com
   *  selectedEngineerIds (ver MainCalendar) — independente do "armado" para criação. */
  selectedEquipmentIds: string[];

  fetchEquipment: () => Promise<void>;
  createEquipment: (equipment: EquipmentInsert) => Promise<void>;
  /** Importação em massa (Excel/CSV) — uma linha por insert para não perder as válidas
   *  por causa de uma só com erro; só uma actualização da lista no fim. `rowNumber` é o
   *  número da linha na folha de cálculo original, para o erro apontar para o sítio certo. */
  bulkCreateEquipment: (
    rows: { rowNumber: number; data: EquipmentInsert }[],
  ) => Promise<{ success: number; errors: { rowNumber: number; message: string }[] }>;
  updateEquipment: (id: string, patch: EquipmentUpdate) => Promise<void>;
  deleteEquipment: (id: string) => Promise<void>;
  setZoneFilter: (zoneIds: string[]) => void;
  setModalityFilter: (modalities: string[]) => void;
  setSearchText: (text: string) => void;
  resetFilters: () => void;
  setSelectedEquipmentId: (id: string | null) => void;
  toggleEquipmentSelection: (id: string) => void;
  setSelectedEquipmentIds: (ids: string[]) => void;
}

export const useEquipmentStore = create<EquipmentState>()(
  devtools(
    (set, get) => ({
      equipment: [],
      loading: false,
      error: null,
      filters: EMPTY_FILTERS,
      selectedEquipmentId: null,
      selectedEquipmentIds: [],

      fetchEquipment: async () => {
        set({ loading: true, error: null });
        const { data, error } = await supabase
          .from('equipment_full')
          .select('*')
          .order('name');
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ equipment: data, loading: false });
      },

      // zone_id já vem preenchido pelo formulário (derivado do hospital seleccionado).
      createEquipment: async (equipment) => {
        const { error } = await supabase.from('equipment').insert(equipment);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        await get().fetchEquipment();
      },

      bulkCreateEquipment: async (rows) => {
        const errors: { rowNumber: number; message: string }[] = [];
        let success = 0;
        for (const { rowNumber, data } of rows) {
          const { error } = await supabase.from('equipment').insert(data);
          if (error) errors.push({ rowNumber, message: error.message });
          else success++;
        }
        await get().fetchEquipment();
        return { success, errors };
      },

      updateEquipment: async (id, patch) => {
        const { error } = await supabase.from('equipment').update(patch).eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        await get().fetchEquipment();
      },

      deleteEquipment: async (id) => {
        const { error } = await supabase.from('equipment').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ equipment: get().equipment.filter((item) => item.id !== id) });
      },

      setZoneFilter: (zoneIds) => set((state) => ({ filters: { ...state.filters, zoneIds } })),
      setModalityFilter: (modalities) =>
        set((state) => ({ filters: { ...state.filters, modalities } })),
      setSearchText: (searchText) => set((state) => ({ filters: { ...state.filters, searchText } })),
      resetFilters: () => set({ filters: EMPTY_FILTERS }),
      setSelectedEquipmentId: (selectedEquipmentId) => set({ selectedEquipmentId }),
      toggleEquipmentSelection: (id) =>
        set((state) => ({
          selectedEquipmentIds: state.selectedEquipmentIds.includes(id)
            ? state.selectedEquipmentIds.filter((equipmentId) => equipmentId !== id)
            : [...state.selectedEquipmentIds, id],
        })),
      setSelectedEquipmentIds: (ids) => set({ selectedEquipmentIds: ids }),
    }),
    { name: 'equipment-store' },
  ),
);
