/** Origem de um heartbeat — espelha o CHECK da migração 0010. */
export type HeartbeatSource = 'vps' | 'github_actions' | 'manual';

/** Uma escrita de continuidade feita de fora do Supabase (ver DOCS/KEEP_ALIVE_VPS.md). */
export type SystemHeartbeat = {
  id: string;
  pinged_at: string;
  source: HeartbeatSource;
};

export type BackupStatus = 'ok' | 'warning' | 'failed';

/** Relatório de uma execução do backup na VPS (migração 0013). Escrito pelo
 *  scripts/backup-supabase.sh — a aplicação nunca escreve aqui. */
export type SystemBackup = {
  id: string;
  ran_at: string;
  size_bytes: number;
  object_count: number | null;
  status: BackupStatus;
  note: string | null;
};

/** Níveis do semáforo. `unknown` é distinto de `critical` de propósito: "nunca houve
 *  sinal desta origem" não é o mesmo problema que "houve e parou", e confundi-los levaria
 *  a alarmes falsos em origens que ainda não foram instaladas. */
export type HealthLevel = 'ok' | 'warning' | 'critical' | 'unknown';

/** Estado agregado de uma origem de heartbeat, para uma linha do ecrã de saúde. */
export type HeartbeatSourceStatus = {
  source: HeartbeatSource;
  lastPing: string | null;
  ageHours: number | null;
  level: HealthLevel;
};
