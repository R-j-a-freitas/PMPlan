-- Destinatários em CC configuráveis na app (mesma filosofia das modalidades, 0008: "tudo
-- o que o admin criar, também tem de editar"). Antes a Teresa (contacto Elekta) estava
-- hardcoded como TERESA_EMAIL em pages/Approvals.tsx e ia SEMPRE em CG em todos os envios;
-- passa a viver na BD para se poder ligar/desligar pessoas do loop de emails sem deploy
-- (ex.: tirar alguém dos envios durante testes e voltar a pôr depois — basta o toggle
-- `active`, sem apagar o registo).
create table email_recipients (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  email       text not null unique,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table email_recipients enable row level security;

-- Leitura para todos os autenticados (a página de aprovações precisa da lista para montar
-- o CC); gestão para admin/planner — o mesmo par que já gere equipamento/modalidades.
create policy "email_recipients_select" on email_recipients for select to authenticated using (true);
create policy "email_recipients_insert" on email_recipients for insert to authenticated
  with check (user_role() in ('admin', 'planner'));
create policy "email_recipients_update" on email_recipients for update to authenticated
  using (user_role() in ('admin', 'planner')) with check (user_role() in ('admin', 'planner'));
create policy "email_recipients_delete" on email_recipients for delete to authenticated
  using (user_role() in ('admin', 'planner'));

-- Seed com a Teresa (o antigo TERESA_EMAIL), active=true para preservar o comportamento
-- actual. Para a tirar do loop durante os testes, desactivá-la na app (Aprovações →
-- Destinatários em CC) — não é preciso apagar nem mexer no código.
insert into email_recipients (name, email, sort_order) values
  ('Teresa Matos', 'teresa.matos@elekta.com', 1)
on conflict (email) do nothing;
