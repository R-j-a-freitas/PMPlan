/** Origem de um heartbeat — espelha o CHECK da migração 0010. */
export type HeartbeatSource = 'vps' | 'github_actions' | 'manual';

/** Uma escrita de continuidade feita de fora do Supabase (ver DOCS/KEEP_ALIVE_VPS.md). */
export type SystemHeartbeat = {
  id: string;
  pinged_at: string;
  source: HeartbeatSource;
};

export type BackupStatus = 'ok' | 'warning' | 'failed';

/** Quem produziu a cópia (migração 0018). `vps` é o pg_dump completo do
 *  scripts/backup-supabase.sh; `manual` é a exportação JSON descarregada pelo browser,
 *  que leva os dados mas não o schema nem as palavras-passe. */
export type BackupSource = 'vps' | 'manual';

/** Relatório de uma cópia da base de dados (migração 0013). As linhas `vps` são escritas
 *  pelo scripts/backup-supabase.sh; as `manual` pela função record_manual_backup, que a
 *  aplicação chama depois de gravar o ficheiro. */
export type SystemBackup = {
  id: string;
  ran_at: string;
  size_bytes: number;
  object_count: number | null;
  status: BackupStatus;
  note: string | null;
  source: BackupSource;
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
  /** `false` para origens que não são mecanismos automáticos — hoje só a 'manual'. A
   *  idade delas é informação, não semáforo: "a última verificação à mão foi há duas
   *  semanas" não é avaria nenhuma, e pintá-la de vermelho ensinava a ignorar o ecrã. */
  expected: boolean;
};

/** O que a verificação manual devolve (RPC run_system_check, migração 0018). */
export type SystemCheckResult = {
  /** Instante do heartbeat que a verificação acabou de escrever. */
  pinged_at: string;
  /** PMs contadas — prova de que a base de dados responde para lá da tabela de heartbeats. */
  pm_events: number;
  /** Heartbeats antigos removidos pela purga, como no script da VPS. */
  purged: number;
};

/** O que a exportação devolve (RPC admin_backup_export, migração 0018), e também o que
 *  fica dentro do ficheiro descarregado, debaixo de `data`. As tabelas não são
 *  enumeradas de propósito: a função percorre o catálogo, portanto o conteúdo acompanha
 *  o schema do dia — se aqui estivesse uma lista, seria uma lista a envelhecer. */
export type BackupExport = {
  generated_at: string;
  row_count: number;
  tables: Record<string, unknown[]>;
  /** `null` quando a base de dados não deixou ler auth.users. */
  auth_users: { id: string; email: string | null; created_at: string }[] | null;
};

/** Resultado de uma cópia manual, para o ecrã poder dizer o que gravou. */
export type ManualBackupResult = {
  filename: string;
  sizeBytes: number;
  rowCount: number;
  tableCount: number;
  /** `false` quando a base de dados não deixou ler auth.users — a cópia leva os dados
   *  mas não a lista de contas, e quem a guarda tem de saber disso. */
  includesAccounts: boolean;
};
