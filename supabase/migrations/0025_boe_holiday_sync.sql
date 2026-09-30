-- PMPlan — importação automática dos feriados regionais de Espanha a partir do BOE.
--
-- A Nager.Date erra os feriados das Comunidades Autónomas (em 2026 faltavam as passagens
-- para segunda-feira e o San José em cinco comunidades, e vinham feriados que não
-- existiam). A fonte oficial é a resolução anual do BOE com a "relación de fiestas
-- laborales", publicada entre Setembro e Dezembro do ano anterior. O script
-- scripts/sync-boe-holidays.mjs corre semanalmente na VPS, lê essa resolução e grava-a
-- através das funções abaixo. Ver DOCS/FERIADOS.md.
--
-- Mesmo modelo de credencial do keep-alive (0011): a VPS não recebe a service_role, recebe
-- um JWT do papel `pmplan_holiday_sync`, que não lê nem escreve tabela nenhuma
-- directamente. Só consegue executar três funções, e a de importação valida tudo o que
-- recebe. Um token comprometido permite, no pior caso, substituir os feriados regionais
-- ES de um ano por outra lista que passe a validação — não expõe dados de clientes.

-- ─── PAPEL ────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pmplan_holiday_sync') then
    create role pmplan_holiday_sync nologin;
  end if;
end;
$$;
grant pmplan_holiday_sync to authenticator;
grant usage on schema public to pmplan_holiday_sync;

-- ─── REGISTO DAS SINCRONIZAÇÕES ───────────────────────────────────────────────
-- Uma linha por tentativa com resultado relevante. A página Feriados lê a última
-- importação para avisar que é altura de rever as fiestas locales do ano novo.
create table holiday_sync_runs (
  id          uuid primary key default gen_random_uuid(),
  ran_at      timestamptz not null default now(),
  target_year int not null check (target_year between 2020 and 2100),
  status      text not null check (status in ('imported', 'unchanged', 'not_published', 'failed')),
  boe_id      text,
  rows_count  int,
  message     text
);
create index holiday_sync_runs_year_idx on holiday_sync_runs (target_year, ran_at desc);

alter table holiday_sync_runs enable row level security;
-- Leitura para qualquer utilizador autenticado: quem gere feriados precisa de ver o aviso,
-- e o conteúdo (ano, data, identificador do BOE) é público.
create policy "holiday_sync_runs_select" on holiday_sync_runs for select to authenticated using (true);
-- Sem políticas de escrita: só as funções security definer abaixo escrevem.
revoke all on holiday_sync_runs from anon, authenticated;
grant select on holiday_sync_runs to authenticated;

-- ─── FUNÇÃO 1: já está importado? ─────────────────────────────────────────────
-- Evita que o script percorra ~120 sumários do BOE todas as semanas depois de o ano já
-- ter sido importado.
create or replace function boe_holidays_imported(p_year int)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from holidays where country = 'ES' and year = p_year and source = 'boe'
  );
$$;

