-- PMPlan — registo dos backups, para o ecrã de saúde (Fase 5).
--
-- PROBLEMA: o ecrã de administração tem de mostrar o último backup e a sua dimensão, mas
-- os backups vivem em /var/backups/pmplan na VPS. O browser não tem — nem deve ter — forma
-- de olhar para o disco de outra máquina.
--
-- SOLUÇÃO: a VPS reporta. No fim de cada execução, o script de backup escreve aqui uma
-- linha com o que aconteceu. O ecrã lê da base de dados como lê tudo o resto.
--
-- Repare-se no efeito lateral útil: se a VPS morrer, esta tabela deixa de crescer e o
-- ecrã mostra "último backup há N dias" — a ausência de notícias passa a ser visível em
-- vez de silenciosa, que é o mesmo princípio do heartbeat.
--
-- ESCRITA: o script liga-se com a PGURL, como papel `postgres`, que é o dono desta tabela
-- e por isso não é sujeito ao RLS (o Postgres isenta o dono, salvo FORCE ROW LEVEL
-- SECURITY). Não é preciso token nem política de INSERT — mas convém saber que é assim,
-- e não por acaso.

create table system_backups (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),
  -- Dimensão do dump em bytes. É o que permite ao ecrã mostrar "12 MB" e ao olho humano
  -- notar que ontem eram 12 MB e hoje são 200 KB.
  size_bytes    bigint not null,
  -- Objectos contados pelo pg_restore --list. Um número plausível é a prova de que o
  -- arquivo é legível, não apenas de que o ficheiro existe.
  object_count  integer,
  status        text not null default 'ok' check (status in ('ok', 'warning', 'failed')),
  -- Contexto quando status != 'ok' (ex.: "encolheu 70% face ao anterior").
  note          text
);

create index system_backups_ran_at_idx on system_backups (ran_at desc);

alter table system_backups enable row level security;

-- Mesma regra do system_heartbeat: só administradores. O ritmo e a dimensão dos backups
-- dizem coisas sobre a infraestrutura que não interessam a planners nem a engenheiros.
create policy "system_backups_select" on system_backups for select to authenticated
  using (user_role() = 'admin');

-- Sem políticas de escrita, pela mesma razão da 0010: quem escreve é o dono da tabela,
-- que o RLS não filtra. Um utilizador autenticado, mesmo admin, não consegue forjar um
-- registo de backup — e um registo de backup forjado é pior do que nenhum, porque
-- convence alguém de que existe uma cópia que não existe.
revoke all on system_backups from anon, authenticated;
grant select on system_backups to authenticated;
