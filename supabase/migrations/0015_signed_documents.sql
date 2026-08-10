-- Arquivo dos documentos assinados devolvidos pelos clientes.
--
-- Fluxo: a carta de assinatura sai com a caixa de documentos em CC e em Reply-To; o
-- cliente responde com o PDF assinado em anexo; a Resend entrega esse email ao webhook
-- (Edge Function inbound-signed-document), que guarda o anexo no Storage e cria aqui a
-- linha correspondente. Os documentos aparecem depois na ficha do hospital.
--
-- Duas decisões que atravessam o resto do desenho:
--
-- 1. hospital_id é NULLABLE. Um documento que chega e não é reconhecido tem de ser
--    guardado à mesma e ficar visível para associação manual — perder o PDF assinado de
--    um cliente porque o assunto do email não bateu certo seria muito pior do que ter uma
--    caixa de "por associar" para alguém arrumar.
--
-- 2. A identificação primária é um código de referência no assunto, não o In-Reply-To.
--    A Resend devolve no envio um id próprio (uuid), que não é o Message-ID RFC que o
--    cliente devolve no In-Reply-To — cruzar os dois não é fiável. O assunto, esse,
--    sobrevive ao "Re:" de qualquer cliente de email. Ver reference_code abaixo.

-- ─── CÓDIGO DE REFERÊNCIA DA PROPOSTA ────────────────────────────────────────
-- Vai entre parêntesis rectos no assunto da carta ("... [PM-3F2A9C1B]") e é o que permite
-- reconhecer a resposta do cliente sem depender do nome do hospital vir escrito na mesma
-- forma. Gerado na criação da proposta, estável para sempre a partir daí.
--
-- Os 8 hex saem de gen_random_uuid() (nativo no Postgres) e não de gen_random_bytes(),
-- que precisaria da pgcrypto — no Supabase ela vive no schema `extensions` e não está no
-- search_path, por isso seria uma dependência a mais por nada.
alter table client_proposals
  add column if not exists reference_code text unique;

update client_proposals
   set reference_code = 'PM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
 where reference_code is null;

alter table client_proposals
  alter column reference_code set default 'PM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

alter table client_proposals
  alter column reference_code set not null;

comment on column client_proposals.reference_code is
  'Código no assunto da carta de assinatura ("[PM-XXXXXXXX]"). É por ele que a resposta do cliente é associada ao hospital certo (ver Edge Function inbound-signed-document).';

-- ─── DOCUMENTOS ASSINADOS ────────────────────────────────────────────────────
create table if not exists signed_documents (
  id                uuid primary key default gen_random_uuid(),

  -- Null enquanto não se souber a que hospital pertence (ver nota 1 no topo).
  hospital_id       uuid references hospitals(id) on delete set null,
  proposal_id       uuid references client_proposals(id) on delete set null,

  -- Ficheiro no bucket 'signed-documents'. O caminho inclui o id do email de origem para
  -- dois anexos com o mesmo nome, vindos de emails diferentes, não colidirem.
  storage_path      text not null unique,
  filename          text not null,
  content_type      text,
  size_bytes        bigint,

  -- Proveniência: de que email veio, de quem, com que assunto. Guardado mesmo quando o
  -- documento fica por associar — é o que permite perceber depois de onde veio.
  inbound_email_id  text not null,
  inbound_message_id text,
  from_email        text,
  from_name         text,
  subject           text,
  received_at       timestamptz not null default now(),

  -- Como é que se chegou ao hospital. Fica no registo porque a fiabilidade não é a mesma:
  -- 'reference_code' é inequívoco, 'sender_email' é um palpite informado que vale a pena
  -- alguém confirmar.
  match_method      text not null default 'unmatched'
    check (match_method in ('reference_code', 'subject_hospital', 'sender_email', 'manual', 'unmatched')),
  matched_at        timestamptz,
  matched_by        uuid references auth.users(id),

  notes             text,
  created_at        timestamptz not null default now(),

  -- O mesmo anexo do mesmo email nunca entra duas vezes: a Resend reenvia o webhook se a
  -- resposta demorar ou falhar, e sem isto uma reentrega criava documentos duplicados.
  unique (inbound_email_id, filename)
);

create index if not exists signed_documents_hospital_id_idx on signed_documents (hospital_id);
create index if not exists signed_documents_proposal_id_idx on signed_documents (proposal_id);
-- Índice parcial para a fila de "por associar", que é a vista que se consulta com pressa.
create index if not exists signed_documents_unmatched_idx
  on signed_documents (received_at desc)
  where hospital_id is null;

-- ─── STORAGE ─────────────────────────────────────────────────────────────────
-- Bucket privado: são documentos contratuais assinados de clientes, nunca servidos por
-- URL pública. O frontend acede-lhes por signed URL de curta duração.
insert into storage.buckets (id, name, public)
values ('signed-documents', 'signed-documents', false)
on conflict (id) do nothing;

-- Leitura para quem já vê propostas (admin/planner/readonly); escrita só pela Edge
-- Function, que usa a service_role e por isso salta a RLS — não há policy de insert para
-- utilizadores, de propósito: documentos assinados entram por email, não por upload manual.
drop policy if exists "signed_documents_storage_read" on storage.objects;
create policy "signed_documents_storage_read" on storage.objects for select to authenticated
  using (bucket_id = 'signed-documents' and public.user_role() in ('admin', 'planner', 'readonly'));

drop policy if exists "signed_documents_storage_admin_delete" on storage.objects;
create policy "signed_documents_storage_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'signed-documents' and public.user_role() = 'admin');

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table signed_documents enable row level security;

-- Mesma audiência de client_proposals: quem acompanha o workflow vê os documentos.
create policy "signed_documents_select" on signed_documents for select to authenticated using (
  user_role() in ('admin', 'planner', 'readonly')
);

-- Update serve para associar manualmente um documento a um hospital (admin/planner) —
-- não para reescrever a proveniência, que é histórico do que chegou.
create policy "signed_documents_update" on signed_documents for update to authenticated
  using (user_role() in ('admin', 'planner')) with check (user_role() in ('admin', 'planner'));

create policy "signed_documents_admin_delete" on signed_documents for delete to authenticated
  using (user_role() = 'admin');

-- Sem policy de insert: as linhas são criadas pela Edge Function com a service_role.
