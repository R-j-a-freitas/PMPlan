import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { Engineer, EngineerInsert, EngineerUpdate, EngineerWithZones } from '../types';

interface EngineerState {
  engineers: EngineerWithZones[];
  loading: boolean;
  error: string | null;
  /** Engenheiros seleccionados na sidebar — filtram o calendário em OR com
   *  selectedEquipmentIds (ver MainCalendar); lista vazia = mostrar todos. */
  selectedEngineerIds: string[];

  fetchEngineers: () => Promise<void>;
  createEngineer: (engineer: EngineerInsert) => Promise<Engineer>;
  bulkCreateEngineer: (
    rows: { rowNumber: number; engineer: EngineerInsert; zoneIds: string[]; primaryZoneId: string | null }[],
  ) => Promise<{ success: number; errors: { rowNumber: number; message: string }[] }>;
  updateEngineer: (id: string, patch: EngineerUpdate) => Promise<void>;
  deleteEngineer: (id: string) => Promise<void>;
  /** Actualiza engineers.primary_zone_id + engineer_zones na mesma transacção (RPC set_engineer_zones).
   *  primaryZoneId pode ser null ao remover a última zona do engenheiro. */
  setEngineerZones: (engineerId: string, zoneIds: string[], primaryZoneId: string | null) => Promise<void>;
  toggleEngineerSelection: (id: string) => void;
  setSelectedEngineerIds: (ids: string[]) => void;
}

export const useEngineerStore = create<EngineerState>()(
  devtools(
    (set, get) => ({
      engineers: [],
      loading: false,
      error: null,
      selectedEngineerIds: [],

      fetchEngineers: async () => {
        set({ loading: true, error: null });
        const [{ data: engineers, error: engineersError }, { data: zones, error: zonesError }] =
          await Promise.all([
            supabase.from('engineers').select('*').order('name'),
            supabase.from('engineer_zones').select('*'),
          ]);

        if (engineersError) {
          set({ loading: false, error: engineersError.message });
          return;
        }
        if (zonesError) {
          set({ loading: false, error: zonesError.message });
          return;
        }

        const withZones: EngineerWithZones[] = engineers.map((engineer) => ({
          ...engineer,
          zones: (zones ?? []).filter((zone) => zone.engineer_id === engineer.id),
        }));
        set({ engineers: withZones, loading: false });
      },

      createEngineer: async (engineer) => {
        const { data, error } = await supabase.from('engineers').insert(engineer).select().single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        await get().fetchEngineers();
        return data;
      },

      updateEngineer: async (id, patch) => {
        const { error } = await supabase.from('engineers').update(patch).eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        await get().fetchEngineers();
      },

      deleteEngineer: async (id) => {
        const { error } = await supabase.from('engineers').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ engineers: get().engineers.filter((engineer) => engineer.id !== id) });
      },

      bulkCreateEngineer: async (rows) => {
        const errors: { rowNumber: number; message: string }[] = [];
        let success = 0;
        for (const { rowNumber, engineer, zoneIds, primaryZoneId } of rows) {
          const { data, error } = await supabase.from('engineers').insert(engineer).select().single();
          if (error) {
            errors.push({ rowNumber, message: error.message });
            continue;
          }
          if (zoneIds.length > 0) {
            const { error: zoneError } = await supabase.rpc('set_engineer_zones', {
              p_engineer_id: data.id,
              p_zone_ids: zoneIds,
              p_primary_zone_id: primaryZoneId,
            });
            if (zoneError) {
              errors.push({ rowNumber, message: `Criado, mas falhou a atribuição de zonas: ${zoneError.message}` });
              continue;
            }
          }
          success++;
        }
        await get().fetchEngineers();
        return { success, errors };
      },

      setEngineerZones: async (engineerId, zoneIds, primaryZoneId) => {
        const { error } = await supabase.rpc('set_engineer_zones', {
          p_engineer_id: engineerId,
          p_zone_ids: zoneIds,
          p_primary_zone_id: primaryZoneId,
        });
        if (error) {
          set({ error: error.message });
          throw error;
        }
        await get().fetchEngineers();
      },

      toggleEngineerSelection: (id) =>
        set((state) => ({
          selectedEngineerIds: state.selectedEngineerIds.includes(id)
            ? state.selectedEngineerIds.filter((engineerId) => engineerId !== id)
            : [...state.selectedEngineerIds, id],
        })),
      setSelectedEngineerIds: (ids) => set({ selectedEngineerIds: ids }),
    }),
    { name: 'engineer-store' },
  ),
);
