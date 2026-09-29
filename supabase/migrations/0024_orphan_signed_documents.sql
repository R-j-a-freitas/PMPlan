-- PMPlan — Documentos assinados órfãos: candidatos sugeridos e associação manual respeitada.
--
-- Um documento fica órfão (hospital_id null) quando nenhuma regra automática o reconhece:
-- sem código no assunto nem no ficheiro, sem nome de hospital no assunto, e remetente
-- desconhecido — ou conhecido de MAIS do que um hospital. Este último caso era tratado
-- mal: a Edge Function ficava com o primeiro hospital que calhasse e arquivava lá o
-- documento, com a etiqueta "Remetente", sem sinal nenhum de que havia outros candidatos.
-- Um grupo hospitalar com uma caixa partilhada mandava a carta de um hospital para outro.
--
-- Passa a ficar órfão, com os hospitais candidatos guardados aqui, para a página
-- "Documentos por associar" os pôr no topo da lista — quem associa escolhe entre dois ou
-- três em vez de entre cem.

alter table signed_documents
  add column if not exists candidate_hospital_ids uuid[] not null default '{}';

comment on column signed_documents.candidate_hospital_ids is
  'Hospitais que a Edge Function considerou possíveis sem conseguir escolher (ex.: o email do remetente é contacto de vários). Só uma sugestão para a associação manual — nunca usada para associar sozinha.';

-- ─── A ASSOCIAÇÃO MANUAL MANDA ───────────────────────────────────────────────
-- Mesma função da 0023, com uma guarda à cabeça: quando alguém escolhe à mão o hospital
-- E a proposta (via), o trigger não os reinterpreta. Sem isto, o indício do nome do
-- ficheiro podia trocar a via que a pessoa acabou de escolher — por exemplo, um PDF
-- chamado "Braquiterapia" que o cliente usou para devolver a carta geral.
-- Com hospital manual mas proposta por escolher, a resolução automática continua a
-- correr: é útil (escolhe a via pelo ficheiro) e não contraria ninguém.
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
  if new.match_method = 'manual' and new.proposal_id is not null then
    return new;
  end if;

  -- 1. Código da proposta no nome do ficheiro. Não se aplica se alguém associou o
  --    documento à mão a OUTRO hospital — aí manda quem olhou para ele.
  --    Grupo não-capturante: com um grupo normal, substring devolvia só "PM"/"BT".
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

  -- 2. Via pelo nome do ficheiro — corrige também a proposta vinda do código do ASSUNTO.
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
     and (v_hint is null or p.approval_track = v_hint);

  -- 4. Um único candidato (com ou sem indício) → é esse.
  if coalesce(array_length(v_ids, 1), 0) = 1 then
    new.proposal_id := v_ids[1];
  end if;
  return new;
end;
$$;
