import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { backupFilename, buildBackupFile, downloadBackupFile } from '../lib/backupExport';
import { supabase } from '../lib/supabase';
import type { TFunction } from '../i18n';
import type {
  ManualBackupResult,
  SystemBackup,
  SystemCheckResult,
  SystemHeartbeat,
  VpsBackupFile,
} from '../types';

/** As duas acções manuais devolvem isto em vez de atirarem: quem chama é o ecrã, que tem
 *  de mostrar um toast em qualquer dos casos (é a convenção das outras páginas). */
type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function failure(error: unknown, fallback: string): { ok: false; message: string } {
  return { ok: false, message: error instanceof Error ? error.message : fallback };
}

/** Os ficheiros da VPS não passam pelo Supabase: vêm do scripts/backup-download-server.mjs,
 *  servido pelo Caddy no mesmo domínio da app. Um link simples não serviria — o serviço
 *  exige o token da sessão no cabeçalho Authorization, e é ele que prova que quem pede é
 *  admin. Daí o fetch com o token, e o ficheiro montado em Blob do lado do browser. */
const VPS_BACKUPS_API = '/api/vps-backups';

async function vpsBackupsFetch(path: string): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada — volte a entrar.');
  const res = await fetch(`${VPS_BACKUPS_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // O serviço responde sempre `{ error }` em JSON; se não vier JSON, quem respondeu não
    // foi o serviço (ex.: a app a correr em dev, sem Caddy, devolve o index.html).
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `O serviço de backups da VPS não respondeu (HTTP ${res.status}).`);
  }
  return res;
}

interface SystemHealthState {
  heartbeats: SystemHeartbeat[];
  backups: SystemBackup[];
  loading: boolean;
  /** Separados de `loading` para cada botão poder desactivar-se sozinho sem apagar o
   *  ecrã inteiro enquanto a sua acção corre. */
  checking: boolean;
  backingUp: boolean;
  /** Ficheiros guardados na VPS. `null` enquanto não se leu (ou se a leitura falhou). */
  vpsFiles: VpsBackupFile[] | null;
  vpsLoading: boolean;
  vpsError: string | null;
  /** Nome do ficheiro a descarregar agora, para desactivar só o botão dessa linha. */
  vpsDownloading: string | null;
  /** Distingue "leu e está vazio" de "não conseguiu ler". No ecrã de saúde essa
   *  diferença é tudo: uma tabela vazia significa que nada foi instalado; uma falha de
   *  leitura pode significar que a própria base de dados está em apuros — que é
   *  exactamente o que este ecrã existe para mostrar. */
  error: string | null;
  /** Momento da última leitura bem-sucedida, para o ecrã poder dizer o que está a ver. */
  fetchedAt: Date | null;

  fetchHealth: () => Promise<void>;
  /** Recebem o tradutor de quem as chama: a mensagem devolvida vai directa para um toast
   *  no ecrã de saúde, que existe em português e espanhol. */
  runSystemCheck: (t: TFunction) => Promise<ActionResult<SystemCheckResult>>;
  runManualBackup: (t: TFunction) => Promise<ActionResult<ManualBackupResult>>;
  fetchVpsFiles: () => Promise<void>;
  downloadVpsFile: (file: VpsBackupFile, t: TFunction) => Promise<ActionResult<VpsBackupFile>>;
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
      vpsFiles: null,
      vpsLoading: false,
      vpsError: null,
      vpsDownloading: null,
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
      runSystemCheck: async (t) => {
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
          return failure(err, t('health.checkFailed'));
        } finally {
          set({ checking: false });
        }
      },

      // Exporta os dados, grava o ficheiro no computador de quem carregou, e só depois
      // regista a cópia no histórico. A ordem é essa de propósito: registar primeiro
      // deixava no ecrã a marca de uma cópia que a gravação pode não ter produzido.
      runManualBackup: async (t) => {
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
              message: t('health.backupNotRecorded', { filename, detail: recordError.message }),
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
          return failure(err, t('health.exportFailed'));
        } finally {
          set({ backingUp: false });
        }
      },

      // Lida à parte do fetchHealth: é outro serviço, noutro sítio, e a sua falha (VPS
      // em baixo, app em dev sem Caddy) não pode esconder o que as tabelas do Supabase
      // dizem — nem o contrário.
      fetchVpsFiles: async () => {
        set({ vpsLoading: true, vpsError: null });
        try {
          const res = await vpsBackupsFetch('');
          const body = (await res.json()) as { files: VpsBackupFile[] };
          set({ vpsFiles: body.files, vpsLoading: false });
        } catch (err) {
          set({
            vpsLoading: false,
            vpsError: err instanceof Error ? err.message : String(err),
          });
        }
      },

      downloadVpsFile: async (file, t) => {
        set({ vpsDownloading: file.name });
        try {
          // Os dumps têm centenas de KB — cabem folgadamente em memória, e o Blob é o
          // único caminho para um download que precisa de cabeçalho de autenticação.
          const res = await vpsBackupsFetch(
            `/file/${file.tiers[0]}/${encodeURIComponent(file.name)}`,
          );
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = file.name;
          link.click();
          URL.revokeObjectURL(url);
          return { ok: true as const, data: file };
        } catch (err) {
          return failure(err, t('health.vps.downloadFailed'));
        } finally {
          set({ vpsDownloading: null });
        }
      },
    }),
    { name: 'system-health-store' },
  ),
);
