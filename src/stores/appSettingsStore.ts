import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

/** Chaves conhecidas de app_settings (migração 0016). */
export const SETTING_INCLUDE_TEAM_LEADERS = 'include_team_leaders_in_client_emails';

interface AppSettingsState {
  settings: Record<string, unknown>;
  loaded: boolean;
  error: string | null;

  fetchAppSettings: () => Promise<void>;
  /** Lê um booleano; `fallback` cobre o caso de a definição ainda não ter sido carregada
   *  ou de a chave não existir. */
  getBoolean: (key: string, fallback: boolean) => boolean;
  setBoolean: (key: string, value: boolean, userId: string | null) => Promise<void>;
}

export const useAppSettingsStore = create<AppSettingsState>()(
  devtools(
    (set, get) => ({
      settings: {},
      loaded: false,
      error: null,

      fetchAppSettings: async () => {
        const { data, error } = await supabase.from('app_settings').select('key, value');
        if (error) {
          set({ error: error.message });
          return;
        }
        const settings: Record<string, unknown> = {};
        for (const row of data as { key: string; value: unknown }[]) settings[row.key] = row.value;
        set({ settings, loaded: true, error: null });
      },

      getBoolean: (key, fallback) => {
        const value = get().settings[key];
        return typeof value === 'boolean' ? value : fallback;
      },

      setBoolean: async (key, value, userId) => {
        // upsert e não update: uma definição nova não precisa de migração para existir —
        // a linha cria-se no primeiro toggle (a RLS deixa o admin inserir, ver 0028).
        const { error } = await supabase
          .from('app_settings')
          .upsert(
            { key, value, updated_at: new Date().toISOString(), updated_by: userId },
            { onConflict: 'key' },
          );
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ settings: { ...get().settings, [key]: value } });
      },
    }),
    { name: 'app-settings-store' },
  ),
);
