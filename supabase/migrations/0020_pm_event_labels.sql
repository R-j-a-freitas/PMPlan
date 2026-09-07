-- Etiqueta e descrição por PM (secção: braquiterapia — "SCRX + PM + OTP").
--
-- Numa troca de fonte aproveita-se a deslocação para fazer mais alguma coisa na mesma
-- máquina: manutenção do OTP, do Prostate, um simulacro de emergência. O que se faz muda
-- de visita para visita — no plano de 2026, 47 dos 58 equipamentos de braquiterapia têm
-- combinação diferente ao longo do ano. Por isso isto NÃO pode viver na modalidade, que é
-- um atributo do equipamento: a mesma máquina teria de mudar de modalidade quatro vezes
-- por ano, e o histórico das PMs passadas mudava com ela.
--
-- Duas colunas porque o público é diferente: o calendário precisa de algo curto que caiba
-- na barra do evento, a carta do cliente precisa do texto por extenso e na língua dele.
alter table pm_events
  add column if not exists calendar_label     text,   -- ex: "SCRX + PM + OTP"
  -- Texto para a carta/proposta, já na língua do hospital (PT ou ES) — ex:
  -- "Mantenimiento y cambio de fuente; Mantenimiento OTP".
  add column if not exists client_description text;

comment on column pm_events.calendar_label is
  'Etiqueta curta mostrada no calendário a seguir ao nome do equipamento. Null = só o nome.';
comment on column pm_events.client_description is
  'Descrição da intervenção para a carta do cliente, na língua do hospital. Null = usa o texto derivado da modalidade (ver lib/exporters/letterPdf.ts).';
