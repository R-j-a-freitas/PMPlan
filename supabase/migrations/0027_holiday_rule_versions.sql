-- PMPlan — versões das regras de feriados por ano.
--
-- As fiestas locales espanholas mudam de data todos os anos. Editar uma regra reescrevia
-- a data em TODOS os anos carregados: ao acertar as datas de 2027 em Novembro, as de 2026
-- (ano ainda em curso, com PMs por fazer) mudavam também.
--
-- Agora uma regra vale num intervalo de anos [valid_from, valid_to] (null = sem limite).
-- Editar "a partir de 2027" fecha a versão actual em 2026 e cria outra a partir de 2027,
-- com o mesmo nome — por isso a unicidade passa a incluir valid_from.

alter table holiday_rules add column valid_from int check (valid_from between 2000 and 2100);
alter table holiday_rules add column valid_to   int check (valid_to between 2000 and 2100);
alter table holiday_rules add constraint holiday_rules_valid_range
  check (valid_from is null or valid_to is null or valid_to >= valid_from);

alter table holiday_rules drop constraint if exists holiday_rules_country_locality_name_key;
alter table holiday_rules add constraint holiday_rules_country_locality_name_from_key
  unique nulls not distinct (country, locality, name, valid_from);

notify pgrst, 'reload schema';
