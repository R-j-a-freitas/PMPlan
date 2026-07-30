-- PMPlan — leitura agregada do estado dos heartbeats (Fase 3).
--
-- O verificador de falhas precisa de saber há quanto tempo cada origem escreveu. O papel
-- pmplan_heartbeat não tem SELECT em system_heartbeat de propósito (0011) — não pode ler
-- o histórico que escreve. Dar-lhe SELECT agora desfaria essa decisão por conveniência.
--
-- Em vez disso, a mesma solução do heartbeat_domain_check: security definer que devolve
-- só o agregado. O que atravessa a fronteira são três valores por origem, não as linhas.
--
-- Devolve uma linha por origem que JÁ TENHA pingado alguma vez. Origens nunca vistas não
-- aparecem — é o verificador que decide se a ausência é um problema ou apenas uma
-- instalação ainda por fazer.
create or replace function heartbeat_status()
returns table (source text, last_ping timestamptz, age_hours numeric)
language sql security definer set search_path = public stable as $$
  select
    h.source,
    max(h.pinged_at) as last_ping,
    round((extract(epoch from now() - max(h.pinged_at)) / 3600)::numeric, 2) as age_hours
  from system_heartbeat h
  group by h.source
  order by h.source;
$$;

revoke all on function heartbeat_status() from public, anon, authenticated;
grant execute on function heartbeat_status() to pmplan_heartbeat, service_role;
