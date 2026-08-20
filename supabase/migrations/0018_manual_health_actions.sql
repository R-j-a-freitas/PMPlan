-- PMPlan — acções manuais do ecrã de saúde do sistema.
--
-- PORQUÊ: até aqui o ecrã de saúde era só leitura. Quem o abria e via "VPS — nunca, por
-- instalar" ou "nenhum backup registado" não tinha nada a fazer dentro da aplicação: a
-- única forma de gerar um heartbeat ou uma cópia era entrar na VPS por SSH. Nos dois
-- momentos em que isso mais importa — antes de umas férias, ou antes de uma migração
-- arriscada — quem administra o PMPlan está no browser, não numa consola.
--
-- O QUE ESTA MIGRAÇÃO ACRESCENTA: três funções, todas restritas a admin, e uma coluna.
--
--   run_system_check()      escreve um heartbeat 'manual' e confirma que o domínio responde
--   admin_backup_export()   devolve os dados de `public` (+ contas) num único jsonb
--   record_manual_backup()  regista no histórico a cópia que o browser acabou de gravar
--
-- O QUE NÃO MUDA: continua a não existir política de INSERT em nenhuma das duas tabelas
-- de continuidade. Estas funções são security definer e correm como o dono das tabelas —
-- o caminho de escrita continua fechado a quem chega pelo PostgREST com a sua própria
-- sessão, e cada função verifica `user_role() = 'admin'` à cabeça.

-- ─── ORIGEM DO REGISTO DE BACKUP ──────────────────────────────────────────────
-- A migração 0013 defende, com razão, que "um registo de backup forjado é pior do que
-- nenhum, porque convence alguém de que existe uma cópia que não existe". Permitir que a
-- aplicação escreva nesta tabela sem mais nada desfazia essa garantia.
--
-- Esta coluna é o que a preserva: `record_manual_backup` fixa 'manual' no código e não
-- aceita a origem como argumento, portanto continua a ser impossível — a partir da
-- aplicação, com qualquer sessão, mesmo de admin — fabricar uma linha que se faça passar
-- por uma execução do backup da VPS. O ecrã de saúde grava o semáforo do backup na
-- origem 'vps' e mostra as manuais como o que são: cópias avulsas, feitas à mão.
--
-- O default 'vps' é o correcto para as linhas que já lá estão: todas vieram do
-- scripts/backup-supabase.sh, que é quem escrevia nesta tabela até hoje.
alter table system_backups
  add column if not exists source text not null default 'vps'
  check (source in ('vps', 'manual'));

comment on column system_backups.source is
  'Quem produziu a cópia: ''vps'' (backup-supabase.sh, pg_dump completo) ou ''manual'' '
  '(exportação JSON descarregada pelo browser). Só o script da VPS escreve ''vps''.';

-- ─── VERIFICAÇÃO DE ESTADO ────────────────────────────────────────────────────
-- Faz à mão as duas primeiras etapas do keep-alive da VPS (ver DOCS/KEEP_ALIVE_VPS.md):
-- escreve, lê uma tabela real do domínio, e purga. Escrever é o que conta como actividade
-- para o free tier; ler pm_events é o que distingue "a base de dados aceita escritas na
-- tabela de heartbeats" de "a base de dados está inteira".
--
-- O heartbeat fica com source = 'manual' e não 'vps'. É essa distinção que impede o botão
-- de mascarar uma avaria: um clique aqui não pode pôr a linha da VPS verde, e o semáforo
-- global do ecrã só olha para as origens automáticas.
create or replace function run_system_check()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pinged   timestamptz;
  pm_count bigint;
  purged   integer;
begin
  if user_role() <> 'admin' then
    raise exception 'Apenas administradores podem verificar o estado do sistema.'
      using errcode = '42501';
  end if;

  insert into system_heartbeat (source) values ('manual')
  returning pinged_at into pinged;

  select count(*) into pm_count from pm_events;

  -- Mesma purga que o script corre no fim de cada execução: sem ela, um botão usado com
  -- frequência fazia a tabela crescer sem limite, ao contrário de todas as outras origens.
  purged := purge_system_heartbeat();

  return jsonb_build_object(
    'pinged_at', pinged,
    'pm_events', pm_count,
    'purged', purged
  );
end;
$$;

-- Sem revoke, o PostgREST expõe a função a quem a possa executar — e o Postgres concede
-- EXECUTE a PUBLIC por omissão. `authenticated` é o papel de qualquer sessão da app; a
-- verificação de admin está dentro da função, porque é lá que auth.uid() existe.
revoke all on function run_system_check() from public, anon;
grant execute on function run_system_check() to authenticated, service_role;

