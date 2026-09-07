-- PMPlan — Contactos do cliente em tabela própria (deixam de viver em hospitals.contacts).
--
-- Até aqui um contacto era um objecto dentro do jsonb `hospitals.contacts`, com quatro
-- campos: {name, email, phone, role}. Isso chegou enquanto os contactos eram meia dúzia
-- escritos à mão na app. Deixa de chegar agora que entra a lista real do cliente
-- (DOCS/XLS/Contactos_ES.xlsx: 114 hospitais, ~160 linhas), por quatro razões:
--
--   1. NÃO HÁ ONDE GUARDAR A VIA. A lista do cliente tem duas linhas por hospital, uma
--      para LINACS e outra para BRAQUI, e em 13 hospitais são pessoas diferentes
--      (Castellón: Agustín Santos/Carlos Ferrer nos aceleradores, Xavier Juan na
--      braquiterapia; Valladolid: o mesmo físico com email diferente em cada via; Ruber,
--      Canarias, ICO, Jaén, IOCLM…). A app já separa as duas vias desde a migração 0017 —
--      propostas, cartas e assinaturas independentes — mas pages/Approvals.tsx monta os
--      destinatários com TODOS os contactos do hospital, porque não tem por onde
--      distinguir. Resultado actual: a carta da braquiterapia vai para o físico dos
--      aceleradores e vice-versa. É esta coluna (`approval_track`) que corrige isso.
--   2. FALTAM CAMPOS. Móvel e fax não existem no jsonb (o ficheiro traz 27 faxes) e do
--      lado do hospital faltam código postal, o nome que vai na carta e o ID Elekta.
--   3. O CONTACTO NÃO TEM IDENTIDADE. pages/Contacts.tsx identifica cada contacto pelo
--      ÍNDICE no array para editar e apagar, e cada gravação reescreve o array inteiro.
--      Com um contacto por hospital passa despercebido; com dois utilizadores a mexer no
--      mesmo hospital, o segundo a gravar apaga a edição do primeiro. Uma linha com id
--      próprio acaba com as duas fragilidades.
--   4. NÃO SE PODE FILTRAR EM SQL. A página de contactos carrega todos os hospitais e
--      achata o jsonb em memória; filtrar por via ou por activo/inactivo obrigaria sempre
--      a trazer tudo para o browser.
--
-- Esta migração é só a base de dados: cria a tabela, acrescenta as colunas do hospital e
-- copia o que já existe no jsonb. NÃO importa a lista do cliente — isso fica para depois
-- das PMs estarem carregadas, a partir do ficheiro preparado em
-- DOCS/XLS/contactos-importacao-ES.xlsx. A coluna `hospitals.contacts` mantém-se
-- intacta e é ela que o frontend continua a ler até ser adaptado; só depois disso é que
-- se apaga, numa migração seguinte.

-- ─── COLUNAS NOVAS DO HOSPITAL ───────────────────────────────────────────────
-- Três campos que vêm da lista do cliente e não têm sítio no esquema actual. Todos
-- nullable: nenhum hospital já registado fica inválido por não os ter.
alter table hospitals
  add column if not exists postal_code text,
  add column if not exists letter_name text,
  add column if not exists elekta_id   text;

comment on column hospitals.postal_code is
  'Código postal da morada (ex: "28040"). Vem da lista de contactos do cliente.';
comment on column hospitals.letter_name is
  'Nome do hospital tal como deve aparecer na carta de calendarização ("Nombre carta" na lista do cliente, ex: "HOSPITAL UNIVERSITARIO 12 DE OCTUBRE"). Null = usa hospitals.name. Não confundir com short_name, que é o rótulo curto do calendário.';
comment on column hospitals.elekta_id is
  'ID do cliente no sistema da Elekta (ex: "11975"). Chave estável para cruzar ficheiros externos com a base de dados — os nomes escrevem-se de maneira diferente em cada lista ("Meixoeiro, Hospital do" vs "Hospital do Meixoeiro"), o ID não.';

