-- PMPlan — schema inicial (secção 4 do prompt do projecto)

-- ─── ZONAS GEOGRÁFICAS PARAMETRIZÁVEIS ───────────────────────────────────────
-- Criadas pelo administrador — ex: "Norte PT", "Madrid", "Galiza ES".
-- Uma zona é transfronteiriça por natureza: pode ter hospitais de PT e de ES em
-- simultâneo, por isso o país vive no HOSPITAL, não na zona (ver tabela hospitals).
-- Hierárquica: uma zona pode ter zona-mãe (ex: "Northwest" agrupando "Galiza",
-- "Canárias", "Barcelona", "Zaragoza", "Lisboa"). Atribuir um engenheiro à zona-mãe
-- (engineer_zones) dá-lhe acesso a todas as zonas-filhas — ver user_zone_ids() abaixo.
-- Hospitais continuam ligados às zonas-folha (sem filhos), nunca às zonas-mãe.
create table zones (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  code            text not null unique,    -- ex: "PT-N", "ES-MAD", "PT-C"
  description     text,
  color           text default '#6B7280',  -- cor da zona no mapa de carga sidebar
  parent_zone_id  uuid references zones(id),
  active          boolean default true,
  created_at      timestamptz default now()
);

create or replace function prevent_zone_cycle()
returns trigger language plpgsql as $$
declare
  current_id uuid;
begin
  if new.parent_zone_id is null then
    return new;
  end if;
  if new.parent_zone_id = new.id then
    raise exception 'Uma zona não pode ser a sua própria zona-mãe.';
  end if;
  current_id := new.parent_zone_id;
  while current_id is not null loop
    if current_id = new.id then
      raise exception 'Ciclo detectado na hierarquia de zonas.';
    end if;
    select parent_zone_id into current_id from zones where id = current_id;
  end loop;
  return new;
end;
$$;

create trigger trg_prevent_zone_cycle
  before insert or update of parent_zone_id on zones
  for each row execute function prevent_zone_cycle();

-- ─── HOSPITAIS / CLIENTES ────────────────────────────────────────────────────
-- Cada hospital pertence a uma zona — esta é a relação de origem de toda a hierarquia.
-- country fica aqui (não em zones): a mesma zona pode agrupar hospitais de PT e de ES.
create table hospitals (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  short_name text,                      -- label curto para o calendário ex: "IPO Porto"
  address    text,
  country    text not null check (country in ('PT', 'ES')),
  -- Concelho (PT, texto livre, ex: "Braga") ou Comunidade Autónoma no formato ISO
  -- 3166-2 que a Nager.Date usa em "counties" (ES, ex: "ES-GA" Galiza) — cruza com
  -- holidays.locality para feriados municipais/regionais oficiais (secção: "feriados
  -- locais de PT e regionais de ES onde existam máquinas").
  locality   text,
  -- Cidade/concelho espanhol (ex: "Vigo") — Espanha tem "fiestas locales" (2 por
  -- concelho/ano, definidas pela câmara) que a Nager.Date não cobre, distintas do
  -- feriado regional da Comunidade Autónoma (locality acima). PT não precisa: locality
  -- já é o concelho.
  city       text,
  zone_id    uuid not null references zones(id),   -- OBRIGATÓRIO
  contacts   jsonb default '[]',        -- [{name, email, phone, role}]
  active     boolean default true,
  created_at timestamptz default now()
);

-- ─── ENGENHEIROS ─────────────────────────────────────────────────────────────
create table engineers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  email               text unique not null,
  phone               text,
  primary_zone_id     uuid references zones(id),   -- zona principal de actuação
  skills              text[] default '{}',
  outlook_calendar_id text,             -- ID do calendário Outlook para sincronização
  active              boolean default true,
  created_at          timestamptz default now()
);

-- Engenheiro ↔ Zonas (many-to-many)
-- Um engenheiro pode cobrir múltiplas zonas; primary_zone_id mantém-se para filtros rápidos
create table engineer_zones (
  engineer_id uuid not null references engineers(id) on delete cascade,
  zone_id     uuid not null references zones(id)     on delete cascade,
  is_primary  boolean default false,
  primary key (engineer_id, zone_id)
);

