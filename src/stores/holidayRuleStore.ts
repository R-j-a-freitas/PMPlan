import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { HolidayRule, HolidayRuleInsert, HolidayRuleUpdate } from '../types';

interface HolidayRuleState {
  rules: HolidayRule[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  /** Carrega todas as regras uma única vez (dados quase estáticos) — devolve a lista
   *  actual, já carregada da cache se aplicável, para useHolidays.ts expandir por ano. */
  fetchRules: () => Promise<HolidayRule[]>;
  createRule: (rule: HolidayRuleInsert) => Promise<HolidayRule>;
  updateRule: (id: string, rule: HolidayRuleUpdate) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
}

export const useHolidayRuleStore = create<HolidayRuleState>()(
  devtools(
    (set, get) => ({
      rules: [],
      loaded: false,
      loading: false,
      error: null,

      fetchRules: async () => {
        if (get().loaded) return get().rules;
        set({ loading: true, error: null });
        const { data, error } = await supabase.from('holiday_rules').select('*').eq('active', true);
        if (error) {
          set({ loading: false, error: error.message });
          return [];
        }
        set({ rules: data, loaded: true, loading: false });
        return data;
      },

      createRule: async (rule) => {
        const { data, error } = await supabase.from('holiday_rules').insert(rule).select().single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set((state) => ({ rules: [...state.rules, data] }));
        return data;
      },

      updateRule: async (id, rule) => {
        const { data, error } = await supabase.from('holiday_rules').update(rule).eq('id', id).select().single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set((state) => ({ rules: state.rules.map((item) => (item.id === id ? data : item)) }));
      },

      deleteRule: async (id) => {
        const { error } = await supabase.from('holiday_rules').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set((state) => ({ rules: state.rules.filter((item) => item.id !== id) }));
      },
    }),
    { name: 'holiday-rule-store' },
  ),
);
