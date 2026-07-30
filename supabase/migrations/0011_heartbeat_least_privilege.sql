-- PMPlan — papel dedicado de menor privilégio para o keep-alive (Fase 2, revisão).
--
-- PROBLEMA QUE RESOLVE: o keep-alive da VPS usava a service_role key, que tem BYPASSRLS
-- — leitura e escrita totais sobre toda a base de dados, incluindo contactos de hospitais
-- e perfis de utilizador. Guardar essa credencial numa VPS que até aqui só servia
-- ficheiros estáticos com a chave anon era uma exposição nova e desproporcionada: o
-- serviço precisa de escrever uma linha por dia e mais nada.
--
-- SOLUÇÃO: um papel Postgres dedicado, sem login, ao qual o PostgREST pode mudar (porque
-- é concedido ao `authenticator`), com exactamente três capacidades e nenhuma leitura de
-- dados de domínio. O acesso faz-se com um JWT próprio, assinado com o segredo do
-- projecto, com `role = 'pmplan_heartbeat'` — ver scripts/mint-heartbeat-token.mjs.
--
-- Se este token for comprometido, o atacante consegue: inserir heartbeats, disparar a
-- purga da tabela de heartbeats, e saber quantas PMs existem. Não consegue ler uma única
-- linha de pm_events, hospitals, user_profiles ou de qualquer outra tabela.

-- ─── PAPEL ────────────────────────────────────────────────────────────────────
-- nologin: nunca se liga directamente ao Postgres — só existe como destino de um
-- SET ROLE feito pelo PostgREST depois de validar o JWT.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pmplan_heartbeat') then
    create role pmplan_heartbeat nologin;
  end if;
end;
$$;

-- Sem isto o PostgREST responde "role does not exist" ou falha o SET ROLE: o
-- `authenticator` (o papel com que o PostgREST se liga) só pode assumir papéis de que
-- seja membro. É este grant que torna o papel utilizável através da API REST.
grant pmplan_heartbeat to authenticator;

-- Necessário para sequer resolver nomes de objectos em `public`. Note-se o que NÃO está
-- aqui: nenhum `grant select` em tabela nenhuma. O papel nasce sem acesso a dados, e as
-- default privileges do Supabase (que concedem a anon/authenticated/service_role em cada
-- tabela nova) não o abrangem — tabelas futuras continuam invisíveis para ele.
grant usage on schema public to pmplan_heartbeat;

-- ─── CAPACIDADE 1: escrever o heartbeat ───────────────────────────────────────
-- INSERT e mais nada. Sem SELECT, o papel não consegue ler o histórico que escreve —
-- um token comprometido não revela o padrão de funcionamento da infraestrutura.
--
-- Consequência prática, deliberada: o script NÃO pode usar `Prefer: return=representation`
-- no INSERT, porque devolver a linha inserida exige privilégio de SELECT. O script deixou
-- de o pedir.
grant insert on system_heartbeat to pmplan_heartbeat;

-- O RLS continua activo na tabela e não tem política de INSERT (ver 0010). Isso não
-- bloqueia este papel porque... na verdade bloquearia: ao contrário do service_role, o
-- pmplan_heartbeat não tem BYPASSRLS. É preciso uma política explícita.
create policy "system_heartbeat_insert_heartbeat_role" on system_heartbeat
  for insert to pmplan_heartbeat with check (true);
-- `with check (true)` é seguro aqui porque a única coluna que o chamador controla é
-- `source`, já restringida pelo CHECK da 0010 a três valores; `id` e `pinged_at` são
-- gerados pelo servidor. E o papel não tem SELECT, portanto não pode ler o que escreveu.

-- ─── CAPACIDADE 2: confirmar que o domínio responde ───────────────────────────
-- O passo (b) do keep-alive existe para exercitar uma tabela REAL do domínio, não a de
-- heartbeats: se o serviço só tocasse na sua própria tabela, uma perda de permissões ou
-- corrupção em pm_events passava despercebida indefinidamente.
--
-- Antes fazia-se com um count via PostgREST sobre pm_events, o que exigiria `grant select
-- on pm_events` — devolvendo ao papel a leitura de todo o plano de PMs e anulando o
-- propósito deste ficheiro. Encapsular em security definer preserva o teste e reduz o que
-- atravessa a fronteira a um único inteiro.
create or replace function heartbeat_domain_check()
returns bigint language sql security definer set search_path = public stable as $$
  select count(*) from pm_events;
$$;

revoke all on function heartbeat_domain_check() from public, anon, authenticated;
grant execute on function heartbeat_domain_check() to pmplan_heartbeat, service_role;

-- ─── CAPACIDADE 3: purgar ─────────────────────────────────────────────────────
-- A função é da 0010; aqui só se acrescenta o papel novo à lista de quem a pode executar.
-- Continua vedada a public, anon e authenticated.
grant execute on function purge_system_heartbeat() to pmplan_heartbeat;