-- Único mas permitindo vários nulos (comportamento normal do unique em Postgres): os 94
-- hospitais que já existem ficam todos com elekta_id null até alguém os preencher, e
-- nenhum deles colide com outro. O índice serve tanto a garantia de não haver dois
-- hospitais com o mesmo ID como a procura por ID na importação futura.
create unique index if not exists hospitals_elekta_id_key on hospitals (elekta_id);

-- ─── CONTACTOS ───────────────────────────────────────────────────────────────
create table if not exists hospital_contacts (
  id             uuid primary key default gen_random_uuid(),
  hospital_id    uuid not null references hospitals(id) on delete cascade,
  name           text not null,
  role           text,                     -- cargo/função (ex: "Radiofísica"); a lista do cliente não traz
  email          text,
  phone          text,
  mobile         text,
  fax            text,
  -- Via de aprovação a que este contacto responde — os mesmos dois valores de
  -- client_proposals.approval_track e modalities.approval_track (migração 0017).
  --
  -- NULL de propósito, e é o caso mais comum: significa "serve as duas vias". Só se
  -- preenche quando o hospital tem mesmo interlocutores diferentes para a braquiterapia e
  -- para o resto. Assim os hospitais com um único contacto ficam com uma linha e o
  -- comportamento de hoje (o contacto recebe tudo) mantém-se sem ninguém ter de decidir
  -- via nenhuma; e quem envia a proposta filtra por "track is null or track = <via>".
  approval_track text check (approval_track in ('standard', 'brachytherapy')),
  -- Contacto principal da via — o destinatário natural da carta quando há vários nomes
  -- no mesmo hospital. Não é exclusivo (não há constraint a impedir dois): é uma
  -- preferência de ordenação e de "para quem se escreve primeiro", não uma regra.
  is_primary     boolean not null default false,
  -- Mesma filosofia do toggle de email_recipients (0009): tirar alguém do loop de emails
  -- sem perder o registo nem o histórico de quem era o interlocutor.
  active         boolean not null default true,
  notes          text,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  -- Sem trigger automático (mesma convenção de pm_events e client_proposals) — é o store
  -- que escreve updated_at ao gravar.
  updated_at     timestamptz not null default now()
);

comment on table hospital_contacts is
  'Contactos do cliente (físicos, radiofísica, administrativos) usados como destinatários das propostas de calendarização e da carta de assinatura. Substitui o jsonb hospitals.contacts.';
comment on column hospital_contacts.approval_track is
  'Via de aprovação a que o contacto responde: ''standard'' (aceleradores e restante equipamento), ''brachytherapy'', ou NULL = serve as duas. Filtrar sempre com "approval_track is null or approval_track = <via>".';
comment on column hospital_contacts.is_primary is
  'Contacto principal do hospital nesta via — destinatário preferencial da carta. Sem exclusividade garantida.';
comment on column hospital_contacts.active is
  'Falso tira o contacto dos envios sem apagar o registo.';

-- Índice de leitura: a página de contactos e a de aprovações vão sempre buscar os
-- contactos por hospital.
create index if not exists hospital_contacts_hospital_id_idx on hospital_contacts (hospital_id);

-- Sem índice único sobre (hospital_id, email) DE PROPÓSITO: na lista do cliente há caixas
-- de correio partilhadas por várias pessoas do mesmo serviço
-- (radiofisica@hospitalprovincial.es está no contacto dos aceleradores e no da
-- braquiterapia; fisicos@hospitales.nisa.es cobre dois físicos). Um único obrigaria a
-- perder um dos nomes na importação.

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table hospital_contacts enable row level security;

-- A visibilidade acompanha a do hospital a que o contacto pertence (mesma condição de
-- hospitals_select, 0001): admin/planner/readonly vêem tudo, o engenheiro vê apenas os
-- hospitais das zonas que cobre. Sem isto, um engenheiro passaria a ver por esta tabela
-- os contactos de hospitais que não pode ver na tabela hospitals.
drop policy if exists "hospital_contacts_select" on hospital_contacts;
create policy "hospital_contacts_select" on hospital_contacts for select to authenticated
using (
  exists (
    select 1 from hospitals h
     where h.id = hospital_contacts.hospital_id
       and (
         user_role() in ('admin', 'planner', 'readonly')
         or (user_role() = 'engineer' and h.zone_id = any (user_zone_ids()))
       )
  )
);

