import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { backupFilename, buildBackupFile, downloadBackupFile } from '../lib/backupExport';
import { supabase } from '../lib/supabase';
import type {
  ManualBackupResult,
  SystemBackup,
  SystemCheckResult,
  SystemHeartbeat,
} from '../types';

/** As duas acções manuais devolvem isto em vez de atirarem: quem chama é o ecrã, que tem
 *  de mostrar um toast em qualquer dos casos (é a convenção das outras páginas). */
type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function failure(error: unknown, fallback: string): { ok: false; message: string } {
  return { ok: false, message: error instanceof Error ? error.message : fallback };
}

interface SystemHealthState {
  heartbeats: SystemHeartbeat[];
  backups: SystemBackup[];
  loading: boolean;
  /** Separados de `loading` para cada botão poder desactivar-se sozinho sem apagar o
   *  ecrã inteiro enquanto a sua acção corre. */
  checking: boolean;
  backingUp: boolean;
  /** Distingue "leu e está vazio" de "não conseguiu ler". No ecrã de saúde essa
   *  diferença é tudo: uma tabela vazia significa que nada foi instalado; uma falha de
   *  leitura pode significar que a própria base de dados está em apuros — que é
   *  exactamente o que este ecrã existe para mostrar. */
  error: string | null;
  /** Momento da última leitura bem-sucedida, para o ecrã poder dizer o que está a ver. */
  fetchedAt: Date | null;

  fetchHealth: () => Promise<void>;
  runSystemCheck: () => Promise<ActionResult<SystemCheckResult>>;
  runManualBackup: () => Promise<ActionResult<ManualBackupResult>>;
}

// A retenção é de 90 registos em ambas as tabelas (0010 e 0013), por isso não há aqui
// paginação nem filtros: lê-se tudo, que é pouco, e agrega-se no cliente.
export const useSystemHealthStore = create<SystemHealthState>()(
  devtools(
    (set, get) => ({
      heartbeats: [],
      backups: [],
      loading: false,
      checking: false,
      backingUp: false,
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

      // Faz à mão o que o keep-alive da VPS faz de madrugada: escreve um heartbeat
      // ('manual'), conta as PMs e purga (migração 0018). Serve dois momentos concretos —
      // confirmar que a base de dados responde antes de fechar o portátil para férias, e
      // adiar a contagem dos 7 dias quando se sabe que a VPS está em baixo.
      runSystemCheck: async () => {
        set({ checking: true });
        try {
          const { data, error } = await supabase.rpc('run_system_check');
          if (error) throw error;
          // Reler a seguir: o ping que a verificação acabou de escrever tem de aparecer na
          // tabela, senão o ecrã continua a mostrar o estado de antes do clique e parece
          // que o botão não fez nada.
          await get().fetchHealth();
          return { ok: true as const, data };
        } catch (err) {
          return failure(err, 'Falha ao verificar o estado do sistema.');
        } finally {
          set({ checking: false });
        }
      },

      // Exporta os dados, grava o ficheiro no computador de quem carregou, e só depois
      // regista a cópia no histórico. A ordem é essa de propósito: registar primeiro
      // deixava no ecrã a marca de uma cópia que a gravação pode não ter produzido.
      runManualBackup: async () => {
        set({ backingUp: true });
        try {
          const { data, error } = await supabase.rpc('admin_backup_export');
          if (error) throw error;

          const filename = backupFilename();
          const sizeBytes = downloadBackupFile(filename, buildBackupFile(data));
          const tableCount = Object.keys(data.tables).length;

          // Falhar o registo NÃO invalida a cópia — o ficheiro já está no disco. O ecrã
          // é que fica sem o saber, e é isso que a mensagem de erro diz.
          const { error: recordError } = await supabase.rpc('record_manual_backup', {
            p_size_bytes: sizeBytes,
            p_object_count: data.row_count,
            p_note: `Exportação JSON de ${tableCount} tabelas, descarregada para ${filename}.`,
          });
          if (recordError) {
            return {
              ok: false as const,
              message: `Cópia gravada em ${filename}, mas não foi possível registá-la no histórico: ${recordError.message}`,
            };
          }

          await get().fetchHealth();
          return {
            ok: true as const,
            data: {
              filename,
              sizeBytes,
              rowCount: data.row_count,
              tableCount,
              includesAccounts: data.auth_users !== null,
            },
          };
        } catch (err) {
          return failure(err, 'Falha ao exportar a base de dados.');
        } finally {
          set({ backingUp: false });
        }
      },
    }),
    { name: 'system-health-store' },
  ),
);
