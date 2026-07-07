import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { Holiday, HolidayInsert } from '../types';

interface HolidayState {
  holidays: Holiday[];
  loading: boolean;
  error: string | null;
  /** Anos já confirmados como carregados (da BD ou da Nager.Date) — evita refetch repetido. */
  loadedYears: number[];

  isYearLoaded: (year: number) => boolean;
  /** Lê feriados já existentes na BD para o ano — usado por useHolidays antes de chamar a Nager.Date. */
  fetchHolidaysFromDb: (year: number) => Promise<Holiday[]>;
  /** Insere feriados obtidos da Nager.Date e actualiza a cache local. */
  addHolidays: (holidays: HolidayInsert[], year: number) => Promise<void>;
  /** Cria um feriado manual (regional/local de uma zona, ou nacional manual) — página Holidays.tsx. */
  createHoliday: (holiday: HolidayInsert) => Promise<void>;
  deleteHoliday: (id: string) => Promise<void>;
}

export const useHolidayStore = create<HolidayState>()(
  devtools(
    (set, get) => ({
      holidays: [],
      loading: false,
      error: null,
      loadedYears: [],

      isYearLoaded: (year) => get().loadedYears.includes(year),

      fetchHolidaysFromDb: async (year) => {
        set({ loading: true, error: null });
        const { data, error } = await supabase.from('holidays').select('*').eq('year', year);
        if (error) {
          set({ loading: false, error: error.message });
          return [];
        }
        set((state) => ({
          holidays: [...state.holidays.filter((h) => h.year !== year), ...data],
          loading: false,
        }));
        return data;
      },

      addHolidays: async (holidays, year) => {
        if (holidays.length === 0) {
          set((state) => ({ loadedYears: [...new Set([...state.loadedYears, year])] }));
          return;
        }
        const { data, error } = await supabase
          .from('holidays')
          .upsert(holidays, { onConflict: 'country,zone_id,locality,date,name' })
          .select();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set((state) => ({
          holidays: [...state.holidays.filter((h) => h.year !== year), ...data],
          loadedYears: [...new Set([...state.loadedYears, year])],
        }));
      },

      createHoliday: async (holiday) => {
        const { data, error } = await supabase.from('holidays').insert(holiday).select().single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set((state) => ({ holidays: [...state.holidays, data] }));
      },

      deleteHoliday: async (id) => {
        const { error } = await supabase.from('holidays').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set((state) => ({ holidays: state.holidays.filter((holiday) => holiday.id !== id) }));
      },
    }),
    { name: 'holiday-store' },
  ),
);
