-- PMPlan — Cada documento assinado é associado à SUA via, pelo próprio ficheiro.
--
-- A 0022 resolvia a proposta pelo email: o código [PM-/BT-...] no assunto, ou, sem ele, a
-- única proposta do hospital em 'letter_sent'. Deixava dois casos por resolver quando o
-- hospital tem as duas vias ao mesmo tempo (geral e braquiterapia):
--
--   a) o cliente escreve um email novo, sem código no assunto → duas propostas candidatas,
--      o documento ficava só no hospital e marcava-se à mão;
--   b) o cliente responde a UMA das cartas com os DOIS PDFs assinados → o código do assunto
--      mandava os dois documentos para a mesma proposta, e a outra via ficava por fechar.
--
-- A resposta está no ficheiro, não no email. Os PDFs que enviamos têm nomes diferentes
-- por via ("Plano_Manutencao_Braquiterapia_..." vs "Plano_Manutencao_...") e, a partir
-- desta versão, levam o código da proposta no nome ("..._BT-1A2B3C4D.pdf" — ver
-- sendSignatureLetter em pages/Approvals.tsx). Quem devolve o mesmo ficheiro assinado
-- devolve também o código. Por isso a decisão passa a ser tomada documento a documento,
-- por ordem de certeza:
--
--   1. código no nome do ficheiro              → essa proposta (inequívoco)
--   2. via pelo nome do ficheiro               → a proposta dessa via do mesmo hospital
--   3. via pelo assunto (só sem proposta ainda) → idem
--   4. nada disso                              → a regra da 0022 (única carta à espera)
--
-- Os indícios de braquiterapia são os mesmos de BRACHYTHERAPY_HINTS em
-- src/lib/approvalTrack.ts e do seed da 0017 — ao acrescentar um modelo, nos três sítios.

-- ─── INDÍCIO DE VIA NUM TEXTO ────────────────────────────────────────────────
-- 'brachytherapy' se mencionar braquiterapia ou um afterloader; 'standard' se tiver o nome
-- da nossa carta sem nenhum desses indícios (o nome da carta geral não tem marca própria:
-- é a ausência do "Braquiterapia_"); null se não disser nada. `allow_standard` = false
-- para o assunto, onde a ausência de "braquiterapia" não prova nada.
create or replace function approval_track_hint(p_text text, p_allow_standard boolean)
returns text language sql immutable set search_path = public as $$
  with normalized as (
    select regexp_replace(
             lower(translate(coalesce(p_text, ''),
                             'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                             'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
             '[^a-z0-9]+', '_', 'g') as value
  )
  select case
           when value ~ '(braqui|brachy|flexitron|selectron)' then 'brachytherapy'
           when p_allow_standard and value ~ '(plano_manutencao|plan_mantenimiento)' then 'standard'
           else null
         end
    from normalized;
$$;

-- ─── RESOLUÇÃO DA PROPOSTA, DOCUMENTO A DOCUMENTO ────────────────────────────
create or replace function signed_document_resolve_proposal()
returns trigger language plpgsql set search_path = public as $$
declare
  v_code        text;
  v_coded       client_proposals%rowtype;
  v_hint        text;
  v_current     client_proposals%rowtype;
  v_ids         uuid[];
  v_switch_id   uuid;
begin
  -- 1. Código da proposta no nome do ficheiro. Só não se aplica se alguém associou o
  --    documento à mão a OUTRO hospital — aí manda quem olhou para ele.
  -- Grupo não-capturante: com um grupo normal, substring devolvia só "PM"/"BT".
  v_code := upper(substring(new.filename from '(?i)(?:PM|BT)-[0-9A-F]{8}'));
  if v_code is not null then
    select * into v_coded from client_proposals where reference_code = v_code;
    if found and (new.hospital_id is null or new.hospital_id = v_coded.hospital_id) then
      new.proposal_id := v_coded.id;
      if new.hospital_id is null or new.match_method in ('unmatched', 'subject_hospital', 'sender_email') then
        new.hospital_id := v_coded.hospital_id;
        new.match_method := 'reference_code';
        new.matched_at := coalesce(new.matched_at, now());
      end if;
      return new;
    end if;
  end if;

  if new.hospital_id is null then
    return new;
  end if;

  -- 2. Via pelo nome do ficheiro — vale também para corrigir a proposta vinda do código do
  --    ASSUNTO: um email de resposta à carta geral que traga as duas cartas assinadas.
  v_hint := approval_track_hint(new.filename, true);

  if new.proposal_id is not null then
    if v_hint is null then
      return new;
    end if;
    select * into v_current from client_proposals where id = new.proposal_id;
    if found and v_current.approval_track <> v_hint then
      select id into v_switch_id
        from client_proposals
       where hospital_id = v_current.hospital_id
         and year = v_current.year
         and approval_track = v_hint;
      if v_switch_id is not null then
        new.proposal_id := v_switch_id;
      end if;
    end if;
    return new;
  end if;

  -- 3. Sem proposta: o ficheiro não disse nada → tenta o assunto (só o indício positivo).
  if v_hint is null then
    v_hint := approval_track_hint(new.subject, false);
  end if;

  select array_agg(p.id)
    into v_ids
    from client_proposals p
   where p.hospital_id = new.hospital_id
     and p.stage = 'letter_sent'
     and (p.letter_sent_at is null or p.letter_sent_at <= new.received_at)
     -- Com indício, só a via indicada. Se essa via não está à espera de assinatura, NÃO se
     -- cai para a outra: o documento é dessa via, não da que sobrou.
     and (v_hint is null or p.approval_track = v_hint);

  -- 4. Um único candidato (com ou sem indício) → é esse.
  if coalesce(array_length(v_ids, 1), 0) = 1 then
    new.proposal_id := v_ids[1];
  end if;
  return new;
end;
$$;

-- O trigger da 0022 já chama esta função (before insert or update of hospital_id,
-- proposal_id); o create or replace acima basta. Recriado na mesma para esta migração se
-- aguentar sozinha.
drop trigger if exists signed_documents_resolve_proposal on signed_documents;
create trigger signed_documents_resolve_proposal
  before insert or update of hospital_id, proposal_id on signed_documents
  for each row execute function signed_document_resolve_proposal();

-- ─── REPROCESSAR O QUE JÁ CHEGOU ─────────────────────────────────────────────
-- Documentos que ficaram só no hospital, ou na proposta do assunto quando o ficheiro diz
-- outra via. O update passa pelos dois triggers: o BEFORE resolve, o AFTER (0022) fecha a
-- proposta se ela mudou e estava em 'letter_sent'.
update signed_documents
   set proposal_id = proposal_id
 where hospital_id is not null
    or filename ~* '(PM|BT)-[0-9A-F]{8}';
