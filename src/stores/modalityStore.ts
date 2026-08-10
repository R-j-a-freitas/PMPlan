import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { Modality } from '../types';

interface ModalityState {
  modalities: Modality[];
  loading: boolean;
  error: string | null;

  fetchModalities: () => Promise<void>;
  createModality: (name: string) => Promise<void>;
  renameModality: (oldName: string, newName: string) => Promise<void>;
  /** Bloqueia se houver equipamento a usar a modalidade (evita texto órfão no dropdown). */
  deleteModality: (id: string, name: string) => Promise<void>;
}

export const useModalityStore = create<ModalityState>()(
  devtools(
    (set, get) => ({
      modalities: [],
      loading: false,
      error: null,

      fetchModalities: async () => {
        set({ loading: true, error: null });
        const { data, error } = await supabase.from('modalities').select('*').order('sort_order').order('name');
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ modalities: data, loading: false });
      },

      createModality: async (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const nextOrder = get().modalities.reduce((max, modality) => Math.max(max, modality.sort_order), 0) + 1;
        const { data, error } = await supabase
          .from('modalities')
          .insert({ name: trimmed, sort_order: nextOrder, active: true })
          .select()
          .single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ modalities: [...get().modalities, data] });
      },

      // Renomear propaga ao texto livre gravado em equipment.modality via RPC atómica
      // (rename_modality, migração 0008). Recarrega para reflectir o novo nome na lista.
      renameModality: async (oldName, newName) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return;
        const { error } = await supabase.rpc('rename_modality', { p_old_name: oldName, p_new_name: trimmed });
        if (error) {
          set({ error: error.message });
          throw error;
        }
        await get().fetchModalities();
      },

      // Mesmo princípio da eliminação de zona (zoneStore): não remover se estiver em uso.
      deleteModality: async (id, name) => {
        const { count, error: countError } = await supabase
          .from('equipment')
          .select('id', { count: 'exact', head: true })
          .eq('modality', name);
        if (countError) {
          set({ error: countError.message });
          throw countError;
        }
        if (count && count > 0) {
          const message = `Não é possível remover "${name}": ${count} equipamento(s) usam esta modalidade.`;
          set({ error: message });
          throw new Error(message);
        }
        const { error } = await supabase.from('modalities').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ modalities: get().modalities.filter((modality) => modality.id !== id) });
      },
    }),
    { name: 'modality-store' },
  ),
);
