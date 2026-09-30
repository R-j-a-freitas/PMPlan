import { useEffect, useMemo, type ReactNode } from 'react';
import { PageShell } from '../app/PageShell';
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui';
import { useAuthStore, useSystemHealthStore, useUiStore } from '../stores';
import {
  BACKUP_SOURCE_LABELS,
  CRITICAL_AFTER_HOURS,
  LEVEL_COLORS,
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
import type { HealthLevel, VpsBackupFile, VpsBackupTier } from '../types';
import { useLang, useT } from '../i18n';
import { HEALTH_LEVEL_KEYS } from '../i18n/labels';

// ─── Peças ───────────────────────────────────────────────────────────────────

function StatusBadge({ level }: { level: HealthLevel }) {
  const t = useT();
  return <Badge color={LEVEL_COLORS[level]}>{t(HEALTH_LEVEL_KEYS[level])}</Badge>;
}

function Empty({ children }: { children: ReactNode }) {
  return <EmptyState size="compact">{children}</EmptyState>;
}

const VPS_TIER_KEYS = {
  daily: 'health.vps.tier.daily',
  weekly: 'health.vps.tier.weekly',
  monthly: 'health.vps.tier.monthly',
} as const satisfies Record<VpsBackupTier, string>;

// ─── Página ──────────────────────────────────────────────────────────────────

// Saúde do sistema (Fase 5 do plano de continuidade). Mostra o que impede a base de dados
// de ser pausada e o que a protege de ser perdida: heartbeats por origem e histórico de
// backups. Só admin — ver canViewSystemHealth em lib/permissions.ts.
//
// Quem alimenta as tabelas continua a ser a VPS e o GitHub Actions, com credenciais
// próprias (ver DOCS/KEEP_ALIVE_VPS.md). As duas acções manuais desta página são a
// excepção, e passam pelas funções da migração 0018 — nunca por um INSERT do browser.
export function SystemHealth() {
  const t = useT();
  const lang = useLang();
  // Datas e horas seguem o idioma da interface: 'pt-PT' fixo dava um formato português
  // a quem escolheu espanhol, no meio de um ecrã todo em espanhol.
  const locale = lang === 'es' ? 'es-ES' : 'pt-PT';
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
  const vpsFiles = useSystemHealthStore((state) => state.vpsFiles);
  const vpsLoading = useSystemHealthStore((state) => state.vpsLoading);
  const vpsError = useSystemHealthStore((state) => state.vpsError);
  const vpsDownloading = useSystemHealthStore((state) => state.vpsDownloading);
  const fetchVpsFiles = useSystemHealthStore((state) => state.fetchVpsFiles);
  const downloadVpsFile = useSystemHealthStore((state) => state.downloadVpsFile);
  const pushToast = useUiStore((state) => state.pushToast);

  useEffect(() => {
    if (!canView) return;
    fetchHealth();
    fetchVpsFiles();
  }, [canView, fetchHealth, fetchVpsFiles]);

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
    const result = await runSystemCheck(t);
    if (!result.ok) {
      pushToast({ variant: 'error', message: result.message });
      return;
    }
    pushToast({
      variant: 'success',
      message: t('health.checkSuccess', { count: result.data.pm_events }),
    });
  }

  async function handleBackup() {
    const result = await runManualBackup(t);
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
        t('health.backupSummary', {
          filename,
          rows: rowCount,
          tables: tableCount,
          size: formatBytes(sizeBytes),
        }) + (includesAccounts ? '' : t('health.backupNoAccounts')),
    });
  }

  async function handleVpsDownload(file: VpsBackupFile) {
    const result = await downloadVpsFile(file, t);
    pushToast(
      result.ok
        ? { variant: 'success', message: t('health.vps.downloaded', { name: file.name }) }
        : { variant: 'error', message: result.message },
    );
  }

  if (!canView) {
    return (
      <PageShell>
        <PageHeader title={t('health.title')} />
        <Card>
          <EmptyState>{t('health.restricted')}</EmptyState>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t('health.title')}
        description={t('health.description')}
        actions={
          <>
            {fetchedAt && (
              <span className="text-xs text-gray-400">
                {t('health.readAt', { time: fetchedAt.toLocaleTimeString(locale) })}
              </span>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                fetchHealth();
                fetchVpsFiles();
              }}
              disabled={loading}
            >
              {loading ? t('common.loading') : t('health.refresh')}
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
            <strong>{t('health.readFailed')}</strong> {error}
            <br />
            {t('health.readFailedHint')}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title={t('health.keepAlive')}
            actions={
              <Button variant="secondary" onClick={handleCheck} disabled={checking}>
                {checking ? t('health.checking') : t('health.checkNow')}
              </Button>
            }
          >
            <div className="mb-3 flex items-center gap-2">
              <StatusBadge level={overall} />
              <span className="text-sm text-gray-600">
                {overall === 'unknown' ? t('health.neverWrote') : t('health.overall')}
              </span>
            </div>

            <table className="pm-table">
              <thead>
                <tr>
                  <th className="pb-1 font-medium">{t('health.col.source')}</th>
                  <th className="pb-1 font-medium">{t('health.col.lastPing')}</th>
                  <th className="pb-1 text-right font-medium">{t('health.col.age')}</th>
                  <th className="pb-1 text-right font-medium">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.source}>
                    <td className="py-1.5 text-gray-700">{SOURCE_LABELS[source.source]}</td>
                    <td className="py-1.5 text-gray-500">
                      {source.lastPing
                        ? new Date(source.lastPing).toLocaleString(locale)
                        : t('health.neverInstalled')}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-700">
                      {formatAge(source.ageHours, t)}
                    </td>
                    <td className="py-1.5 text-right">
                      {/* A origem manual não leva semáforo: mede quando alguém carregou no
                          botão, e um vermelho por isso ensinava a ignorar a coluna toda. */}
                      {source.expected ? (
                        <StatusBadge level={source.level} />
                      ) : (
                        <span className="text-xs text-gray-400">{t('health.informative')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-3 text-xs text-gray-400">
              {t('health.thresholds', { warning: WARNING_AFTER_HOURS, critical: CRITICAL_AFTER_HOURS })}{' '}
              <strong>{t('health.checkNow')}</strong> {t('health.checkNowHint')}
            </p>
          </Card>

          <Card
            title={t('health.backup')}
            actions={
              <Button onClick={handleBackup} disabled={backingUp}>
                {backingUp ? t('health.exporting') : t('health.downloadBackup')}
              </Button>
            }
          >
            {/* O semáforo mede a VPS. Uma exportação manual feita há cinco minutos não é
                razão para este cartão dizer que a protecção automática está de pé — mas
                aparece na tabela abaixo, porque a cópia existe mesmo. */}
            {lastBackup === null ? (
              <Empty>{t('health.noAutomaticBackup')}</Empty>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <StatusBadge level={backupLevel} />
                  <span className="text-sm text-gray-600">
                    {t('health.lastAutomatic', {
                      age: formatAge(backupAge, t),
                      size: formatBytes(lastBackup.size_bytes),
                    })}
                    {lastBackup.object_count !== null &&
                      t('health.objectCount', { count: lastBackup.object_count })}
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
                    <th className="pb-1 font-medium">{t('health.col.when')}</th>
                    <th className="pb-1 font-medium">{t('health.col.source')}</th>
                    <th className="pb-1 text-right font-medium">{t('health.col.size')}</th>
                    <th className="pb-1 text-right font-medium">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.slice(0, 10).map((backup) => (
                    <tr key={backup.id}>
                      <td className="py-1.5 text-gray-700">
                        {new Date(backup.ran_at).toLocaleString(locale)}
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
              {t('health.retention')}
              <br />
              <strong>{t('health.downloadBackup')}</strong> {t('health.downloadHint')}
            </p>
          </Card>
        </div>

        <Card
          className="mt-4"
          title={t('health.vps.title')}
          actions={
            <Button variant="secondary" onClick={fetchVpsFiles} disabled={vpsLoading}>
              {vpsLoading ? t('common.loading') : t('health.vps.reload')}
            </Button>
          }
        >
          {vpsError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <strong>{t('health.vps.unavailable')}</strong> {vpsError}
            </div>
          )}

          {vpsFiles !== null && vpsFiles.length === 0 && <Empty>{t('health.vps.empty')}</Empty>}

          {vpsFiles !== null && vpsFiles.length > 0 && (
            <table className="pm-table">
              <thead>
                <tr>
                  <th className="pb-1 font-medium">{t('health.vps.col.date')}</th>
                  <th className="pb-1 font-medium">{t('health.vps.col.content')}</th>
                  <th className="pb-1 font-medium">{t('health.vps.col.retention')}</th>
                  <th className="pb-1 text-right font-medium">{t('health.col.size')}</th>
                  <th className="pb-1" />
                </tr>
              </thead>
              <tbody>
                {vpsFiles.map((file) => (
                  <tr key={file.name}>
                    <td className="py-1.5 text-gray-700">
                      {new Date(file.modified_at).toLocaleString(locale)}
                    </td>
                    <td className="py-1.5 text-gray-700">
                      {t(file.kind === 'data' ? 'health.vps.kind.data' : 'health.vps.kind.users')}
                      <div className="font-mono text-xs text-gray-400">{file.name}</div>
                    </td>
                    <td className="py-1.5 text-gray-500">
                      {file.tiers.map((tier) => t(VPS_TIER_KEYS[tier])).join(', ')}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-700">
                      {formatBytes(file.size_bytes)}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleVpsDownload(file)}
                        disabled={vpsDownloading !== null}
                      >
                        {vpsDownloading === file.name
                          ? t('health.vps.downloading')
                          : t('health.vps.download')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="mt-3 text-xs text-gray-400">{t('health.vps.hint')}</p>
        </Card>
      </div>
    </PageShell>
  );
}
