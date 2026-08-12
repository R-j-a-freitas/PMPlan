-- PMPlan — Via de aprovação independente para Braquiterapia.
--
-- Até aqui uma proposta era `unique (hospital_id, year)`: todas as PMs de um hospital
-- num ano viajavam juntas — uma validação do engenheiro, uma aprovação do cliente, uma
-- carta, uma assinatura. Isso deixa de servir para a Braquiterapia: são equipamentos com
-- engenheiros, interlocutores e tempos próprios, e o cliente valida-os à parte. Um
-- acelerador cuja data ainda está por confirmar não pode segurar a carta da braquiterapia,
-- nem a assinatura de uma valer pela outra.
--
-- Desenho: a proposta passa a ter uma **via** (`approval_track`) e a chave única passa a
-- ser (hospital_id, year, approval_track). Um hospital com LINAC e Braquiterapia tem a
-- partir de agora duas propostas por ano, cada uma com o seu estado, os seus emails, a sua
-- carta e a sua assinatura — o resto da máquina de estados (stage) fica exactamente igual,
-- é a mesma sequência corrida duas vezes em paralelo.
--
-- Porquê uma via na modalidade e não um `if modality = 'Braquiterapia'` no código: as
-- modalidades são geridas na app desde a migração 0008 (podem ser renomeadas, e são texto
-- livre em equipment.modality). Um nome hardcoded partia-se no dia em que alguém
-- escrevesse "Braquiterapia HDR". A via é uma propriedade da modalidade, editável no mesmo
-- sítio onde ela já se gere.

-- ─── VIA DE APROVAÇÃO POR MODALIDADE ─────────────────────────────────────────
alter table modalities
  add column if not exists approval_track text not null default 'standard'
    check (approval_track in ('standard', 'brachytherapy'));

comment on column modalities.approval_track is
  'Via de aprovação a que os equipamentos desta modalidade pertencem. ''brachytherapy'' faz com que sejam propostos, aprovados e assinados à parte do resto do hospital (ver client_proposals.approval_track).';

-- Seed: tudo o que já existe e é braquiterapia passa para a via própria.
--
-- Os dois primeiros LIKE cobrem as variantes escritas à mão ("Braquiterapia HDR",
-- "Brachytherapy"). Não chegam: as modalidades em uso chamam-se pelo modelo do afterloader
-- — "Flexitron", "Flexitron+OB+Prostate", "mSelectron" — e nenhuma tem "braqui" no nome.
-- Um seed só com as palavras genéricas marcava zero linhas e a via de braquiterapia nascia
-- vazia, com tudo a continuar a ir na carta geral sem nenhum sinal de que algo faltava.
-- '%selectron%' cobre mSelectron/microSelectron/Selectron.
--
-- Esta lista é a mesma de BRACHYTHERAPY_HINTS em src/lib/approvalTrack.ts, que resolve a
-- via de equipamento cuja modalidade não existe na tabela. Ao acrescentar um modelo novo,
-- acrescentar nos dois sítios.
update modalities
   set approval_track = 'brachytherapy'
 where lower(name) like '%braqui%'
    or lower(name) like '%brachy%'
    or lower(name) like '%flexitron%'
    or lower(name) like '%selectron%';

-- ─── VIA DE APROVAÇÃO NA PROPOSTA ────────────────────────────────────────────
alter table client_proposals
  add column if not exists approval_track text not null default 'standard'
    check (approval_track in ('standard', 'brachytherapy'));

comment on column client_proposals.approval_track is
  'Via desta proposta. ''standard'' agrupa todos os equipamentos do hospital excepto os de modalidades marcadas como braquiterapia; ''brachytherapy'' agrupa esses. Vias independentes: estado, emails, carta e assinatura próprios.';

-- As propostas que já existiam continuam a ser a via geral (default 'standard' acima) —
-- nenhuma perde estado nem histórico. O que muda é que deixam de arrastar consigo a
-- braquiterapia do mesmo hospital, que a partir daqui abre uma proposta nova em 'draft'.
--
-- A unique antiga é encontrada no catálogo pelas colunas que cobre, e não pelo nome que se
-- presume que o Postgres lhe deu. Um `drop constraint if exists <nome errado>` não falharia
-- — passaria em silêncio e deixaria (hospital_id, year) único, o que impediria a segunda
-- proposta de existir. O erro apareceria só no primeiro envio de braquiterapia, como uma
-- violação de chave que ninguém iria ligar a esta migração.
do $$
declare
  v_constraint text;
  v_target smallint[];
begin
  select array_agg(att.attnum order by att.attnum)
    into v_target
    from pg_attribute att
   where att.attrelid = 'public.client_proposals'::regclass
     and att.attname in ('hospital_id', 'year');

  for v_constraint in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.client_proposals'::regclass
       and con.contype = 'u'
       and (select array_agg(k order by k) from unnest(con.conkey) as k) = v_target
  loop
    execute format('alter table client_proposals drop constraint %I', v_constraint);
  end loop;
end $$;

alter table client_proposals
  drop constraint if exists client_proposals_hospital_year_track_key;

alter table client_proposals
  add constraint client_proposals_hospital_year_track_key unique (hospital_id, year, approval_track);

