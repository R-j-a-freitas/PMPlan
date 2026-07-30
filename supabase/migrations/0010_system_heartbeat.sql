-- PMPlan — heartbeat de continuidade da base de dados (Fase 1).
--
-- PORQUÊ: o projecto Supabase (free tier) é pausado ao fim de 7 dias sem actividade.
-- Toda a actividade de BD desta aplicação depende de alguém ter o browser aberto —
-- não há polling, realtime nem jobs agendados. Um período de férias ou a época baixa
-- de planeamento chegam para o projecto ser pausado.
--
-- Esta tabela é o alvo de uma ESCRITA REAL feita de fora (VPS e GitHub Actions, Fases
-- 2 e 3). Um pedido HTTP a um endpoint de health (o que a app fazia até aqui) é
-- servido pelo GoTrue e nunca toca em Postgres; um INSERT toca.
--
-- Substitui a 0004_keep_alive.sql (pg_cron), que nunca chegou a ser aplicada — e que,
-- mesmo aplicada, teria o defeito de a actividade ser gerada DE DENTRO do próprio
-- projecto: um projecto pausado não corre os seus próprios crons, pelo que o mecanismo
-- não se consegue reanimar a si mesmo.

create table system_heartbeat (
  id         uuid primary key default gen_random_uuid(),
  pinged_at  timestamptz not null default now(),
  -- Saber QUEM pingou é o que permite detectar a falha de uma das origens enquanto a
  -- outra a mascara: se a VPS morrer mas o GitHub Actions continuar, a tabela nunca
  -- fica velha e o problema passava despercebido sem esta coluna.
  source     text not null check (source in ('vps', 'github_actions', 'manual'))
);

-- Todas as consultas são "o mais recente primeiro" (idade do último heartbeat, por
-- origem). DESC evita o scan invertido. Com 90 linhas o ganho é irrelevante hoje, mas
-- o índice é o que impede a consulta de degradar se a retenção for aumentada.
create index system_heartbeat_pinged_at_idx on system_heartbeat (pinged_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table system_heartbeat enable row level security;

-- Leitura só para administradores autenticados. O ecrã de saúde (Fase 5) expõe o ritmo
-- de funcionamento da infraestrutura — não é informação para planners nem engenheiros.
create policy "system_heartbeat_select" on system_heartbeat for select to authenticated
  using (user_role() = 'admin');

-- NÃO existem políticas de INSERT/UPDATE/DELETE, e isso é deliberado: em Postgres, uma
-- operação sem política correspondente é negada. O service_role tem o atributo BYPASSRLS,
-- por isso ignora as políticas por completo e escreve à mesma. A ausência de políticas de
-- escrita É a regra "escrita apenas com service role" — uma política a tentar exprimi-la
-- seria inócua (nunca seria avaliada para o service_role) e enganadora para quem lesse.

-- Defesa em profundidade ao lado do RLS: o Supabase concede por omissão todos os
-- privilégios em tabelas novas de `public` a anon e authenticated. O RLS já bastaria para
-- travar, mas remover o privilégio significa que um futuro `using (true)` distraído numa
-- política ainda assim não abre a tabela ao anónimo.
revoke all on system_heartbeat from anon, authenticated;
grant select on system_heartbeat to authenticated;

-- ─── PURGA ────────────────────────────────────────────────────────────────────
-- Mantém apenas os 90 registos mais recentes (~3 meses a 1 ping/dia por origem, ou ~45
-- dias com as duas origens da Fase 3). Chamada explicitamente pelo script de keep-alive
-- no fim de cada execução, e não por trigger: um trigger correria a cada INSERT, e uma
-- falha na purga faria falhar o próprio heartbeat — exactamente o que não se quer.
--
-- Devolve o número de linhas apagadas para o script poder registá-lo no log.
create or replace function purge_system_heartbeat()
returns integer language plpgsql security definer set search_path = public as $$
declare
  deleted integer;
begin
  delete from system_heartbeat
  where id in (
    -- Desempate por id: sem ele, pings do mesmo instante (as duas origens podem
    -- coincidir) teriam ordem indefinida e a purga poderia oscilar entre execuções.
    select id from system_heartbeat order by pinged_at desc, id desc offset 90
  );
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- Por omissão o Postgres concede EXECUTE em funções novas a PUBLIC, e o PostgREST expõe
-- como RPC tudo o que o chamador puder executar. Sem este revoke, qualquer utilizador
-- autenticado (ou anónimo) podia invocar /rest/v1/rpc/purge_system_heartbeat e apagar o
-- histórico de heartbeats — e, por ser security definer, com sucesso.
revoke all on function purge_system_heartbeat() from public, anon, authenticated;
grant execute on function purge_system_heartbeat() to service_role;