-- ─── EXPORTAÇÃO DOS DADOS ─────────────────────────────────────────────────────
-- Devolve tudo o que está em `public` num único jsonb, para o browser gravar em ficheiro.
--
-- Percorre o catálogo em vez de listar as tabelas: uma lista fixa envelhece em silêncio —
-- a tabela acrescentada daqui a seis meses ficaria de fora da cópia sem ninguém dar por
-- isso, e uma cópia incompleta com aspecto de completa é o pior resultado possível aqui.
--
-- Isto NÃO substitui o pg_dump da VPS, e o ecrã diz isso a quem carrega no botão: não leva
-- schema, índices, políticas de RLS nem palavras-passe. Serve para o caso em que o projecto
-- Supabase se perde e é preciso ter os dados em algum lado que não seja o fornecedor.
create or replace function admin_backup_export()
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  tables_json jsonb := '{}'::jsonb;
  table_rows  jsonb;
  rows_total  bigint := 0;
  accounts    jsonb;
  tbl         record;
begin
  if user_role() <> 'admin' then
    raise exception 'Apenas administradores podem exportar a base de dados.'
      using errcode = '42501';
  end if;

  for tbl in
    select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'          -- só tabelas base: as views são derivadas e duplicariam dados
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I x', tbl.name)
      into table_rows;
    tables_json := tables_json || jsonb_build_object(tbl.name, table_rows);
    rows_total := rows_total + jsonb_array_length(table_rows);
  end loop;

  -- As contas vivem em auth.users, fora de `public` — sem elas a cópia devolve os dados
  -- mas ninguém consegue entrar (é a mesma razão pela qual o script da VPS as exporta).
  -- Vai só o suficiente para recriar os acessos: id, email e data. As palavras-passe são
  -- hashes geridos pela plataforma e não saem daqui.
  --
  -- Se o dono desta função não puder ler auth.users, a exportação dos dados não pode
  -- falhar por causa disso — segue sem as contas, e o ficheiro diz que ficaram de fora.
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', u.id, 'email', u.email, 'created_at', u.created_at
           ) order by u.created_at), '[]'::jsonb)
      into accounts
    from auth.users u;
  exception when insufficient_privilege then
    accounts := null;
  end;

  return jsonb_build_object(
    'generated_at', now(),
    'row_count', rows_total,
    'tables', tables_json,
    'auth_users', accounts
  );
end;
$$;

revoke all on function admin_backup_export() from public, anon;
grant execute on function admin_backup_export() to authenticated, service_role;

-- ─── REGISTO DA CÓPIA MANUAL ──────────────────────────────────────────────────
-- Chamada pela aplicação DEPOIS de o ficheiro ter sido gravado, com a dimensão real do
-- que foi para o disco. A ordem importa: registar antes de descarregar deixaria no
-- histórico uma cópia que a gravação pode ter falhado.
--
-- Note-se o que o chamador não controla: `source` é fixo, `status` é fixo, `ran_at` é do
-- servidor. O que ele pode falsear é a dimensão — e uma dimensão falsa numa linha marcada
-- como manual não engana o semáforo, que só conta as execuções da VPS.
create or replace function record_manual_backup(
  p_size_bytes   bigint,
  p_object_count integer default null,
  p_note         text default null
)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  ran timestamptz;
begin
  if user_role() <> 'admin' then
    raise exception 'Apenas administradores podem registar cópias da base de dados.'
      using errcode = '42501';
  end if;

  -- Um registo de dimensão zero descreveria um ficheiro vazio, que não é uma cópia.
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'Dimensão inválida para uma cópia (%).', p_size_bytes
      using errcode = '22023';
  end if;

  insert into system_backups (size_bytes, object_count, status, note, source)
  values (p_size_bytes, p_object_count, 'ok', nullif(p_note, ''), 'manual')
  returning ran_at into ran;

  -- Mesma retenção de 90 registos que o script da VPS aplica (ver backup-supabase.sh).
  delete from system_backups
  where id in (select id from system_backups order by ran_at desc, id desc offset 90);

  return ran;
end;
$$;

revoke all on function record_manual_backup(bigint, integer, text) from public, anon;
grant execute on function record_manual_backup(bigint, integer, text) to authenticated, service_role;

-- O PostgREST só expõe como RPC o que estiver na sua cache de schema. O Supabase recarrega
-- sozinho por event trigger, mas aplicar esta migração pelo exec_sql (scripts/run-sql.mjs)
-- pode não o disparar — e o sintoma seria um 404 nos três botões, com o SQL correcto.
notify pgrst, 'reload schema';
