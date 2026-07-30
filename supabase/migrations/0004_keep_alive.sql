-- OBSOLETA — substituída pela 0010_system_heartbeat.sql.
--
-- Esta migração criava a tabela `keep_alive` e agendava um job pg_cron diário para lhe
-- escrever. Nunca chegou a ser aplicada à instância (auditoria de 2026-07-30: pg_cron não
-- instalado, schema `cron` inexistente, `public.keep_alive` inexistente) — as migrações
-- deste projecto são aplicadas à mão via scripts/run-sql.mjs e esta ficou para trás.
--
-- Não foi reposta em funcionamento porque a abordagem estava errada na raiz: o job corria
-- DENTRO do próprio projecto Supabase. Um projecto pausado não executa os seus próprios
-- crons, portanto o mecanismo não conseguia nem evitar a pausa de forma fiável nem
-- recuperar dela. O heartbeat da 0010 é escrito de FORA (VPS e GitHub Actions), que é o
-- único sítio de onde a actividade pode partir com o projecto adormecido.
--
-- O conteúdo original está no histórico git (ver `git log -p` deste ficheiro).
--
-- O ficheiro é mantido como marco em vez de apagado: o número da migração já foi
-- distribuído e apagá-lo faria uma reconstrução de raiz saltar do 0003 para o 0005, sem
-- deixar registo do porquê.

-- Limpeza idempotente, para o caso de a 0004 original ter sido aplicada a algum ambiente
-- (nesta instância é um no-op). O `if` sobre pg_extension é o que torna isto seguro sem
-- pg_cron instalado: o plpgsql só analisa as instruções do ramo que chega a executar, por
-- isso a referência a `cron.job` nunca é resolvida quando a extensão não existe.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('supabase-keep-alive')
    where exists (select 1 from cron.job where jobname = 'supabase-keep-alive');
  end if;
end;
$$;

drop table if exists keep_alive;