-- ─── EQUIPAMENTOS ────────────────────────────────────────────────────────────
-- zone_id é desnormalizado (copiado de hospitals.zone_id) para performance
-- NÃO editar zone_id directamente na UI — é gerido pelo trigger abaixo
create table equipment (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  manufacturer          text,
  model                 text,
  modality              text not null,   -- 'LINAC','Braquiterapia','TPS','Dosimetria',etc.
  serial_number         text,
  hospital_id           uuid not null references hospitals(id),
  zone_id               uuid not null references zones(id),
  -- zone_id é sempre igual a hospitals.zone_id — actualizado pelo trigger abaixo
  engineer_primary_id   uuid references engineers(id),
  engineer_secondary_id uuid references engineers(id),
  pm_per_year           int not null check (pm_per_year in (1,2,3,4)),
  pm_duration_days      int not null default 1,
  needs_shutdown        boolean default false,
  color                 text not null default '#3B82F6',  -- hex, escolhida pelo utilizador
  active                boolean default true,
  created_at            timestamptz default now()
);

-- Trigger: quando um hospital muda de zona, propaga para todos os seus equipamentos
create or replace function sync_equipment_zone()
returns trigger language plpgsql as $$
begin
  if OLD.zone_id is distinct from NEW.zone_id then
    update equipment
       set zone_id = NEW.zone_id
     where hospital_id = NEW.id;
  end if;
  return NEW;
end;
$$;

create trigger trg_hospital_zone_change
  after update on hospitals
  for each row execute function sync_equipment_zone();