-- Escrita reservada ao admin — exactamente quem já podia editar contactos quando eles
-- viviam dentro de hospitals (hospitals_admin_update, e canManageZones em
-- lib/permissions.ts). Se um dia se quiser que o planner também os mantenha — é ele quem
-- envia as propostas e apanha os emails que voltam —, muda-se para
-- user_role() in ('admin', 'planner') nas três políticas abaixo e o mesmo em permissions.ts.
drop policy if exists "hospital_contacts_insert" on hospital_contacts;
create policy "hospital_contacts_insert" on hospital_contacts for insert to authenticated
  with check (user_role() = 'admin');
drop policy if exists "hospital_contacts_update" on hospital_contacts;
create policy "hospital_contacts_update" on hospital_contacts for update to authenticated
  using (user_role() = 'admin') with check (user_role() = 'admin');
drop policy if exists "hospital_contacts_delete" on hospital_contacts;
create policy "hospital_contacts_delete" on hospital_contacts for delete to authenticated
  using (user_role() = 'admin');

-- ─── CÓPIA DO QUE JÁ EXISTE NO JSONB ─────────────────────────────────────────
-- São dois contactos em toda a base de dados neste momento, mas a cópia fica escrita para
-- o caso de alguém acrescentar contactos na app antes de o frontend passar para a tabela
-- nova. Idempotente: o "not exists" impede que uma segunda execução duplique linhas.
-- approval_track fica null (serve as duas vias) — é o comportamento que estes contactos
-- já têm hoje.
insert into hospital_contacts (hospital_id, name, role, email, phone, sort_order)
select h.id,
       nullif(trim(c.value ->> 'name'), ''),
       nullif(trim(c.value ->> 'role'), ''),
       nullif(trim(c.value ->> 'email'), ''),
       nullif(trim(c.value ->> 'phone'), ''),
       c.idx::int
  from hospitals h
  cross join lateral jsonb_array_elements(coalesce(h.contacts, '[]'::jsonb)) with ordinality as c(value, idx)
 where nullif(trim(c.value ->> 'name'), '') is not null
   and not exists (
     select 1 from hospital_contacts hc
      where hc.hospital_id = h.id
        and hc.name = trim(c.value ->> 'name')
        and coalesce(hc.email, '') = coalesce(nullif(trim(c.value ->> 'email'), ''), '')
   );

comment on column hospitals.contacts is
  'OBSOLETO desde a migração 0021 — os contactos passaram para a tabela hospital_contacts. Mantém-se só enquanto o frontend não estiver adaptado; apagar numa migração seguinte, depois de o novo código estar em produção.';

-- ─── VIEW hospitals_with_zone ────────────────────────────────────────────────
-- A view foi criada em 0001 com `select h.*` — e o `*` de uma view é expandido no momento
-- da criação, não a cada consulta. As três colunas acrescentadas acima existiam na tabela
-- mas NÃO apareciam na view, que é por onde o frontend lê os hospitais (hospitalStore):
-- morada, código postal e ID Elekta chegariam sempre vazios à aplicação, e a importação
-- nunca reconheceria um hospital pelo ID.
--
-- Tem de ser drop + create, e não "create or replace": o replace só deixa acrescentar
-- colunas NO FIM, e estas entram no meio (antes de zone_name/zone_code/zone_color).
-- security_invoker = on é obrigatório e vem de 0005 — sem ele a view corre com os
-- privilégios do owner e ignora o RLS da tabela por baixo.
drop view if exists hospitals_with_zone;

create view hospitals_with_zone with (security_invoker = on) as
select
  h.*,
  z.name  as zone_name,
  z.code  as zone_code,
  z.color as zone_color
from hospitals h
join zones z on z.id = h.zone_id;
