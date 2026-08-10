-- Team Leader por zona (secção: envios a clientes têm de incluir sempre o TL da zona
-- desse cliente). Antes não havia forma de saber quem era o TL de uma zona — a informação
-- existia só na cabeça de quem enviava, e o CC dependia de alguém se lembrar. Passa a ser
-- um atributo da própria zona, definido em Configurações → Zonas.
--
-- FK para engineers (e não nome/email em texto): o TL é uma pessoa que já existe no
-- sistema, por isso o email vem sempre de engineers.email e nunca fica dessincronizado
-- quando alguém muda de endereço. on delete set null — apagar um engenheiro não pode
-- apagar a zona, só a deixa sem TL (e a UI mostra isso).
alter table zones
  add column if not exists team_leader_engineer_id uuid references engineers(id) on delete set null;

comment on column zones.team_leader_engineer_id is
  'Team Leader responsável pela zona. Herdado pelas zonas-filhas quando estas não têm TL próprio (ver lib/zoneTree.resolveZoneTeamLeaderId). Entra sempre em CC nos emails enviados a clientes desta zona.';

-- Índice: a resolução do TL sobe a árvore de zonas a cada envio; sem isto era um seq scan
-- por nível. Tabela pequena, mas o índice é barato e o padrão de acesso é constante.
create index if not exists zones_team_leader_engineer_id_idx
  on zones (team_leader_engineer_id)
  where team_leader_engineer_id is not null;

-- ─── SEED DOS TLs ACTUAIS ────────────────────────────────────────────────────
-- Gonçalo Martins → North & West · Juan Manuel Bravo → South & Eastern Spain.
-- Só as zonas de topo levam TL: as filhas (Galiza, Lisboa, Norte, Madrid, ...) herdam-no
-- pela subida na árvore, por isso não é preciso repeti-lo em cada uma.
--
-- O match é por nome com '_' no lugar do 'ç' (evita depender da extensão unaccent, que
-- pode não estar instalada) e não falha a migração se o engenheiro não existir — nesse
-- caso a zona fica sem TL e é preciso defini-lo na app. É deliberado: inventar aqui um
-- registo de engenheiro com email adivinhado seria pior do que deixar isto explícito.
do $$
declare
  v_engineer_id uuid;
  v_zones_updated int;
begin
  -- North & West → Gonçalo Martins
  select id into v_engineer_id
    from engineers
   where lower(name) like 'gon_alo%martins%'
   order by active desc, created_at
   limit 1;

  if v_engineer_id is null then
    raise notice 'TL não definido para North & West: engenheiro "Gonçalo Martins" não encontrado. Define-o em Configurações → Zonas.';
  else
    update zones
       set team_leader_engineer_id = v_engineer_id
     where parent_zone_id is null
       and lower(name) like '%north%west%';
    get diagnostics v_zones_updated = row_count;
    if v_zones_updated = 0 then
      raise notice 'TL não aplicado: nenhuma zona de topo com nome tipo "North & West".';
    end if;
  end if;

  -- South & Eastern Spain → Juan Manuel Bravo
  select id into v_engineer_id
    from engineers
   where lower(name) like 'juan%bravo%'
   order by active desc, created_at
   limit 1;

  if v_engineer_id is null then
    raise notice 'TL não definido para South & Eastern Spain: engenheiro "Juan Manuel Bravo" não encontrado. Cria-o em Engenheiros e escolhe-o em Configurações → Zonas.';
  else
    update zones
       set team_leader_engineer_id = v_engineer_id
     where parent_zone_id is null
       and lower(name) like '%south%eastern%spain%';
    get diagnostics v_zones_updated = row_count;
    if v_zones_updated = 0 then
      raise notice 'TL não aplicado: nenhuma zona de topo com nome tipo "South & Eastern Spain".';
    end if;
  end if;
end $$;