-- ─── EVENTOS PM ──────────────────────────────────────────────────────────────
-- actual_start_date/actual_end_date/completed_at (secção 7) já incluídos na criação:
-- o motor de ancoragem histórica usa actual_start_date ?? start_date como âncora do ano seguinte.
create table pm_events (
  id                 uuid primary key default gen_random_uuid(),
  equipment_id       uuid not null references equipment(id) on delete cascade,
  engineer_id        uuid not null references engineers(id),
  start_date         date not null,         -- data planeada de início
  end_date           date not null,         -- data planeada de fim
  actual_start_date  date,                  -- data real de início (engenheiro preenche)
  actual_end_date    date,                  -- data real de fim
  completed_at       timestamptz,           -- timestamp de conclusão
  status             text not null default 'planned'
    check (status in ('planned','confirmed','in_progress','completed','cancelled','delayed')),
  outlook_event_id   text,            -- ID do evento criado no Outlook
  notes              text,
  created_by         uuid references auth.users(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- ─── TROCAS DE FONTE (BRAQUITERAPIA) ─────────────────────────────────────────
create table source_changes (
  id                   uuid primary key default gen_random_uuid(),
  equipment_id         uuid not null references equipment(id) on delete cascade,
  source_type          text not null,
  initial_activity_gbq numeric,
  planned_date         date not null,
  actual_date          date,
  serial_number        text,
  manufacturer         text,
  notes                text,
  status               text default 'planned'
    check (status in ('planned','completed','cancelled')),
  created_at           timestamptz default now()
);

-- ─── FERIADOS (via Nager.Date API) ───────────────────────────────────────────
-- zone_id null = feriado nacional (aplica a todos os hospitais do país)
-- zone_id preenchido = feriado regional/local (aplica só à zona)
create table holidays (
  id       uuid primary key default gen_random_uuid(),
  zone_id  uuid references zones(id),   -- null para feriados nacionais
  -- Concelho/Comunidade Autónoma oficial (casa com hospitals.locality) — distinto de
  -- zone_id, que é um agrupamento operacional do PMPlan e pode não coincidir com a
  -- divisão administrativa real. Feriados municipais PT e regionais ES usam isto.
  locality text,
  country  text not null check (country in ('PT', 'ES')),
  date     date not null,
  name     text not null,
  type     text not null check (type in ('national','regional','local')),
  year     int not null,
  source   text default 'nager-date',
  -- locality incluído na unicidade: o mesmo feriado (ex: "Quinta-feira Santa") repete-se
  -- com o mesmo nome/data/país em várias Comunidades Autónomas espanholas — sem locality
  -- aqui, o upsert colidia todas as regiões na mesma linha e só a última sobrevivia.
  -- "nulls not distinct" (PG15+) é essencial: zone_id e locality são null em feriados
  -- nacionais, e por omissão o Postgres trata NULL≠NULL, deixando o upsert duplicar a
  -- mesma linha sem detectar conflito nenhum.
  unique nulls not distinct (country, zone_id, locality, date, name)
);
create index idx_holidays_locality on holidays(locality);

-- Regras recorrentes (ex: feriado municipal PT, sempre no mesmo dia/mês todos os anos,
-- ou móvel relativo à Páscoa) — useHolidays.ts expande-as para `holidays` no ano pedido,
-- em vez de cada concelho precisar de uma linha manual por ano. Ver secção: "feriados
-- locais de PT e regionais de ES onde existam máquinas, atribuídos automaticamente
-- quando se introduz um hospital nesse local".
create table holiday_rules (
  id                 uuid primary key default gen_random_uuid(),
  country            text not null check (country in ('PT', 'ES')),
  locality           text not null,
  name               text not null,
  rule_type          text not null check (rule_type in ('fixed_date', 'easter_relative')),
  fixed_month        int check (fixed_month between 1 and 12),
  fixed_day          int check (fixed_day between 1 and 31),
  easter_offset_days int,
  active             boolean default true,
  created_at         timestamptz default now(),
  unique (country, locality, name),
  check (
    (rule_type = 'fixed_date' and fixed_month is not null and fixed_day is not null and easter_offset_days is null)
    or
    (rule_type = 'easter_relative' and easter_offset_days is not null and fixed_month is null and fixed_day is null)
  )
);
create index idx_holiday_rules_locality on holiday_rules(country, locality);

-- ─── LOG DE CONFLITOS ────────────────────────────────────────────────────────
create table conflict_log (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid references pm_events(id) on delete cascade,
  conflict_type text not null
    check (conflict_type in
      ('engineer_overlap','holiday_block','zone_overload','engineer_unavailable')),
  description   text,
  resolved      boolean default false,
  created_at    timestamptz default now()
);

-- ─── UTILIZADORES (extends Supabase Auth) ────────────────────────────────────
create table user_profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  name                 text,
  -- Cópia desnormalizada de auth.users.email: auth.users não é acessível ao cliente
  -- (nem para admins), por isso a página de gestão de utilizadores lista a partir daqui.
  email                text,
  role                 text not null default 'readonly'
    check (role in ('admin','planner','engineer','readonly')),
  engineer_id          uuid references engineers(id),
  microsoft_id         text,             -- Azure AD Object ID para SSO
  -- Contas criadas por um admin (palavra-passe temporária) ficam true até o
  -- utilizador a substituir em /set-password — ver RequireAuth no frontend.
  must_change_password boolean not null default false,
  created_at           timestamptz default now()
);

-- ─── RLS (activar em todas as tabelas) ───────────────────────────────────────
alter table zones           enable row level security;
alter table hospitals       enable row level security;
alter table engineers       enable row level security;
alter table engineer_zones  enable row level security;
alter table equipment       enable row level security;
alter table pm_events       enable row level security;
alter table source_changes  enable row level security;
alter table holidays        enable row level security;
alter table holiday_rules   enable row level security;
alter table conflict_log    enable row level security;
alter table user_profiles   enable row level security;

-- ─── VIEWS PARA QUERIES DO CALENDÁRIO ────────────────────────────────────────
-- Evitam joins repetidos nos componentes — usar sempre estas views no frontend

create view hospitals_with_zone as
select
  h.*,
  z.name    as zone_name,
  z.code    as zone_code,
  z.color   as zone_color
from hospitals h
join zones z on z.id = h.zone_id;

create view equipment_full as
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

-- ─── ÍNDICES CRÍTICOS PARA PERFORMANCE ───────────────────────────────────────
create index idx_pm_events_dates       on pm_events(start_date, end_date);
create index idx_pm_events_engineer    on pm_events(engineer_id);
create index idx_pm_events_equipment   on pm_events(equipment_id);
create index idx_holidays_zone_year    on holidays(zone_id, year, country);
create index idx_holidays_country_year on holidays(country, year);
create index idx_equipment_zone        on equipment(zone_id);
create index idx_equipment_hospital    on equipment(hospital_id);
create index idx_hospitals_zone        on hospitals(zone_id);
create index idx_engineer_zones        on engineer_zones(engineer_id, zone_id);
create index idx_zones_parent          on zones(parent_zone_id);

-- ─── RPC: set_engineer_zones ──────────────────────────────────────────────────
-- Actualiza engineers.primary_zone_id + engineer_zones na mesma transacção implícita
-- da função (secção 4, regra 2: "primary_zone_id é actualizada no mesmo transaction
-- da engineer_zones"). supabase-js não suporta transacções multi-tabela no cliente,
-- por isso esta lógica vive no Postgres e é chamada via supabase.rpc(...).
-- p_primary_zone_id pode ser null (engenheiro fica sem zonas — ex: removida a última
-- zona a partir do ecrã "Zona → Engenheiros", que faz substituição completa da lista).
create or replace function set_engineer_zones(
  p_engineer_id uuid,
  p_zone_ids uuid[],
  p_primary_zone_id uuid default null
) returns void language plpgsql as $$
begin
  delete from engineer_zones where engineer_id = p_engineer_id;

  if coalesce(array_length(p_zone_ids, 1), 0) > 0 then
    insert into engineer_zones (engineer_id, zone_id, is_primary)
    select p_engineer_id, zone_id, (zone_id = p_primary_zone_id)
    from unnest(p_zone_ids) as zone_id;
  end if;

  update engineers set primary_zone_id = p_primary_zone_id where id = p_engineer_id;
end;
$$;

-- ─── NOVO UTILIZADOR → user_profiles ──────────────────────────────────────────
-- Sem isto, o primeiro login de qualquer utilizador falha: useAuthStore.initialize()
-- lê user_profiles pelo id da sessão e não há nenhuma linha à espera. Role por defeito
-- 'readonly' (menor privilégio) — promover para admin/planner/engineer manualmente.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, name, email, role)
  values (new.id, new.raw_user_meta_data ->> 'name', new.email, 'readonly');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── HELPERS PARA RLS POR ROLE (secção 11) ───────────────────────────────────
-- security definer é OBRIGATÓRIO aqui: user_profiles tem uma política
-- (admin_manage_user_profiles) que chama user_role() — sem security definer essa
-- leitura interna voltaria a passar pelas políticas de user_profiles, chamando
-- user_role() outra vez, e o Postgres rejeita com "infinite recursion detected in
-- policy". Com security definer, a função corre com os privilégios do owner (que
-- não está sujeito a RLS), partindo o ciclo.
create or replace function user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from user_profiles where id = auth.uid();
$$;

