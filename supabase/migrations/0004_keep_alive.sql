-- Keep-alive: evita que o projecto Supabase entre em pause por inactividade.
-- A extensão pg_cron executa diariamente às 03:00 UTC: insere e apaga um registo.

create extension if not exists pg_cron with schema extensions;

create table if not exists keep_alive (
  id         serial primary key,
  pinged_at  timestamptz not null default now()
);

-- Garante que só um registo existe de cada vez (limpeza automática)
select cron.schedule(
  'supabase-keep-alive',       -- nome único do job
  '0 3 * * *',                 -- todos os dias às 03:00 UTC
  $$
    insert into keep_alive (pinged_at) values (now());
    delete from keep_alive where pinged_at < now() - interval '1 day';
  $$
);
