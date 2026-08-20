import { useEffect, useMemo, type ReactNode } from 'react';
import { PageShell } from '../app/PageShell';
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui';
import { useAuthStore, useSystemHealthStore, useUiStore } from '../stores';
import {
  BACKUP_SOURCE_LABELS,
  CRITICAL_AFTER_HOURS,
  LEVEL_COLORS,
  LEVEL_LABELS,
  SOURCE_LABELS,
  WARNING_AFTER_HOURS,
  formatAge,
  formatBytes,
  hoursSince,
  latestAutomaticBackup,
  levelForAge,
  overallHeartbeatLevel,
  summariseHeartbeats,
} from '../lib/systemHealth';
import type { HealthLevel } from '../types';

// ─── Peças ───────────────────────────────────────────────────────────────────

function StatusBadge({ level }: { level: HealthLevel }) {
  return <Badge color={LEVEL_COLORS[level]}>{LEVEL_LABELS[level]}</Badge>;
}

function Empty({ children }: { children: ReactNode }) {
  return <EmptyState size="compact">{children}</EmptyState>;
}

// ─── Página ──────────────────────────────────────────────────────────────────

// Saúde do sistema (Fase 5 do plano de continuidade). Mostra o que impede a base de dados
// de ser pausada e o que a protege de ser perdida: heartbeats por origem e histórico de
// backups. Só admin — ver canViewSystemHealth em lib/permissions.ts.
//
// Quem alimenta as tabelas continua a ser a VPS e o GitHub Actions, com credenciais
// próprias (ver DOCS/KEEP_ALIVE_VPS.md). As duas acções manuais desta página são a
// excepção, e passam pelas funções da migração 0018 — nunca por um INSERT do browser.
export function SystemHealth() {
  const canView = useAuthStore((state) => state.permissions.canViewSystemHealth);
  const heartbeats = useSystemHealthStore((state) => state.heartbeats);
  const backups = useSystemHealthStore((state) => state.backups);
  const loading = useSystemHealthStore((state) => state.loading);
  const checking = useSystemHealthStore((state) => state.checking);
  const backingUp = useSystemHealthStore((state) => state.backingUp);
  const error = useSystemHealthStore((state) => state.error);
  const fetchedAt = useSystemHealthStore((state) => state.fetchedAt);
  const fetchHealth = useSystemHealthStore((state) => state.fetchHealth);
  const runSystemCheck = useSystemHealthStore((state) => state.runSystemCheck);
  const runManualBackup = useSystemHealthStore((state) => state.runManualBackup);
  const pushToast = useUiStore((state) => state.pushToast);

  useEffect(() => {
    if (canView) fetchHealth();
  }, [canView, fetchHealth]);

  const sources = useMemo(() => summariseHeartbeats(heartbeats), [heartbeats]);
  const overall = useMemo(() => overallHeartbeatLevel(sources), [sources]);

  // O semáforo do backup segue a última execução AUTOMÁTICA. Uma exportação manual de
  // ontem não prova que o backup da VPS está a correr, e é isso que este cartão mede.
  const lastBackup = useMemo(() => latestAutomaticBackup(backups), [backups]);
  const backupAge = lastBackup ? hoursSince(lastBackup.ran_at) : null;
  // Um backup que correu mas falhou é crítico independentemente da idade: existe registo
  // recente, mas não existe cópia. Sem esta regra o ecrã mostrava verde por o relatório
  // ser de hoje — o pior falso positivo possível neste ecrã.
  const backupLevel: HealthLevel =
    lastBackup?.status === 'failed' ? 'critical' : levelForAge(backupAge);

  async function handleCheck() {
    const result = await runSystemCheck();
    if (!result.ok) {
      pushToast({ variant: 'error', message: result.message });
      return;
    }
    pushToast({
      variant: 'success',
      message: `Base de dados a responder: escrita registada e ${result.data.pm_events} PMs contadas.`,
    });
  }

  async function handleBackup() {
    const result = await runManualBackup();
    if (!result.ok) {
      pushToast({ variant: 'error', message: result.message });
      return;
    }
    const { filename, sizeBytes, rowCount, tableCount, includesAccounts } = result.data;
    pushToast({
      // Aviso e não sucesso quando as contas ficaram de fora: o ficheiro foi gravado, mas
      // quem o guardar tem de saber que restaurar por ele deixa toda a gente sem entrar.
      variant: includesAccounts ? 'success' : 'warning',
      message:
        `${filename} — ${rowCount} linhas de ${tableCount} tabelas (${formatBytes(sizeBytes)}).` +
        (includesAccounts ? '' : ' Sem a lista de contas: a base de dados não a deixou ler.'),
    });
  }

  if (!canView) {
    return (
      <PageShell>
        <PageHeader title="Saúde do sistema" />
        <Card>
          <EmptyState>Sem permissão para ver a saúde do sistema.</EmptyState>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Saúde do sistema"
        description="O que impede a base de dados de ser pausada, e o que a protege de ser perdida."
        actions={
          <>
            {fetchedAt && (
              <span className="text-xs text-gray-400">lido às {fetchedAt.toLocaleTimeString('pt-PT')}</span>
            )}
            <Button variant="secondary" onClick={fetchHealth} disabled={loading}>
              {loading ? 'A carregar…' : '↻ Actualizar'}
            </Button>
          </>
        }
      />

      <div>
        {/* Falhar a leitura é informação, não ausência dela: se esta página não consegue
            falar com a base de dados, o problema que ela existe para detectar pode ser
            precisamente esse. */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <strong>Não foi possível ler o estado do sistema.</strong> {error}
            <br />
            Se o erro persistir, confirme no dashboard da Supabase se o projecto está activo
            — este ecrã lê da mesma base de dados que está a diagnosticar.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Keep-alive — impede a pausa por inactividade"
            actions={
              <Button variant="secondary" onClick={handleCheck} disabled={checking}>
                {checking ? 'A verificar…' : 'Verificar agora'}
              </Button>
            }
          >
            <div className="mb-3 flex items-center gap-2">
              <StatusBadge level={overall} />
              <span className="text-sm text-gray-600">
                {overall === 'unknown'
                  ? 'Nenhuma origem automática alguma vez escreveu.'
                  : 'Estado global (a origem automática mais recente).'}
              </span>
            </div>

            <table className="pm-table">
              <thead>
                <tr>
                  <th className="pb-1 font-medium">Origem</th>
                  <th className="pb-1 font-medium">Último sinal</th>
                  <th className="pb-1 text-right font-medium">Idade</th>
                  <th className="pb-1 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.source}>
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
                      {/* A origem manual não leva semáforo: mede quando alguém carregou no
                          botão, e um vermelho por isso ensinava a ignorar a coluna toda. */}
                      {source.expected ? (
                        <StatusBadge level={source.level} />
                      ) : (
                        <span className="text-xs text-gray-400">informativo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-3 text-xs text-gray-400">
              Aviso acima de {WARNING_AFTER_HOURS} h, crítico acima de {CRITICAL_AFTER_HOURS} h,
              contados só sobre as origens automáticas. O projecto é pausado ao fim de 7 dias
              sem actividade. <strong>Verificar agora</strong> escreve na base de dados e conta
              as PMs — adia a contagem dos 7 dias, mas não substitui as origens automáticas.
            </p>
          </Card>

          <Card
            title="Backup — protege do que apaga os dados"
            actions={
              <Button onClick={handleBackup} disabled={backingUp}>
                {backingUp ? 'A exportar…' : 'Descarregar cópia'}
              </Button>
            }
          >
            {/* O semáforo mede a VPS. Uma exportação manual feita há cinco minutos não é
                razão para este cartão dizer que a protecção automática está de pé — mas
                aparece na tabela abaixo, porque a cópia existe mesmo. */}
            {lastBackup === null ? (
              <Empty>
                Nenhum backup automático registado. O backup ainda não foi instalado na VPS.
              </Empty>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <StatusBadge level={backupLevel} />
                  <span className="text-sm text-gray-600">
                    Último automático há {formatAge(backupAge)} · {formatBytes(lastBackup.size_bytes)}
                    {lastBackup.object_count !== null && ` · ${lastBackup.object_count} objectos`}
                  </span>
                </div>
                {lastBackup.note && (
                  <p className="mb-3 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                    {lastBackup.note}
                  </p>
                )}
              </>
            )}

            {backups.length > 0 && (
              <table className="pm-table">
                <thead>
                  <tr>
                    <th className="pb-1 font-medium">Quando</th>
                    <th className="pb-1 font-medium">Origem</th>
                    <th className="pb-1 text-right font-medium">Dimensão</th>
                    <th className="pb-1 text-right font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.slice(0, 10).map((backup) => (
                    <tr key={backup.id}>
                      <td className="py-1.5 text-gray-700">
                        {new Date(backup.ran_at).toLocaleString('pt-PT')}
                      </td>
                      <td className="py-1.5 text-gray-500">
                        {BACKUP_SOURCE_LABELS[backup.source]}
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
            )}

            <p className="mt-3 text-xs text-gray-400">
              Retenção dos automáticos: 7 diários, 4 semanais, 3 mensais, em
              /var/backups/pmplan na VPS. Procedimento de restauro em
              DOCS/DISASTER_RECOVERY.md.
              <br />
              <strong>Descarregar cópia</strong> exporta os dados em JSON para este
              computador. Leva as linhas de todas as tabelas e a lista de contas; não leva
              schema, políticas nem palavras-passe — serve de última linha de defesa, não de
              substituto do backup da VPS.
            </p>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