-- Zonas cobertas pelo engenheiro autenticado (via engineer_zones), expandidas para
-- incluir todas as zonas-filhas (recursivo) — atribuir alguém à zona-mãe (ex:
-- "Northwest") dá-lhe automaticamente acesso a "Galiza", "Canárias", etc., sem ser
-- preciso listar cada zona-filha em engineer_zones. Mesma razão de security definer:
-- o join lê user_profiles.
create or replace function user_zone_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  with recursive direct_zones as (
    select ez.zone_id
    from engineer_zones ez
    join user_profiles up on up.engineer_id = ez.engineer_id
    where up.id = auth.uid()
  ),
  all_zones as (
    select zone_id from direct_zones
    union
    select z.id
    from zones z
    join all_zones az on z.parent_zone_id = az.zone_id
  )
  select coalesce(array_agg(zone_id), '{}') from all_zones;
$$;

-- ─── POLÍTICAS RLS POR ROLE ───────────────────────────────────────────────────
-- admin:    acesso total.
-- planner:  gere equipment/pm_events/source_changes, NÃO gere zonas/hospitais/engenheiros,
--           não elimina pm_events.
-- engineer: só consulta (sem criar/editar/eliminar PM) e só vê dados das suas zonas
--           (engineer_zones) — secção: "engenheiros só podem consultar o calendário
--           sem o alterar, e só da sua zona".
-- readonly: só consulta, sem scoping de zona (relatórios globais).

