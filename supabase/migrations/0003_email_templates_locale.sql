-- PMPlan — Templates de email bilingues (secção: "todos estes emails e cartas têm de
-- ser em PT ou ES conforme o cliente"). A carta em PDF já tinha variante PT/ES
-- (lib/exporters/letterPdf.ts) — os templates de email (email_templates) ainda só
-- tinham uma versão; passam a ter uma linha por (key, country), espelhando
-- hospitals.country, em vez de inventar um conceito de idioma à parte.

alter table email_templates drop constraint if exists email_templates_key_key;

alter table email_templates
  add column country text not null default 'PT' check (country in ('PT', 'ES'));

alter table email_templates
  add constraint email_templates_key_country_key unique (key, country);

-- As 3 linhas que já existiam (key únicas) ficam como a versão PT (default 'PT' acima)
-- — preserva qualquer edição que o admin já tenha feito. Faltam as versões ES.
insert into email_templates (key, country, subject, body) values
  (
    'engineer_approval',
    'ES',
    'Aprobación de calendario de PMs — {{ano}}',
    E'Hola {{engenheiro}},\n\nAdjuntamos la propuesta de calendario de los mantenimientos preventivos para validar.\n\n{{tabela}}\n\nPor favor confirma si las fechas son correctas, para poder avanzar con la propuesta al cliente.\n\nSaludos'
  ),
  (
    'client_proposal',
    'ES',
    'Plan de Mantenimiento Preventivo {{ano}}',
    E'Muy Sres nuestros,\n\nLes informamos del plan previsto de los Mantenimientos Preventivos para los equipos instalados en sus instalaciones.\n\n{{tabela}}\n\nAprovechamos la ocasión para saludarles atentamente'
  ),
  (
    'signature_letter',
    'ES',
    'Confirmación de calendario — Mantenimiento Preventivo {{ano}} — {{hospital}}',
    E'Muy Sres nuestros,\n\nAdjuntamos la carta con el calendario aprobado de los Mantenimientos Preventivos para {{ano}}. Les agradeceríamos nos devolvieran una copia firmada según se indica en la carta.\n\nSaludos'
  );
