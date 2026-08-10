import { useEffect, useMemo, type ReactNode } from 'react';
import { Topbar } from '../app/Topbar';
import { Badge, Button } from '../components/ui';
import { useAuthStore, useSystemHealthStore } from '../stores';
import {
  CRITICAL_AFTER_HOURS,
  LEVEL_COLORS,
  LEVEL_LABELS,
  SOURCE_LABELS,
  WARNING_AFTER_HOURS,
  formatAge,
  formatBytes,
  hoursSince,
  levelForAge,
  overallHeartbeatLevel,
  summariseHeartbeats,
} from '../lib/systemHealth';
import type { HealthLevel } from '../types';

// ─── Peças ───────────────────────────────────────────────────────────────────

function StatusBadge({ level }: { level: HealthLevel }) {
  return <Badge color={LEVEL_COLORS[level]}>{LEVEL_LABELS[level]}</Badge>;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-gray-400">{children}</p>;
}

// ─── Página ──────────────────────────────────────────────────────────────────

// Saúde do sistema (Fase 5 do plano de continuidade). Mostra o que impede a base de dados
// de ser pausada e o que a protege de ser perdida: heartbeats por origem e histórico de
// backups. Só admin — ver canViewSystemHealth em lib/permissions.ts.
//
// Não escreve nada: as duas tabelas são alimentadas pela VPS e pelo GitHub Actions, com
// credenciais próprias (ver DOCS/KEEP_ALIVE_VPS.md).
export function SystemHealth() {
  const canView = useAuthStore((state) => state.permissions.canViewSystemHealth);
  const heartbeats = useSystemHealthStore((state) => state.heartbeats);
  const backups = useSystemHealthStore((state) => state.backups);
  const loading = useSystemHealthStore((state) => state.loading);
  const error = useSystemHealthStore((state) => state.error);
  const fetchedAt = useSystemHealthStore((state) => state.fetchedAt);
  const fetchHealth = useSystemHealthStore((state) => state.fetchHealth);

  useEffect(() => {
    if (canView) fetchHealth();
  }, [canView, fetchHealth]);

  const sources = useMemo(() => summariseHeartbeats(heartbeats), [heartbeats]);
  const overall = useMemo(() => overallHeartbeatLevel(sources), [sources]);

  const lastBackup = backups[0] ?? null;
  const backupAge = lastBackup ? hoursSince(lastBackup.ran_at) : null;
  // Um backup que correu mas falhou é crítico independentemente da idade: existe registo
  // recente, mas não existe cópia. Sem esta regra o ecrã mostrava verde por o relatório
  // ser de hoje — o pior falso positivo possível neste ecrã.
  const backupLevel: HealthLevel =
    lastBackup?.status === 'failed' ? 'critical' : levelForAge(backupAge);

  if (!canView) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <Topbar />
        <div className="flex-1 p-4">
          <p className="text-sm text-gray-500">Sem permissão para ver a saúde do sistema.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Saúde do sistema</h1>
          <Button variant="ghost" onClick={fetchHealth} disabled={loading}>
            {loading ? 'A carregar…' : '↻ Actualizar'}
          </Button>
          {fetchedAt && (
            <span className="text-xs text-gray-400">
              lido às {fetchedAt.toLocaleTimeString('pt-PT')}
            </span>
          )}
        </div>

        {/* Falhar a leitura é informação, não ausência dela: se esta página não consegue
            falar com a base de dados, o problema que ela existe para detectar pode ser
            precisamente esse. */}
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <strong>Não foi possível ler o estado do sistema.</strong> {error}
            <br />
            Se o erro persistir, confirme no dashboard da Supabase se o projecto está activo
            — este ecrã lê da mesma base de dados que está a diagnosticar.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Keep-alive — impede a pausa por inactividade">
            <div className="mb-3 flex items-center gap-2">
              <StatusBadge level={overall} />
              <span className="text-sm text-gray-600">
                {overall === 'unknown'
                  ? 'Nenhuma origem alguma vez escreveu.'
                  : 'Estado global (a origem mais recente).'}
              </span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="pb-1 font-medium">Origem</th>
                  <th className="pb-1 font-medium">Último sinal</th>
                  <th className="pb-1 text-right font-medium">Idade</th>
                  <th className="pb-1 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.source} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 text-gray-700">{SOURCE_LABELS[source.source]}</td>
                    <td className="py-1.5 text-gray-500">
                      {source.lastPing
                        ? new Date(source.lastPing).toLocaleString('pt-PT')
                        : 'nunca — por instalar'}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-700">
                      {formatAge(source.ageHours)}
                    </td>
                    <td className="py-1.5 text-right">
                      <StatusBadge level={source.level} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-3 text-xs text-gray-400">
              Aviso acima de {WARNING_AFTER_HOURS} h, crítico acima de {CRITICAL_AFTER_HOURS} h.
              O projecto é pausado ao fim de 7 dias sem actividade.
            </p>
          </Card>

          <Card title="Backup — protege do que apaga os dados">
            {lastBackup === null ? (
              <Empty>Nenhum backup registado. O backup ainda não foi instalado na VPS.</Empty>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <StatusBadge level={backupLevel} />
                  <span className="text-sm text-gray-600">
                    Último há {formatAge(backupAge)} · {formatBytes(lastBackup.size_bytes)}
                    {lastBackup.object_count !== null && ` · ${lastBackup.object_count} objectos`}
                  </span>
                </div>
                {lastBackup.note && (
                  <p className="mb-3 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                    {lastBackup.note}
                  </p>
                )}

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="pb-1 font-medium">Quando</th>
                      <th className="pb-1 text-right font-medium">Dimensão</th>
                      <th className="pb-1 text-right font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.slice(0, 10).map((backup) => (
                      <tr key={backup.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-1.5 text-gray-700">
                          {new Date(backup.ran_at).toLocaleString('pt-PT')}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gray-700">
                          {backup.status === 'failed' ? '—' : formatBytes(backup.size_bytes)}
                        </td>
                        <td className="py-1.5 text-right">
                          <StatusBadge
                            level={
                              backup.status === 'failed'
                                ? 'critical'
                                : backup.status === 'warning'
                                  ? 'warning'
                                  : 'ok'
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="mt-3 text-xs text-gray-400">
                  Retenção: 7 diários, 4 semanais, 3 mensais, em /var/backups/pmplan na VPS.
                  Procedimento de restauro em DOCS/DISASTER_RECOVERY.md.
                </p>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
