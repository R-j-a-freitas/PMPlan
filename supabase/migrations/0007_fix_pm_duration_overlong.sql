-- Correcção de dados: PMs cujo end_date ficou demasiado longo face à duração contratada
-- do equipamento (pm_duration_days). Convenção da app: end_date é o último dia INCLUSIVE,
-- logo uma PM de N dias ocupa [start_date, start_date + N - 1]. O agendador automático
-- somava N em vez de N-1 (bug corrigido em src/lib/autoScheduler.ts), gerando PMs com +1
-- dia; algumas PMs manuais também ficaram acima da duração.
--
-- Só normaliza PMs ainda em rascunho (planned/delayed) — nunca toca em confirmed/
-- in_progress/completed/cancelled — e apenas ENCURTA as que estão acima da duração
-- contratada (nunca alonga uma PM mais curta, que pode ser intencional). Idempotente:
-- correr de novo não faz nada depois de aplicada.
update pm_events pe
set end_date = pe.start_date + (e.pm_duration_days - 1),
    updated_at = now()
from equipment e
where pe.equipment_id = e.id
  and pe.status in ('planned', 'delayed')
  and pe.end_date > pe.start_date + (e.pm_duration_days - 1);
