-- Modalidades configuráveis na app (secção: "tudo o que o admin criar, também tem de
-- editar"). Antes eram uma constante hardcoded no frontend (KNOWN_MODALITIES); passam a
-- viver na BD para poderem ser geridas na aplicação (adicionar/renomear/remover) sem deploy.
create table modalities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table modalities enable row level security;

-- Leitura para todos os autenticados (o dropdown de equipamento precisa da lista);
-- gestão para admin/planner — o mesmo par que já gere equipamento (0001_init.sql).
create policy "modalities_select" on modalities for select to authenticated using (true);
create policy "modalities_write_insert" on modalities for insert to authenticated
  with check (user_role() in ('admin', 'planner'));
create policy "modalities_write_update" on modalities for update to authenticated
  using (user_role() in ('admin', 'planner')) with check (user_role() in ('admin', 'planner'));
create policy "modalities_write_delete" on modalities for delete to authenticated
  using (user_role() in ('admin', 'planner'));

-- Seed com a lista que estava no frontend (KNOWN_MODALITIES), preservando a ordem.
insert into modalities (name, sort_order) values
  ('LINAC', 1),
  ('Braquiterapia', 2),
  ('TPS', 3),
  ('Dosimetria', 4),
  ('TC Simulação', 5),
  ('Outro', 6)
on conflict (name) do nothing;

-- Renomear uma modalidade tem de propagar ao texto livre já gravado em equipment.modality
-- (a coluna é texto, não FK) — as duas escrituras correm na MESMA transacção (uma função =
-- uma transacção), por isso ou mudam ambas ou nenhuma. security definer para poder tocar em
-- equipment saltando a RLS, mas com guarda de role explícita (o mesmo user_role() das
-- policies) para não abrir escrita a quem não devia. A constraint unique(name) rejeita
-- renomear para um nome já existente.
create or replace function rename_modality(p_old_name text, p_new_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if user_role() not in ('admin', 'planner') then
    raise exception 'Sem permissão para gerir modalidades.';
  end if;
  if p_new_name is null or length(trim(p_new_name)) = 0 then
    raise exception 'O nome da modalidade não pode ficar vazio.';
  end if;
  update modalities set name = p_new_name where name = p_old_name;
  update equipment  set modality = p_new_name where modality = p_old_name;
end;
$$;
