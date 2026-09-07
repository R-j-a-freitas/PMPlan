-- PMPlan — Idioma da interface por utilizador (PT/ES).
--
-- A app passa a existir em português e espanhol, e a escolha é de cada pessoa, não da
-- organização: a mesma instalação serve equipas dos dois lados da fronteira. Por isso a
-- coluna vive em user_profiles e não em app_settings.
--
-- NÃO confundir com hospitals.country nem com email_templates.country (migração 0003):
-- esses decidem o idioma do que SAI para o cliente (cartas em PDF e emails) e continuam a
-- ser decididos pelo país do hospital. Esta coluna decide apenas o idioma do que o
-- utilizador VÊ na aplicação. Um planeador com a interface em espanhol continua a enviar
-- cartas em português a hospitais portugueses.
--
-- Nulo de propósito (sem default): é o nulo que distingue "ainda não escolheu" — e é o que
-- faz a aplicação pedir a escolha no primeiro acesso — de "escolheu português". Com um
-- default 'pt' ninguém em Espanha chegava a ver o ecrã de escolha.

alter table user_profiles
  add column if not exists language text
    check (language is null or language in ('pt', 'es'));

comment on column user_profiles.language is
  'Idioma da interface deste utilizador (pt/es). Nulo = ainda não escolheu, a app pede no login. Não afecta o idioma de cartas/emails enviados a clientes (esse vem de hospitals.country).';
