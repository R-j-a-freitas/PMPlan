-- PMPlan — Aprovação e Envio de Propostas a Clientes (secção: workflow TL → engenheiro →
-- cliente → carta de assinatura). Tabelas aditivas — não tocam em pm_events.status, que
-- continua a descrever o estado operacional da PM (planned/confirmed/.../completed), não
-- o estado de aprovação/envio (ver client_proposals.stage abaixo).

-- ─── PROPOSTAS DE CALENDARIZAÇÃO POR CLIENTE ─────────────────────────────────
-- Uma proposta agrupa todas as PMs de um hospital num determinado ano de planeamento —
-- é a unidade de aprovação/envio (não a PM individual): o TL aprova/envia o conjunto
-- todo de um hospital de uma vez, tal como nas cartas de referência (DOCS/).
create table client_proposals (
  id                  uuid primary key default gen_random_uuid(),
  hospital_id         uuid not null references hospitals(id),
  year                int not null,
  stage               text not null default 'draft'
    check (stage in (
      'draft', 'pending_engineer', 'engineer_approved',
      'pending_client', 'client_approved', 'letter_sent', 'signed', 'rejected'
    )),
  engineer_approved_at timestamptz,
  engineer_approved_by uuid references auth.users(id),
  client_approved_at   timestamptz,
  client_approved_by   uuid references auth.users(id),  -- quem registou a aceitação do cliente (TL)
  letter_sent_at        timestamptz,
  letter_sent_to         text[],          -- emails a quem a carta foi enviada
  signed_at              timestamptz,
  signed_by               uuid references auth.users(id),  -- quem marcou como assinada
  rejected_reason        text,
  notes                  text,
  created_by             uuid references auth.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (hospital_id, year)
);

-- PMs incluídas numa proposta — junction explícita (em vez de inferir por hospital+ano)
-- para permitir incluir/excluir PMs específicas de um envio sem mexer no calendário.
create table client_proposal_events (
  proposal_id  uuid not null references client_proposals(id) on delete cascade,
  pm_event_id  uuid not null references pm_events(id) on delete cascade,
  primary key (proposal_id, pm_event_id)
);

-- ─── TEMPLATES DE EMAIL (editáveis na página) ────────────────────────────────
-- Placeholders substituídos no envio: {{ano}}, {{hospital}}, {{engenheiro}}, {{tabela}}
-- (tabela HTML gerada automaticamente, agrupada por equipamento).
create table email_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique
    check (key in ('engineer_approval', 'client_proposal', 'signature_letter')),
  subject     text not null,
  body        text not null,
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

insert into email_templates (key, subject, body) values
  (
    'engineer_approval',
    'Aprovação de calendarização de PMs — {{ano}}',
    E'Olá {{engenheiro}},\n\nSegue a proposta de calendarização das manutenções preventivas para validares.\n\n{{tabela}}\n\nPor favor confirma se as datas estão correctas, para podermos avançar com a proposta ao cliente.\n\nCumprimentos'
  ),
  (
    'client_proposal',
    'Planeamento de Manutenções Preventivas {{ano}}',
    E'Exmos. Senhores,\n\nSegue o planeamento previsto das manutenções preventivas para os equipamentos instalados nas vossas instalações.\n\n{{tabela}}\n\nCumprimentos'
  ),
  (
    'signature_letter',
    'Confirmação de calendarização — Manutenções Preventivas {{ano}} — {{hospital}}',
    E'Exmos. Senhores,\n\nSegue em anexo a carta com a calendarização aprovada das manutenções preventivas para {{ano}}. Agradecemos a devolução de uma cópia assinada conforme indicado na carta.\n\nCumprimentos'
  );

-- ─── REGISTO DE ENVIOS (auditoria) ───────────────────────────────────────────
create table email_log (
  id               uuid primary key default gen_random_uuid(),
  proposal_id      uuid references client_proposals(id) on delete set null,
  template_key     text,
  recipient_emails text[] not null,
  subject          text not null,
  sent_by          uuid references auth.users(id),
  sent_at          timestamptz not null default now(),
  graph_message_id text
);

-- Sem trigger automático para updated_at (mesma convenção de pm_events) — o store
-- define-o explicitamente em cada update.

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Aprovar/enviar é uma acção exclusiva do admin (secção: "os admin" decidiram quem
-- aprova/envia) — leitura alargada a planner/readonly para visibilidade do estado.
alter table client_proposals        enable row level security;
alter table client_proposal_events  enable row level security;
alter table email_templates         enable row level security;
alter table email_log               enable row level security;

create policy "client_proposals_select" on client_proposals for select to authenticated using (
  user_role() in ('admin', 'planner', 'readonly')
);
create policy "client_proposals_admin_insert" on client_proposals for insert to authenticated
  with check (user_role() = 'admin');
create policy "client_proposals_admin_update" on client_proposals for update to authenticated
  using (user_role() = 'admin') with check (user_role() = 'admin');
create policy "client_proposals_admin_delete" on client_proposals for delete to authenticated
  using (user_role() = 'admin');

create policy "client_proposal_events_select" on client_proposal_events for select to authenticated using (
  user_role() in ('admin', 'planner', 'readonly')
);
create policy "client_proposal_events_admin_insert" on client_proposal_events for insert to authenticated
  with check (user_role() = 'admin');
create policy "client_proposal_events_admin_delete" on client_proposal_events for delete to authenticated
  using (user_role() = 'admin');

create policy "email_templates_select" on email_templates for select to authenticated using (true);
create policy "email_templates_admin_update" on email_templates for update to authenticated
  using (user_role() = 'admin') with check (user_role() = 'admin');

create policy "email_log_select" on email_log for select to authenticated using (
  user_role() in ('admin', 'planner', 'readonly')
);
create policy "email_log_admin_insert" on email_log for insert to authenticated
  with check (user_role() = 'admin');
