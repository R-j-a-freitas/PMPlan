-- Definições da aplicação em chave/valor.
--
-- Nasce de uma necessidade concreta: poder tirar os Team Leaders do loop de emails
-- durante os testes, tal como já se faz pessoa a pessoa em email_recipients.active. Os
-- TLs não estão nessa tabela (vêm das zonas, ver 0014), por isso precisavam de um
-- interruptor próprio — e um interruptor tem de viver na BD, senão volta a ligar-se
-- sozinho no próximo deploy e alguém leva um email que não devia.
--
-- Genérica de propósito: a próxima definição global entra aqui em vez de gerar mais uma
-- tabela de uma linha só.
create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

alter table app_settings enable row level security;

-- Leitura para todos os autenticados (a página de aprovações precisa de saber se inclui
-- os TLs antes de enviar); escrita para admin/planner — o mesmo par que gere os
-- destinatários em CC.
create policy "app_settings_select" on app_settings for select to authenticated using (true);
create policy "app_settings_insert" on app_settings for insert to authenticated
  with check (public.user_role() in ('admin', 'planner'));
create policy "app_settings_update" on app_settings for update to authenticated
  using (public.user_role() in ('admin', 'planner')) with check (public.user_role() in ('admin', 'planner'));

-- Ligado por omissão: incluir o TL é o comportamento pedido: desligar é a excepção
-- temporária dos testes. Quem desligar tem de voltar a ligar de propósito.
insert into app_settings (key, value, description) values
  (
    'include_team_leaders_in_client_emails',
    'true'::jsonb,
    'Incluir em CC o Team Leader da zona nos emails enviados a clientes (proposta e carta de assinatura). Desligar durante testes para não incomodar os TLs.'
  )
on conflict (key) do nothing;
