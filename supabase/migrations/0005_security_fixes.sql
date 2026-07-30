-- PMPlan — correcções de segurança + versionamento do campo weekend_work.
-- Migração aditiva e idempotente: pode correr numa BD já em produção (onde a coluna
-- weekend_work foi aplicada à mão a partir de DOCS/) ou numa BD reconstruída de raiz.

-- ─── 1. ESCALADA DE PRIVILÉGIOS (crítico) ────────────────────────────────────
-- A política self_update_user_profiles (0001) permite a cada utilizador dar UPDATE
-- à sua própria linha — necessário para editar o nome / limpar must_change_password.
-- Mas role e engineer_id vivem na mesma linha, por isso, sem esta barreira, qualquer
-- utilizador (mesmo 'readonly') podia executar
--     update user_profiles set role = 'admin' where id = auth.uid()
-- e promover-se a administrador. O RLS não filtra por coluna; um trigger BEFORE UPDATE
-- é a forma correcta de o fazer. Corre com os privilégios do owner (security definer)
-- para poder ler o role actual via user_role() sem recursão de políticas.
create or replace function prevent_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() é null quando o UPDATE vem de um contexto de servidor de confiança
  -- (service_role — ex: a Edge Function admin-create-user, que define legitimamente
  -- role e engineer_id). Esse contexto ignora o RLS e tem de poder gravar; a barreira
  -- só se aplica a utilizadores autenticados que NÃO sejam admin.
  if auth.uid() is not null and user_role() is distinct from 'admin' then
    -- user_role() lê o valor JÁ COMMITADO (o UPDATE só é aplicado depois deste trigger),
    -- por isso reflecte o papel real de quem chama, não o que está a tentar gravar.
    if new.role is distinct from old.role then
      raise exception 'Sem permissão para alterar o role.';
    end if;
    if new.engineer_id is distinct from old.engineer_id then
      raise exception 'Sem permissão para alterar a associação a engenheiro.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_privilege_escalation on user_profiles;
create trigger trg_prevent_privilege_escalation
  before update on user_profiles
  for each row execute function prevent_privilege_escalation();

-- ─── 2. weekend_work NO SCHEMA VERSIONADO (antes só em DOCS/) ─────────────────
-- 'none' → só dias úteis (padrão) · 'saturday' → sábado permitido · 'both' → sáb+dom.
alter table equipment
  add column if not exists weekend_work text not null default 'none'
  check (weekend_work in ('none', 'saturday', 'both'));

-- ─── 3. VIEWS COM security_invoker (crítico) ─────────────────────────────────
-- Sem security_invoker, uma view corre com os privilégios do owner e IGNORA o RLS das
-- tabelas subjacentes. Como o frontend lê exclusivamente por estas views, o scoping por
-- zona dos engenheiros (equipment_select / hospitals_select em 0001) não tinha efeito
-- nenhum: qualquer autenticado via todos os hospitais (incl. contactos) e equipamentos.
-- security_invoker = on faz o RLS do utilizador que consulta voltar a aplicar-se.

alter view hospitals_with_zone set (security_invoker = on);

-- equipment_full é recriada para incluir weekend_work E ligar o security_invoker.
drop view if exists equipment_full;
create view equipment_full with (security_invoker = on) as
select
  e.*,
  h.name       as hospital_name,
  h.short_name as hospital_short_name,
  h.country    as hospital_country,
  h.locality   as hospital_locality,
  h.city       as hospital_city,
  z.name       as zone_name,
  z.code       as zone_code,
  z.color      as zone_color
from equipment e
join hospitals h on h.id = e.hospital_id
join zones     z on z.id = e.zone_id;
