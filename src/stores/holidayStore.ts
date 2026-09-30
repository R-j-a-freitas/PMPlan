import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { expandHolidayRule, ruleAppliesToYear } from '../lib/expandHolidayRule';
import { supabase } from '../lib/supabase';
import type { Holiday, HolidayInsert, HolidayRule, HolidaySyncRun } from '../types';

interface HolidayState {
  holidays: Holiday[];
  loading: boolean;
  error: string | null;
  /** Anos já confirmados como carregados (da BD ou da Nager.Date) — evita refetch repetido. */
  loadedYears: number[];
  /** Última importação do BOE por ano (null = ainda nenhuma) — ver fetchBoeImport. */
  boeImports: Record<number, HolidaySyncRun | null>;

  isYearLoaded: (year: number) => boolean;
  /** Lê feriados já existentes na BD para o ano — usado por useHolidays antes de chamar a Nager.Date. */
  fetchHolidaysFromDb: (year: number) => Promise<Holiday[]>;
  /** Insere feriados obtidos da Nager.Date e actualiza a cache local. */
  addHolidays: (holidays: HolidayInsert[], year: number) => Promise<void>;
  /** Cria um feriado manual (regional/local de uma zona, ou nacional manual) — página Holidays.tsx. */
  createHoliday: (holiday: HolidayInsert) => Promise<void>;
  deleteHoliday: (id: string) => Promise<void>;
  /** Reflecte uma regra criada (previous=null), editada ou eliminada (next=null) em todos
   *  os anos já carregados — sem isto só o ano em vista ficava actualizado, e os outros
   *  mantinham a data antiga até alguém a apagar à mão. */
  syncRuleHolidays: (previous: HolidayRule | null, next: HolidayRule | null) => Promise<void>;
  /** Lê a importação mais recente do BOE para o ano (holiday_sync_runs, migração 0025) —
   *  a página Feriados usa-a para lembrar que é altura de rever as fiestas locales. */
  fetchBoeImport: (year: number) => Promise<void>;
}

/** Valor de holidays.source das linhas geradas a partir de holiday_rules. */
export const RULE_SOURCE = 'holiday-rule';

export const useHolidayStore = create<HolidayState>()(
  devtools(
    (set, get) => ({
      holidays: [],
      loading: false,
      error: null,
      loadedYears: [],
      boeImports: {},

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
        // Funde por id em vez de substituir o ano inteiro: useHolidays também chama isto
        // só com as linhas de regras em falta num ano que já estava na BD.
        const upsertedIds = new Set(data.map((holiday) => holiday.id));
        set((state) => ({
          holidays: [...state.holidays.filter((h) => !upsertedIds.has(h.id)), ...data],
          loadedYears: [...new Set([...state.loadedYears, year])],
        }));
      },

      syncRuleHolidays: async (previous, next) => {
        const years = get().loadedYears;
        if (years.length === 0) return;

        // Só os anos em que cada versão vale: duas versões da mesma regra partilham o nome,
        // e apagar por nome em todos os anos levaria também as linhas da outra versão.
        const previousYears = previous ? years.filter((year) => ruleAppliesToYear(previous, year)) : [];
        const nextYears = next ? years.filter((year) => ruleAppliesToYear(next, year)) : [];

        if (previous && previousYears.length > 0) {
          const { error } = await supabase
            .from('holidays')
            .delete()
            .eq('source', RULE_SOURCE)
            .eq('country', previous.country)
            .eq('locality', previous.locality)
            .eq('name', previous.name)
            .in('year', previousYears);
          if (error) {
            set({ error: error.message });
            throw error;
          }
          set((state) => ({
            holidays: state.holidays.filter(
              (h) =>
                !(
                  h.source === RULE_SOURCE &&
                  h.country === previous.country &&
                  h.locality === previous.locality &&
                  h.name === previous.name &&
                  previousYears.includes(h.year)
                ),
            ),
          }));
        }

        if (next && nextYears.length > 0) {
          const { data, error } = await supabase
            .from('holidays')
            .upsert(
              nextYears.map((year) => expandHolidayRule(next, year)),
              { onConflict: 'country,zone_id,locality,date,name' },
            )
            .select();
          if (error) {
            set({ error: error.message });
            throw error;
          }
          const upsertedIds = new Set(data.map((holiday) => holiday.id));
          set((state) => ({ holidays: [...state.holidays.filter((h) => !upsertedIds.has(h.id)), ...data] }));
        }
      },

      createHoliday: async (holiday) => {
        const { data, error } = await supabase.from('holidays').insert(holiday).select().single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set((state) => ({ holidays: [...state.holidays, data] }));
      },

      fetchBoeImport: async (year) => {
        const { data, error } = await supabase
          .from('holiday_sync_runs')
          .select('*')
          .eq('target_year', year)
          .eq('status', 'imported')
          .order('ran_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          // Só alimenta um aviso: falhar aqui não pode impedir a página de mostrar os feriados.
          console.error(`holidayStore: falha a ler a importação do BOE de ${year}`, error);
          return;
        }
        set((state) => ({ boeImports: { ...state.boeImports, [year]: data } }));
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
