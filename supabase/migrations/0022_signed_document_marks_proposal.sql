-- PMPlan — O documento assinado que chega do cliente fecha a proposta sozinho.
--
-- Até aqui o PDF assinado entrava pelo webhook (inbound-signed-document) e ficava
-- arquivado na ficha do hospital, mas a proposta continuava em 'letter_sent' até alguém
-- carregar em "Marcar como assinado" na página de Aprovações. Era a mesma informação em
-- dois sítios, com um deles dependente de alguém se lembrar de a copiar.
--
-- Passa a ser a própria BD a fazer a ligação, com dois triggers em signed_documents:
--
--   1. BEFORE — resolve a proposta quando o documento só sabe o hospital. O webhook só
--      preenche proposal_id quando o assunto traz o código [PM-/BT-...]; quando o hospital
--      foi reconhecido pelo nome no assunto, pelo remetente ou por associação manual na
--      app, a proposta fica por saber. Se o hospital tiver exactamente UMA proposta à espera
--      de assinatura, é essa. Com duas (via geral e braquiterapia ao mesmo tempo) não se
--      adivinha: o documento fica só no hospital e a proposta marca-se à mão.
--
--   2. AFTER — com proposal_id conhecido, passa a proposta de 'letter_sent' a 'signed'.
--
-- Porquê na BD e não na Edge Function: há dois caminhos por onde um documento ganha dono
-- (o webhook e a associação manual na página de Hospitais) e a regra tem de valer nos
-- dois. Um trigger cobre ambos e qualquer outro que venha a existir.
--
-- Salvaguarda comum aos dois: o documento só conta para uma carta enviada ANTES de ele
-- chegar. Uma carta reenviada (datas alteradas) volta a 'letter_sent' com letter_sent_at
-- novo, e a assinatura que entrou antes disso refere-se ao plano antigo — não pode fechar
-- a carta nova.

-- ─── 1. RESOLVER A PROPOSTA A PARTIR DO HOSPITAL ─────────────────────────────
create or replace function signed_document_resolve_proposal()
returns trigger language plpgsql set search_path = public as $$
declare
  v_ids uuid[];
begin
  if new.proposal_id is not null or new.hospital_id is null then
    return new;
  end if;

  select array_agg(p.id)
    into v_ids
    from client_proposals p
   where p.hospital_id = new.hospital_id
     and p.stage = 'letter_sent'
     and (p.letter_sent_at is null or p.letter_sent_at <= new.received_at);

  if coalesce(array_length(v_ids, 1), 0) = 1 then
    new.proposal_id := v_ids[1];
  end if;
  return new;
end;
$$;

drop trigger if exists signed_documents_resolve_proposal on signed_documents;
create trigger signed_documents_resolve_proposal
  before insert or update of hospital_id, proposal_id on signed_documents
  for each row execute function signed_document_resolve_proposal();

-- ─── 2. MARCAR A PROPOSTA COMO ASSINADA ──────────────────────────────────────
-- security definer: a associação manual é feita por um planner, cuja RLS em
-- client_proposals pode não deixar mexer no stage por esta via; a regra é da BD, não de
-- quem calhou disparar o trigger. signed_by fica null — ninguém marcou à mão, foi o
-- documento que chegou (e é isso que a UI mostra).
create or replace function signed_document_mark_proposal_signed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.proposal_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.proposal_id is not distinct from new.proposal_id then
    return null;
  end if;

  update client_proposals
     set stage = 'signed',
         signed_at = new.received_at,
         signed_by = null,
         updated_at = now()
   where id = new.proposal_id
     and stage = 'letter_sent'
     and (letter_sent_at is null or letter_sent_at <= new.received_at);
  return null;
end;
$$;

drop trigger if exists signed_documents_mark_proposal_signed on signed_documents;
create trigger signed_documents_mark_proposal_signed
  after insert or update of proposal_id on signed_documents
  for each row execute function signed_document_mark_proposal_signed();

-- ─── BACKFILL ────────────────────────────────────────────────────────────────
-- Documentos que já chegaram antes desta migração: primeiro resolve-se a proposta dos
-- que só tinham hospital (o update dispara o trigger BEFORE), depois fecham-se as
-- propostas que continuam em 'letter_sent' com um documento posterior à carta.
update signed_documents
   set hospital_id = hospital_id
 where proposal_id is null
   and hospital_id is not null;

update client_proposals p
   set stage = 'signed',
       signed_at = d.received_at,
       signed_by = null,
       updated_at = now()
  from (
    select distinct on (proposal_id) proposal_id, received_at
      from signed_documents
     where proposal_id is not null
     order by proposal_id, received_at desc
  ) d
 where p.id = d.proposal_id
   and p.stage = 'letter_sent'
   and (p.letter_sent_at is null or p.letter_sent_at <= d.received_at);

-- ─── REALTIME ────────────────────────────────────────────────────────────────
-- A página de Aprovações subscreve signed_documents para o estado passar a "Assinado"
-- no ecrã de quem está a olhar, sem refrescar. Condicional: add table numa tabela que já
-- está na publicação dá erro.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'signed_documents'
     ) then
    alter publication supabase_realtime add table signed_documents;
  end if;
end $$;