-- zones — gestão exclusiva do admin (nome, código, cor); leitura para todos.
create policy "zones_select" on zones for select to authenticated using (true);
create policy "zones_admin_insert" on zones for insert to authenticated
  with check (user_role() = 'admin');
create policy "zones_admin_update" on zones for update to authenticated
  using (user_role() = 'admin') with check (user_role() = 'admin');
create policy "zones_admin_delete" on zones for delete to authenticated
  using (user_role() = 'admin');

-- hospitals — introduzidos por zona, gestão exclusiva do admin.
create policy "hospitals_select" on hospitals for select to authenticated using (
  user_role() in ('admin', 'planner', 'readonly')
  or (user_role() = 'engineer' and zone_id = any (user_zone_ids()))
);
create policy "hospitals_admin_insert" on hospitals for insert to authenticated
  with check (user_role() = 'admin');
create policy "hospitals_admin_update" on hospitals for update to authenticated
  using (user_role() = 'admin') with check (user_role() = 'admin');
create policy "hospitals_admin_delete" on hospitals for delete to authenticated
  using (user_role() = 'admin');

-- engineers / engineer_zones — leitura geral (precisa de nomes para atribuições e
-- para o engenheiro ver o seu próprio registo); escrita exclusiva do admin.
create policy "engineers_select" on engineers for select to authenticated using (true);
create policy "engineers_admin_insert" on engineers for insert to authenticated
  with check (user_role() = 'admin');
create policy "engineers_admin_update" on engineers for update to authenticated
  using (user_role() = 'admin') with check (user_role() = 'admin');
create policy "engineers_admin_delete" on engineers for delete to authenticated
  using (user_role() = 'admin');

create policy "engineer_zones_select" on engineer_zones for select to authenticated using (true);
create policy "engineer_zones_admin_insert" on engineer_zones for insert to authenticated
  with check (user_role() = 'admin');
create policy "engineer_zones_admin_update" on engineer_zones for update to authenticated
  using (user_role() = 'admin') with check (user_role() = 'admin');
create policy "engineer_zones_admin_delete" on engineer_zones for delete to authenticated
  using (user_role() = 'admin');

-- equipment — admin/planner gerem; engineer só vê o da sua zona; readonly vê tudo.
create policy "equipment_select" on equipment for select to authenticated using (
  user_role() in ('admin', 'planner', 'readonly')
  or (user_role() = 'engineer' and zone_id = any (user_zone_ids()))
);
create policy "equipment_write_insert" on equipment for insert to authenticated
  with check (user_role() in ('admin', 'planner'));
create policy "equipment_write_update" on equipment for update to authenticated
  using (user_role() in ('admin', 'planner')) with check (user_role() in ('admin', 'planner'));
create policy "equipment_write_delete" on equipment for delete to authenticated
  using (user_role() in ('admin', 'planner'));

-- pm_events — o calendário em si: engineer é sempre só-leitura (mesmo dos seus
-- próprios eventos), scoped à zona via equipment.zone_id.
create policy "pm_events_select" on pm_events for select to authenticated using (
  user_role() in ('admin', 'planner', 'readonly')
  or (
    user_role() = 'engineer'
    and equipment_id in (select id from equipment where zone_id = any (user_zone_ids()))
  )
);
create policy "pm_events_write_insert" on pm_events for insert to authenticated
  with check (user_role() in ('admin', 'planner'));