-- ─── FUNÇÃO 2: importar ───────────────────────────────────────────────────────
-- p_holidays: [{ "locality": "ES-AN", "date": "2027-02-28", "name": "Día de Andalucía" }, …]
-- Substitui os regionais ES do ano que vieram da Nager.Date ou de um BOE anterior; os
-- introduzidos à mão (source 'manual…') ficam. Devolve { status, rows, cities } — cities
-- são as cidades espanholas com hospital, para o email lembrar as fiestas locales.
create or replace function import_boe_regional_holidays(p_year int, p_boe_id text, p_holidays jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_codes constant text[] := array[
    'ES-AN','ES-AR','ES-AS','ES-IB','ES-CN','ES-CB','ES-CM','ES-CL','ES-CT',
    'ES-EX','ES-GA','ES-MD','ES-MC','ES-NC','ES-PV','ES-RI','ES-VC'];
  v_count int;
  v_bad text;
  v_status text;
  v_cities jsonb;
begin
  if p_year is null or p_year not between 2020 and 2100 then
    raise exception 'ano inválido: %', p_year;
  end if;
  if p_boe_id is null or p_boe_id !~ '^BOE-A-\d{4}-\d+$' then
    raise exception 'identificador do BOE inválido: %', p_boe_id;
  end if;
  if jsonb_typeof(p_holidays) <> 'array' then
    raise exception 'p_holidays tem de ser um array';
  end if;

  -- Cada linha: código conhecido, data do ano pedido, nome não vazio e curto.
  select string_agg(coalesce(h ->> 'locality', '?') || ' ' || coalesce(h ->> 'date', '?'), ', ')
    into v_bad
    from jsonb_array_elements(p_holidays) h
   where not (h ->> 'locality' = any (v_codes))
      or (h ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$'
      or extract(year from (h ->> 'date')::date) <> p_year
      or coalesce(length(trim(h ->> 'name')), 0) not between 1 and 120;
  if v_bad is not null then
    raise exception 'linhas inválidas: %', v_bad;
  end if;

  -- Cada comunidade com 2 a 6 regionais (12 a 14 feriados no total, menos os nacionais).
  select string_agg(code || '=' || n, ', ')
    into v_bad
    from (
      select code, (select count(*) from jsonb_array_elements(p_holidays) h where h ->> 'locality' = code) as n
        from unnest(v_codes) code
    ) per_region
   where n not between 2 and 6;
  if v_bad is not null then
    raise exception 'número de feriados fora do esperado: %', v_bad;
  end if;

  v_count := jsonb_array_length(p_holidays);

  -- Igual ao que já está gravado como BOE? Então não mexe.
  if (
    select coalesce(array_agg(k order by k), '{}')
      from (select locality || '|' || date::text || '|' || name as k
              from holidays where country = 'ES' and year = p_year and source = 'boe') stored
  ) = (
    select coalesce(array_agg(k order by k), '{}')
      from (select (h ->> 'locality') || '|' || (h ->> 'date') || '|' || trim(h ->> 'name') as k
              from jsonb_array_elements(p_holidays) h) incoming
  ) then
    v_status := 'unchanged';
  else
    delete from holidays
     where country = 'ES' and year = p_year and locality like 'ES-%'
       and source in ('nager-date', 'boe');
    insert into holidays (zone_id, locality, country, date, name, type, year, source)
    select null, h ->> 'locality', 'ES', (h ->> 'date')::date, trim(h ->> 'name'), 'regional', p_year, 'boe'
      from jsonb_array_elements(p_holidays) h
    on conflict do nothing;
    v_status := 'imported';
  end if;

  insert into holiday_sync_runs (target_year, status, boe_id, rows_count)
  values (p_year, v_status, p_boe_id, v_count);

  select coalesce(jsonb_agg(distinct city order by city), '[]')
    into v_cities
    from hospitals where country = 'ES' and active and city is not null;

  return jsonb_build_object('status', v_status, 'rows', v_count, 'cities', v_cities);
end;
$$;

-- ─── FUNÇÃO 3: registar "ainda não saiu" ou falha ─────────────────────────────
create or replace function log_holiday_sync(p_year int, p_status text, p_boe_id text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('not_published', 'failed') then
    raise exception 'estado inválido: % (as importações registam-se na própria função)', p_status;
  end if;
  insert into holiday_sync_runs (target_year, status, boe_id, message)
  values (p_year, p_status, left(p_boe_id, 40), left(p_message, 1000));
  -- Retenção: as tentativas "ainda não saiu" repetem-se todas as semanas até à publicação.
  delete from holiday_sync_runs
   where status = 'not_published' and ran_at < now() - interval '120 days';
end;
$$;

revoke all on function boe_holidays_imported(int) from public, anon, authenticated;
revoke all on function import_boe_regional_holidays(int, text, jsonb) from public, anon, authenticated;
revoke all on function log_holiday_sync(int, text, text, text) from public, anon, authenticated;
grant execute on function boe_holidays_imported(int) to pmplan_holiday_sync, service_role;
grant execute on function import_boe_regional_holidays(int, text, jsonb) to pmplan_holiday_sync, service_role;
grant execute on function log_holiday_sync(int, text, text, text) to pmplan_holiday_sync, service_role;
