#!/usr/bin/env bash
# PMPlan — teste de restauro (Fase 4, ponto 5).
#
# Restaura um backup para uma base de dados descartável NO PRÓPRIO SERVIDOR local e
# verifica o resultado. Não toca em produção em momento nenhum: a única coisa que lê do
# Supabase é... nada. Trabalha exclusivamente sobre o ficheiro de dump.
#
# PORQUÊ EXISTIR: um backup que nunca foi restaurado não é um backup, é um ficheiro. E o
# momento errado para descobrir que não presta é durante um incidente. Isto transforma a
# verificação trimestral num comando, que é a diferença entre ser feita e não ser.
#
# USO:
#   sudo -u postgres ./scripts/test-restore.sh                     # backup mais recente
#   sudo -u postgres ./scripts/test-restore.sh /caminho/para.dump  # um específico
#
# REQUER: postgresql-17 (servidor + cliente) na máquina, e permissão para criar bases de
# dados. Ver DOCS/DISASTER_RECOVERY.md, secção "Requisitos das ferramentas".
#
# A base de dados de teste é SEMPRE destruída no fim, inclusive se algo correr mal
# (trap EXIT) — não fica uma cópia dos dados esquecida no servidor.

set -uo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/pmplan}"
SCRATCH_DB="${SCRATCH_DB:-pmplan_restore_test}"
# Ligação ao Postgres LOCAL, não ao Supabase. Por omissão usa o socket unix, que com
# `sudo -u postgres` autentica por peer sem password.
LOCAL="${LOCAL_PGURL:-postgresql:///postgres}"

DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP="$(ls -1t "$BACKUP_ROOT"/daily/pmplan-2*.dump 2>/dev/null | head -1 || true)"
fi
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "ERRO: nenhum backup encontrado em $BACKUP_ROOT/daily/ (nem indicado por argumento)." >&2
  exit 1
fi

cleanup() {
  echo
  echo "--- a destruir a base de dados de teste ---"
  psql "$LOCAL" -q -c "drop database if exists \"$SCRATCH_DB\" with (force);" 2>/dev/null \
    || psql "$LOCAL" -q -c "drop database if exists \"$SCRATCH_DB\";" 2>/dev/null \
    || echo "AVISO: não foi possível apagar $SCRATCH_DB — apagar à mão!"
}
trap cleanup EXIT

echo "=== Teste de restauro PMPlan ==="
echo "Backup:  $DUMP"
echo "Dimensão: $(stat -c %s "$DUMP") bytes"
echo "Data:     $(stat -c %y "$DUMP" | cut -d. -f1)"
echo

echo "--- 1. integridade do arquivo ---"
if ! pg_restore --list "$DUMP" > /tmp/pmplan-restore-list.txt 2>&1; then
  echo "FALHOU: o arquivo não é legível pelo pg_restore."
  cat /tmp/pmplan-restore-list.txt
  exit 1
fi
echo "OK — $(grep -c ';' /tmp/pmplan-restore-list.txt) objectos no arquivo"

echo
echo "--- 2. base de dados descartável ---"
psql "$LOCAL" -q -c "drop database if exists \"$SCRATCH_DB\";" 2>/dev/null || true
psql "$LOCAL" -q -c "create database \"$SCRATCH_DB\";" || { echo "FALHOU: não consegui criar $SCRATCH_DB"; exit 1; }
echo "OK — $SCRATCH_DB criada"

echo
echo "--- 3. papéis que o dump espera ---"
# Papéis de cluster: só se criam se não existirem, e nunca se apagam no fim (podem já
# pertencer a outra coisa no servidor).
psql "$LOCAL" -q <<'SQL' 2>/dev/null
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','pmplan_heartbeat'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login;
  end if;
end $$;
SQL
echo "OK"

echo
echo "--- 4. restauro ---"
SCRATCH_URL="${LOCAL%/*}/$SCRATCH_DB"
RESTORE_LOG=/tmp/pmplan-restore.log
if pg_restore --dbname="$SCRATCH_URL" --no-owner --no-privileges --schema=public \
     "$DUMP" > "$RESTORE_LOG" 2>&1; then
  echo "OK — sem erros"
else
  # pg_restore devolve != 0 também para avisos não fatais. Distinguir importa: um
  # restauro com 3 avisos de GRANT é utilizável; um com 200 erros de sintaxe não é.
  ERRS=$(grep -c '^pg_restore: error' "$RESTORE_LOG" || true)
  echo "CONCLUÍDO COM $ERRS erro(s) — primeiras linhas:"
  grep '^pg_restore: error' "$RESTORE_LOG" | head -10
  echo "(log completo em $RESTORE_LOG)"
fi

echo
echo "--- 5. verificação do conteúdo ---"
psql "$SCRATCH_URL" -X -q -P pager=off <<'SQL'
select 'tabelas'   as objecto, count(*)::text as n from pg_tables  where schemaname = 'public'
union all select 'vistas',     count(*)::text from pg_views       where schemaname = 'public'
union all select 'políticas',  count(*)::text from pg_policies    where schemaname = 'public'
union all select 'funções',    count(*)::text from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all select 'índices',    count(*)::text from pg_indexes     where schemaname = 'public';

\echo
\echo 'Contagens por tabela do domínio:'
select 'pm_events' t, count(*) from pm_events
union all select 'equipment',     count(*) from equipment
union all select 'hospitals',     count(*) from hospitals
union all select 'engineers',     count(*) from engineers
union all select 'zones',         count(*) from zones
union all select 'user_profiles', count(*) from user_profiles
order by 1;

\echo
\echo 'Tabelas SEM row level security (devem ser zero):'
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;

\echo
\echo 'Funções de segurança em falta (deve vir vazio):'
select f.nome from (values ('user_role'),('user_zone_ids'),('purge_system_heartbeat'),
                           ('heartbeat_domain_check'),('heartbeat_status')) as f(nome)
where not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = f.nome);
SQL

echo
echo "=== Fim. Registar o resultado na tabela de DOCS/DISASTER_RECOVERY.md ==="