create policy "pm_events_write_update" on pm_events for update to authenticated
  using (user_role() in ('admin', 'planner')) with check (user_role() in ('admin', 'planner'));
create policy "pm_events_admin_delete" on pm_events for delete to authenticated
  using (user_role() = 'admin');

-- source_changes — mesmo padrão de scoping de pm_events (também ligado a equipment).
create policy "source_changes_select" on source_changes for select to authenticated using (
  user_role() in ('admin', 'planner', 'readonly')
  or (
    user_role() = 'engineer'
    and equipment_id in (select id from equipment where zone_id = any (user_zone_ids()))
  )
);
create policy "source_changes_write_insert" on source_changes for insert to authenticated
  with check (user_role() in ('admin', 'planner'));
create policy "source_changes_write_update" on source_changes for update to authenticated
  using (user_role() in ('admin', 'planner')) with check (user_role() in ('admin', 'planner'));
create policy "source_changes_admin_delete" on source_changes for delete to authenticated
  using (user_role() = 'admin');

-- holidays — leitura geral (o calendário de todos precisa de feriados); escrita
-- (seed automático a partir da Nager.Date) reservada a admin/planner.
create policy "holidays_select" on holidays for select to authenticated using (true);
create policy "holidays_write_insert" on holidays for insert to authenticated
  with check (user_role() in ('admin', 'planner'));
create policy "holidays_write_update" on holidays for update to authenticated
  using (user_role() in ('admin', 'planner')) with check (user_role() in ('admin', 'planner'));
create policy "holidays_write_delete" on holidays for delete to authenticated
  using (user_role() in ('admin', 'planner'));

create policy "holiday_rules_select" on holiday_rules for select to authenticated using (true);
create policy "holiday_rules_write_insert" on holiday_rules for insert to authenticated
  with check (user_role() in ('admin', 'planner'));
create policy "holiday_rules_write_update" on holiday_rules for update to authenticated
  using (user_role() in ('admin', 'planner')) with check (user_role() in ('admin', 'planner'));
create policy "holiday_rules_write_delete" on holiday_rules for delete to authenticated
  using (user_role() in ('admin', 'planner'));

-- conflict_log — interno a quem planeia.
create policy "conflict_log_select" on conflict_log for select to authenticated
  using (user_role() in ('admin', 'planner', 'readonly'));
create policy "conflict_log_write_insert" on conflict_log for insert to authenticated
  with check (user_role() in ('admin', 'planner'));
create policy "conflict_log_write_update" on conflict_log for update to authenticated
  using (user_role() in ('admin', 'planner')) with check (user_role() in ('admin', 'planner'));

-- user_profiles — cada utilizador vê/edita o seu próprio perfil; admin gere todos
-- (promover/despromover role, associar engineer_id).
create policy "self_read_user_profiles" on user_profiles
  for select to authenticated using (id = auth.uid());
create policy "self_update_user_profiles" on user_profiles
  for update to authenticated using (id = auth.uid());
create policy "admin_manage_user_profiles" on user_profiles
  for all to authenticated using (user_role() = 'admin') with check (user_role() = 'admin');

-- ─── DEV-ONLY: exec_sql ────────────────────────────────────────────────────────
-- Permite aplicar DDL via supabase-js (service_role) durante o desenvolvimento, sem
-- colar SQL manualmente no editor a cada alteração de schema. Trancada a service_role
-- (revoke de public/anon/authenticated) — não acrescenta poder novo à service_role
-- (que já tem acesso total), só expõe o que ela já pode fazer através do canal RPC.
-- REMOVER ANTES DE PRODUÇÃO (drop function exec_sql(text);) — é uma conveniência de
-- sessão de desenvolvimento, não faz parte da superfície da aplicação.
create or replace function exec_sql(sql text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute sql;
end;
$$;

revoke all on function exec_sql(text) from public;
revoke all on function exec_sql(text) from anon;
revoke all on function exec_sql(text) from authenticated;
grant execute on function exec_sql(text) to service_role;
