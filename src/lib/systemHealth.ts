import type {
  BackupSource,
  HealthLevel,
  HeartbeatSource,
  HeartbeatSourceStatus,
  SystemBackup,
  SystemHeartbeat,
} from '../types';
import type { TFunction } from '../i18n';

/** Limiares do semáforo, em horas (secção da Fase 5 do plano de continuidade).
 *  36h dá margem para uma execução diária falhar uma vez sem alarmar; 72h significa que
 *  três oportunidades seguidas se perderam e a janela de 7 dias do free tier já vai a
 *  meio. */
export const WARNING_AFTER_HOURS = 36;
export const CRITICAL_AFTER_HOURS = 72;

/** Origens que se espera ver a funcionar. 'manual' não está aqui: é uma execução à mão,
 *  não um mecanismo automático, e a sua ausência não é sinal de problema nenhum. */
export const EXPECTED_SOURCES: HeartbeatSource[] = ['vps', 'github_actions'];

export const SOURCE_LABELS: Record<HeartbeatSource, string> = {
  vps: 'VPS (systemd)',
  github_actions: 'GitHub Actions',
  manual: 'Manual',
};

export const BACKUP_SOURCE_LABELS: Record<BackupSource, string> = {
  vps: 'VPS',
  manual: 'Manual',
};

export function levelForAge(ageHours: number | null): HealthLevel {
  if (ageHours === null) return 'unknown';
  if (ageHours > CRITICAL_AFTER_HOURS) return 'critical';
  if (ageHours > WARNING_AFTER_HOURS) return 'warning';
  return 'ok';
}

export function hoursSince(iso: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}

/** Reduz a lista de heartbeats ao último de cada origem esperada, mais as origens
 *  inesperadas que existam (ex.: 'manual', se alguém correu o script à mão).
 *  Fazer isto no cliente e não por RPC é deliberado: a retenção é de 90 registos, e ler
 *  90 linhas é mais barato do que manter uma função SQL a mais para as agregar. */
export function summariseHeartbeats(
  heartbeats: SystemHeartbeat[],
  now: Date = new Date(),
): HeartbeatSourceStatus[] {
  const latest = new Map<HeartbeatSource, string>();
  for (const beat of heartbeats) {
    const current = latest.get(beat.source);
    if (!current || beat.pinged_at > current) latest.set(beat.source, beat.pinged_at);
  }

  // As esperadas aparecem sempre, mesmo sem nunca terem pingado — é assim que o ecrã
  // mostra "por instalar" em vez de simplesmente omitir a linha e dar a ideia de que
  // está tudo coberto.
  const sources: HeartbeatSource[] = [...EXPECTED_SOURCES];
  for (const source of latest.keys()) {
    if (!sources.includes(source)) sources.push(source);
  }

  return sources.map((source) => {
    const lastPing = latest.get(source) ?? null;
    const ageHours = lastPing === null ? null : hoursSince(lastPing, now);
    const expected = EXPECTED_SOURCES.includes(source);
    // Uma origem não esperada nunca é 'critical': a idade de um ping manual mede quando
    // alguém carregou no botão, não a saúde de coisa nenhuma.
    return { source, lastPing, ageHours, level: expected ? levelForAge(ageHours) : 'ok', expected };
  });
}

/** O estado global é o da MELHOR origem AUTOMÁTICA, não o da pior: enquanto uma escrever,
 *  o projecto não é pausado. As origens paradas continuam sinalizadas linha a linha —
 *  perder a redundância é um aviso, não uma emergência.
 *
 *  As origens não automáticas ficam de fora do agregado, e isso é o que impede o botão
 *  "Verificar agora" de mentir: um ping manual adia mesmo a pausa, mas se o semáforo
 *  global o contasse, um clique pintava de verde um ecrã com as duas origens automáticas
 *  mortas — e a próxima pausa apanhava toda a gente desprevenida. */
export function overallHeartbeatLevel(statuses: HeartbeatSourceStatus[]): HealthLevel {
  const ages = statuses
    .filter((s) => s.expected)
    .map((s) => s.ageHours)
    .filter((a): a is number => a !== null);
  if (ages.length === 0) return 'unknown';
  return levelForAge(Math.min(...ages));
}

/** A cópia automática mais recente — a que o semáforo do backup mede.
 *
 *  Só as execuções da VPS contam: são as únicas que levam schema e palavras-passe, as
 *  únicas com retenção e rotação, e as únicas que ninguém tem de se lembrar de fazer. Uma
 *  exportação manual de ontem é útil, mas não é motivo para o ecrã dizer que a protecção
 *  automática está a funcionar. */
export function latestAutomaticBackup(backups: SystemBackup[]): SystemBackup | null {
  // Não assume que a lista vem ordenada: o store lê-a por `ran_at desc` hoje, mas esta
  // função é chamada com o resultado de um `filter`/`concat` qualquer no futuro, e um
  // "último backup" errado é o tipo de engano que este ecrã existe para não cometer.
  return backups.reduce<SystemBackup | null>(
    (latest, backup) =>
      backup.source === 'vps' && (latest === null || backup.ran_at > latest.ran_at)
        ? backup
        : latest,
    null,
  );
}

/** Idade por extenso, na unidade que se lê melhor. Recebe o tradutor porque "dias" muda
 *  de idioma — os minutos e as horas não, mas passam pelo mesmo caminho para a unidade
 *  ficar toda definida no mesmo sítio. */
export function formatAge(ageHours: number | null, t: TFunction): string {
  if (ageHours === null) return '—';
  if (ageHours < 1) return t('health.age.minutes', { value: Math.round(ageHours * 60) });
  if (ageHours < 48) return t('health.age.hours', { value: ageHours.toFixed(1) });
  return t('health.age.days', { value: Math.floor(ageHours / 24) });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export const LEVEL_COLORS: Record<HealthLevel, string> = {
  ok: '#16A34A',
  warning: '#D97706',
  critical: '#DC2626',
  unknown: '#6B7280',
};


