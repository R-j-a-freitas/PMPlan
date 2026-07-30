-- Permite ao planner (team leader) apagar PMs ainda em rascunho (planned/delayed) —
-- necessário para o auto-scheduler poder substituir propostas antigas por novas sem
-- pedir a um admin. Aditiva à policy "pm_events_admin_delete" (0001_init.sql) — Postgres
-- combina policies permissivas com OR, por isso o admin continua a poder apagar qualquer
-- pm_event. PMs confirmed/in_progress/completed/cancelled nunca ficam apagáveis por um
-- planner por esta via, reforçando ao nível da BD a regra "nunca tocar em manutenção
-- confirmada pelo cliente".
create policy "pm_events_planner_delete_draft" on pm_events for delete to authenticated
  using (user_role() = 'planner' and status in ('planned', 'delayed'));
