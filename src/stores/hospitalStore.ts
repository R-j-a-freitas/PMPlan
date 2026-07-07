import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { HospitalInsert, HospitalUpdate, HospitalWithZone } from '../types';

interface HospitalState {
  hospitals: HospitalWithZone[];
  loading: boolean;
  error: string | null;

  fetchHospitals: () => Promise<void>;
  createHospital: (hospital: HospitalInsert) => Promise<void>;
  bulkCreateHospital: (
    rows: { rowNumber: number; data: HospitalInsert }[],
  ) => Promise<{ success: number; errors: { rowNumber: number; message: string }[] }>;
  /** Mudar de zona aqui propaga zone_id a todo o equipamento do hospital (trigger trg_hospital_zone_change). */
  updateHospital: (id: string, patch: HospitalUpdate) => Promise<void>;
  deleteHospital: (id: string) => Promise<void>;
}

export const useHospitalStore = create<HospitalState>()(
  devtools(
    (set, get) => ({
      hospitals: [],
      loading: false,
      error: null,

      fetchHospitals: async () => {
        set({ loading: true, error: null });
        const { data, error } = await supabase
          .from('hospitals_with_zone')
          .select('*')
          .order('name');
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ hospitals: data, loading: false });
      },

      createHospital: async (hospital) => {
        const { error } = await supabase.from('hospitals').insert(hospital);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        await get().fetchHospitals();
      },

      bulkCreateHospital: async (rows) => {
        const errors: { rowNumber: number; message: string }[] = [];
        let success = 0;
        for (const { rowNumber, data } of rows) {
          const { error } = await supabase.from('hospitals').insert(data);
          if (error) errors.push({ rowNumber, message: error.message });
          else success++;
        }
        await get().fetchHospitals();
        return { success, errors };
      },

      updateHospital: async (id, patch) => {
        const { error } = await supabase.from('hospitals').update(patch).eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        await get().fetchHospitals();
      },

      deleteHospital: async (id) => {
        const { error } = await supabase.from('hospitals').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ hospitals: get().hospitals.filter((hospital) => hospital.id !== id) });
      },
    }),
    { name: 'hospital-store' },
  ),
);
