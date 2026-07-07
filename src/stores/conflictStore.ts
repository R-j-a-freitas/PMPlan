import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { ConflictLog, ConflictLogInsert, ConflictResult } from '../types';

interface ConflictState {
  /** Resultado da última validação (consumido pelo ConflictModal / toasts). */
  activeConflicts: ConflictResult[];
  log: ConflictLog[];
  loading: boolean;
  error: string | null;

  setActiveConflicts: (conflicts: ConflictResult[]) => void;
  clearActiveConflicts: () => void;
  fetchLog: () => Promise<void>;
  recordConflict: (entry: ConflictLogInsert) => Promise<void>;
  resolveConflict: (id: string) => Promise<void>;
}

export const useConflictStore = create<ConflictState>()(
  devtools(
    (set, get) => ({
      activeConflicts: [],
      log: [],
      loading: false,
      error: null,

      setActiveConflicts: (activeConflicts) => set({ activeConflicts }),
      clearActiveConflicts: () => set({ activeConflicts: [] }),

      fetchLog: async () => {
        set({ loading: true, error: null });
        const { data, error } = await supabase
          .from('conflict_log')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ log: data, loading: false });
      },

      recordConflict: async (entry) => {
        const { data, error } = await supabase
          .from('conflict_log')
          .insert(entry)
          .select()
          .single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ log: [data, ...get().log] });
      },

      resolveConflict: async (id) => {
        const { error } = await supabase
          .from('conflict_log')
          .update({ resolved: true })
          .eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({
          log: get().log.map((entry) => (entry.id === id ? { ...entry, resolved: true } : entry)),
        });
      },
    }),
    { name: 'conflict-store' },
  ),
);
