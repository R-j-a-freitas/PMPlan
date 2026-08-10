import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { SystemBackup, SystemHeartbeat } from '../types';

interface SystemHealthState {
  heartbeats: SystemHeartbeat[];
  backups: SystemBackup[];
  loading: boolean;
  /** Distingue "leu e está vazio" de "não conseguiu ler". No ecrã de saúde essa
   *  diferença é tudo: uma tabela vazia significa que nada foi instalado; uma falha de
   *  leitura pode significar que a própria base de dados está em apuros — que é
   *  exactamente o que este ecrã existe para mostrar. */
  error: string | null;
  /** Momento da última leitura bem-sucedida, para o ecrã poder dizer o que está a ver. */
  fetchedAt: Date | null;

  fetchHealth: () => Promise<void>;
}

// A retenção é de 90 registos em ambas as tabelas (0010 e 0013), por isso não há aqui
// paginação nem filtros: lê-se tudo, que é pouco, e agrega-se no cliente.
export const useSystemHealthStore = create<SystemHealthState>()(
  devtools(
    (set) => ({
      heartbeats: [],
      backups: [],
      loading: false,
      error: null,
      fetchedAt: null,

      fetchHealth: async () => {
        set({ loading: true, error: null });

        // Em paralelo: são independentes, e o ecrã só é útil com as duas.
        const [heartbeatResult, backupResult] = await Promise.all([
          supabase.from('system_heartbeat').select('*').order('pinged_at', { ascending: false }),
          supabase.from('system_backups').select('*').order('ran_at', { ascending: false }),
        ]);

        // Falhar qualquer uma é reportado como erro, e o estado anterior NÃO é substituído
        // por listas vazias — mostrar zeros por não se ter conseguido ler seria mentir ao
        // utilizador com aspecto de dado.
        const failure = heartbeatResult.error ?? backupResult.error;
        if (failure) {
          set({ loading: false, error: failure.message });
          return;
        }

        // `?? []` só por causa da tipagem do postgrest-js, que declara `data` como
        // anulável independentemente de `error`. Chegado aqui, ambos os pedidos tiveram
        // sucesso e o array existe — o caso de falha já saiu acima, sem tocar no estado.
        set({
          heartbeats: heartbeatResult.data ?? [],
          backups: backupResult.data ?? [],
          loading: false,
          error: null,
          fetchedAt: new Date(),
        });
      },
    }),
    { name: 'system-health-store' },
  ),
);
