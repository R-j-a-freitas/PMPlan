import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { expandZoneSelection } from '../lib/zoneTree';
import type { Zone, ZoneInsert, ZoneUpdate } from '../types';

interface ZoneState {
  zones: Zone[];
  loading: boolean;
  error: string | null;
  /** Zonas marcadas no filtro da sidebar — filtra o calendário e restringe que
   *  engenheiros/equipamentos aparecem nas listas. Contém sempre o conjunto exacto (sem
   *  expansão implícita): marcar/desmarcar uma zona-mãe propaga o estado às filhas no
   *  próprio toggleZoneSelection (cascata só no momento do clique, não em cada leitura) —
   *  isto permite desmarcar uma filha individual sem a mãe a voltar a incluir. */
  selectedZoneIds: string[];

  fetchZones: () => Promise<void>;
  createZone: (zone: ZoneInsert) => Promise<void>;
  updateZone: (id: string, patch: ZoneUpdate) => Promise<void>;
  /** Bloqueia com erro explícito se existirem hospitais associados (secção 4, regra 4). */
  deleteZone: (id: string) => Promise<void>;
  toggleZoneSelection: (id: string) => void;
}

export const useZoneStore = create<ZoneState>()(
  devtools(
    (set, get) => ({
      zones: [],
      loading: false,
      error: null,
      selectedZoneIds: [],

      fetchZones: async () => {
        set({ loading: true, error: null });
        const { data, error } = await supabase.from('zones').select('*').order('name');
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ zones: data, loading: false });
      },

      createZone: async (zone) => {
        const { data, error } = await supabase.from('zones').insert(zone).select().single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ zones: [...get().zones, data] });
      },

      updateZone: async (id, patch) => {
        const { data, error } = await supabase
          .from('zones')
          .update(patch)
          .eq('id', id)
          .select()
          .single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ zones: get().zones.map((zone) => (zone.id === id ? data : zone)) });
      },

      deleteZone: async (id) => {
        const { count, error: countError } = await supabase
          .from('hospitals')
          .select('id', { count: 'exact', head: true })
          .eq('zone_id', id);
        if (countError) {
          set({ error: countError.message });
          throw countError;
        }
        if (count && count > 0) {
          const message = `Não é possível eliminar a zona: ${count} hospital(is) associado(s).`;
          set({ error: message });
          throw new Error(message);
        }

        const { error } = await supabase.from('zones').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ zones: get().zones.filter((zone) => zone.id !== id) });
      },

      // Marcar/desmarcar uma zona propaga o mesmo estado às suas descendentes (zona-mãe
      // "NorthWest" → activa/desactiva logo "Galiza"/"Lisboa"/"Norte" também) — mas só
      // neste momento do clique; depois disso cada zona fica livre para ser desmarcada
      // individualmente sem a mãe a reimpor a inclusão (ver MainCalendar, que já não
      // expande a selecção outra vez ao filtrar).
      toggleZoneSelection: (id) =>
        set((state) => {
          const scope = expandZoneSelection([id], state.zones);
          if (state.selectedZoneIds.includes(id)) {
            return { selectedZoneIds: state.selectedZoneIds.filter((zoneId) => !scope.has(zoneId)) };
          }
          return { selectedZoneIds: [...new Set([...state.selectedZoneIds, ...scope])] };
        }),
    }),
    { name: 'zone-store' },
  ),
);
