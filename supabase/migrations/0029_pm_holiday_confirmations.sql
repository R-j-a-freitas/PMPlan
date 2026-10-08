-- PMPlan — confirmação de PMs marcadas em feriados.
--
-- A revisão "PMs marcadas em feriados" (página Feriados, aviso no calendário) lista as PMs
-- que caem num feriado do hospital. Algumas estão certas de propósito: o cliente pediu
-- aquele dia, ou vai outro engenheiro que não está de feriado. Confirmá-las tira-as da
-- lista e deixa registado porquê, por quem e quando.
--
-- A confirmação é por (PM, dia de feriado) e não só por PM: se depois aparecer outro
-- feriado na mesma PM (BOE, fiestas locales), esse dia volta a aparecer na revisão. Mover a
-- PM para outras datas deixa a confirmação antiga sem efeito, sem ser preciso apagá-la.

create table if not exists pm_holiday_confirmations (
  id                uuid primary key default gen_random_uuid(),
  pm_event_id       uuid not null references pm_events(id) on delete cascade,
  holiday_date      date not null,
  reason            text not null check (reason in ('client_request', 'other_engineer', 'other')),
  notes             text,
  confirmed_by      uuid references auth.users(id) default auth.uid(),
  -- Nome guardado na hora: user_profiles não tem FK a partir daqui para o PostgREST juntar,
  -- e quem confirmou deve continuar a aparecer mesmo que o utilizador seja apagado.
  confirmed_by_name text,
  confirmed_at      timestamptz not null default now(),
  unique (pm_event_id, holiday_date),
  -- "Outro motivo" sem explicação não diz nada a quem vier depois.
  constraint pm_holiday_confirmations_other_needs_notes
    check (reason <> 'other' or coalesce(trim(notes), '') <> '')
);

comment on table pm_holiday_confirmations is
  'PMs confirmadas de propósito num dia de feriado do hospital (pedido do cliente, outro engenheiro…). Tira-as da revisão "PMs marcadas em feriados".';

create index if not exists pm_holiday_confirmations_pm_event_id_idx on pm_holiday_confirmations (pm_event_id);

alter table pm_holiday_confirmations enable row level security;

-- Leitura: quem vê as PMs. A subconsulta corre com a RLS de pm_events do próprio utilizador.
drop policy if exists pm_holiday_confirmations_select on pm_holiday_confirmations;
create policy pm_holiday_confirmations_select on pm_holiday_confirmations for select to authenticated
  using (exists (select 1 from pm_events e where e.id = pm_holiday_confirmations.pm_event_id));

-- Escrita: quem pode editar PMs (admin e planner — canEditPM em lib/permissions.ts).
drop policy if exists pm_holiday_confirmations_insert on pm_holiday_confirmations;
create policy pm_holiday_confirmations_insert on pm_holiday_confirmations for insert to authenticated
  with check (user_role() in ('admin', 'planner'));

drop policy if exists pm_holiday_confirmations_update on pm_holiday_confirmations;
create policy pm_holiday_confirmations_update on pm_holiday_confirmations for update to authenticated
  using (user_role() in ('admin', 'planner'))
  with check (user_role() in ('admin', 'planner'));

drop policy if exists pm_holiday_confirmations_delete on pm_holiday_confirmations;
create policy pm_holiday_confirmations_delete on pm_holiday_confirmations for delete to authenticated
  using (user_role() in ('admin', 'planner'));

notify pgrst, 'reload schema';