-- ─── CÓDIGO DE REFERÊNCIA POR VIA ────────────────────────────────────────────
-- O código no assunto da carta ganha um prefixo por via: 'PM-' na geral, 'BT-' na
-- braquiterapia. Não é cosmético — com duas cartas por hospital no mesmo ano, é o que
-- permite ver de relance, no assunto de uma resposta, qual das duas o cliente assinou
-- (e é por ele que a Edge Function inbound-signed-document arquiva o documento na
-- proposta certa, não só no hospital certo).
--
-- A coluna mantém o default 'PM-...' de 0015; o trigger só troca o prefixo quando a linha
-- é de braquiterapia. Assim os 8 hex continuam a vir de gen_random_uuid() num sítio só, e
-- a unicidade global do código não depende do prefixo.
-- `set search_path = public` pela mesma razão das outras funções do projecto (0005, 0008):
-- não deixar o corpo depender do search_path de quem dispara o trigger. Não precisa de
-- security definer — só mexe na linha que está a ser inserida.
create or replace function set_proposal_reference_prefix()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.reference_code is null or length(trim(new.reference_code)) = 0 then
    new.reference_code := 'PM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  if new.approval_track = 'brachytherapy' and new.reference_code like 'PM-%' then
    new.reference_code := 'BT-' || substr(new.reference_code, 4);
  end if;
  return new;
end;
$$;

drop trigger if exists client_proposals_reference_prefix on client_proposals;
create trigger client_proposals_reference_prefix
  before insert on client_proposals
  for each row execute function set_proposal_reference_prefix();

-- ─── TEMPLATES DE EMAIL DA VIA DE BRAQUITERAPIA ──────────────────────────────
-- Templates próprios em vez de reaproveitar os existentes: o texto que se manda a um
-- serviço de braquiterapia não é o mesmo que se manda para os aceleradores, e ter os dois
-- na mesma linha significaria que editar um mudava o outro sem ninguém dar por isso.
-- Mesma cautela da unique acima: a check da coluna `key` foi criada em linha na 0002 e o
-- nome é atribuído pelo Postgres. Aqui, ao contrário da unique, deixá-la para trás falharia
-- com estrondo (os inserts dos templates novos seriam recusados) — mas falhar a meio de uma
-- migração é pior do que não a deixar sequer começar.
do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.email_templates'::regclass
       and con.contype = 'c'
       and con.conkey = array[(
         select att.attnum
           from pg_attribute att
          where att.attrelid = 'public.email_templates'::regclass
            and att.attname = 'key'
       )]
  loop
    execute format('alter table email_templates drop constraint %I', v_constraint);
  end loop;
end $$;

alter table email_templates
  drop constraint if exists email_templates_key_check;

alter table email_templates
  add constraint email_templates_key_check check (key in (
    'engineer_approval', 'client_proposal', 'signature_letter',
    'brachy_engineer_approval', 'brachy_client_proposal', 'brachy_signature_letter'
  ));

insert into email_templates (key, country, subject, body) values
  (
    'brachy_engineer_approval',
    'PT',
    'Aprovação de calendarização de PMs de Braquiterapia — {{ano}}',
    E'Olá {{engenheiro}},\n\nSegue a proposta de calendarização das manutenções preventivas dos equipamentos de Braquiterapia para validares.\n\n{{tabela}}\n\nPor favor confirma se as datas estão correctas, para podermos avançar com a proposta ao cliente.\n\nCumprimentos'
  ),
  (
    'brachy_engineer_approval',
    'ES',
    'Aprobación de calendario de PMs de Braquiterapia — {{ano}}',
    E'Hola {{engenheiro}},\n\nAdjuntamos la propuesta de calendario de los mantenimientos preventivos de los equipos de Braquiterapia para validar.\n\n{{tabela}}\n\nPor favor confirma si las fechas son correctas, para poder avanzar con la propuesta al cliente.\n\nSaludos'
  ),
  (
    'brachy_client_proposal',
    'PT',
    'Planeamento de Manutenções Preventivas de Braquiterapia {{ano}}',
    E'Exmos. Senhores,\n\nSegue o planeamento previsto das manutenções preventivas para os equipamentos de Braquiterapia instalados nas vossas instalações.\n\n{{tabela}}\n\nCumprimentos'
  ),
  (
    'brachy_client_proposal',
    'ES',
    'Plan de Mantenimiento Preventivo de Braquiterapia {{ano}}',
    E'Muy Sres nuestros,\n\nLes informamos del plan previsto de los Mantenimientos Preventivos para los equipos de Braquiterapia instalados en sus instalaciones.\n\n{{tabela}}\n\nAprovechamos la ocasión para saludarles atentamente'
  ),
  (
    'brachy_signature_letter',
    'PT',
    'Confirmação de calendarização — Manutenções Preventivas de Braquiterapia {{ano}} — {{hospital}}',
    E'Exmos. Senhores,\n\nSegue em anexo a carta com a calendarização aprovada das manutenções preventivas dos equipamentos de Braquiterapia para {{ano}}. Agradecemos a devolução de uma cópia assinada conforme indicado na carta.\n\nCumprimentos'
  ),
  (
    'brachy_signature_letter',
    'ES',
    'Confirmación de calendario — Mantenimiento Preventivo de Braquiterapia {{ano}} — {{hospital}}',
    E'Muy Sres nuestros,\n\nAdjuntamos la carta con el calendario aprobado de los Mantenimientos Preventivos de los equipos de Braquiterapia para {{ano}}. Les agradeceríamos nos devolvieran una copia firmada según se indica en la carta.\n\nSaludos'
  )
on conflict (key, country) do nothing;
