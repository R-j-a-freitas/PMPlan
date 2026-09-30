-- PMPlan — revisão do acesso por papel (2026-09-30).
--
-- Matriz pedida:
--   admin     tudo.
--   planner   altera PMs (incl. apagar as não realizadas); vê E EDITA equipamentos,
--             hospitais, contactos e feriados. Deixa de tratar das aprovações.
--   engineer  vê calendário, equipamentos, hospitais e contactos de TODAS as zonas;
--   readonly  não altera nada. (Até aqui o engenheiro só via as suas zonas.)
--   Aprovações — propostas, envio de emails a clientes, documentos assinados,
--   destinatários em CC — passam a ser exclusivas do admin, incluindo a LEITURA.
--
-- Migração idempotente: cada política é apagada e recriada com o mesmo nome.

-- ─── 1. Engenheiro vê todas as zonas ─────────────────────────────────────────
-- As cinco tabelas que filtravam por user_zone_ids() para o engenheiro. A função fica
-- (engineer_zones continua a servir para a atribuição de TLs e emails), só deixa de
-- limitar o que o engenheiro vê.
drop policy if exists pm_events_select on pm_events;
create policy pm_events_select on pm_events for select to authenticated
  using (user_role() in ('admin', 'planner', 'engineer', 'readonly'));

drop policy if exists equipment_select on equipment;
create policy equipment_select on equipment for select to authenticated
  using (user_role() in ('admin', 'planner', 'engineer', 'readonly'));

drop policy if exists hospitals_select on hospitals;
create policy hospitals_select on hospitals for select to authenticated
  using (user_role() in ('admin', 'planner', 'engineer', 'readonly'));

drop policy if exists hospital_contacts_select on hospital_contacts;
create policy hospital_contacts_select on hospital_contacts for select to authenticated
  using (user_role() in ('admin', 'planner', 'engineer', 'readonly'));

drop policy if exists source_changes_select on source_changes;
create policy source_changes_select on source_changes for select to authenticated
  using (user_role() in ('admin', 'planner', 'engineer', 'readonly'));

-- ─── 2. Planeador edita hospitais e contactos ────────────────────────────────
-- Os nomes antigos diziam "admin_"; os novos seguem o padrão "write_" das outras
-- tabelas partilhadas por admin e planner (equipment, holidays).
drop policy if exists hospitals_admin_insert on hospitals;
drop policy if exists hospitals_admin_update on hospitals;
drop policy if exists hospitals_admin_delete on hospitals;
drop policy if exists hospitals_write_insert on hospitals;
drop policy if exists hospitals_write_update on hospitals;
drop policy if exists hospitals_write_delete on hospitals;
create policy hospitals_write_insert on hospitals for insert to authenticated
  with check (user_role() in ('admin', 'planner'));
create policy hospitals_write_update on hospitals for update to authenticated
  using (user_role() in ('admin', 'planner'))
  with check (user_role() in ('admin', 'planner'));
create policy hospitals_write_delete on hospitals for delete to authenticated
  using (user_role() in ('admin', 'planner'));

drop policy if exists hospital_contacts_insert on hospital_contacts;
drop policy if exists hospital_contacts_update on hospital_contacts;
drop policy if exists hospital_contacts_delete on hospital_contacts;
create policy hospital_contacts_insert on hospital_contacts for insert to authenticated
  with check (user_role() in ('admin', 'planner'));
create policy hospital_contacts_update on hospital_contacts for update to authenticated
  using (user_role() in ('admin', 'planner'))
  with check (user_role() in ('admin', 'planner'));
create policy hospital_contacts_delete on hospital_contacts for delete to authenticated
  using (user_role() in ('admin', 'planner'));

-- ─── 3. Aprovações só para o admin ───────────────────────────────────────────
-- Leitura incluída: até aqui, planner e readonly liam propostas, histórico, registo de
-- emails e documentos assinados (o readonly fazia-o pelo endereço /approvals, que o
-- menu não mostrava). As escritas destas tabelas já eram só do admin, excepto
-- signed_documents (update), email_recipients e app_settings.
drop policy if exists client_proposals_select on client_proposals;
create policy client_proposals_select on client_proposals for select to authenticated
  using (user_role() = 'admin');

drop policy if exists client_proposal_events_select on client_proposal_events;
create policy client_proposal_events_select on client_proposal_events for select to authenticated
  using (user_role() = 'admin');

drop policy if exists email_log_select on email_log;
create policy email_log_select on email_log for select to authenticated
  using (user_role() = 'admin');

drop policy if exists signed_documents_select on signed_documents;
create policy signed_documents_select on signed_documents for select to authenticated
  using (user_role() = 'admin');

drop policy if exists signed_documents_update on signed_documents;
create policy signed_documents_update on signed_documents for update to authenticated
  using (user_role() = 'admin')
  with check (user_role() = 'admin');

drop policy if exists signed_documents_storage_read on storage.objects;
create policy signed_documents_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'signed-documents' and user_role() = 'admin');

-- Destinatários em CC e o interruptor dos Team Leaders (app_settings) só servem os
-- envios de propostas: a leitura fica aberta (inofensiva), a escrita passa a admin.
drop policy if exists email_recipients_insert on email_recipients;
drop policy if exists email_recipients_update on email_recipients;
drop policy if exists email_recipients_delete on email_recipients;
create policy email_recipients_insert on email_recipients for insert to authenticated
  with check (user_role() = 'admin');
create policy email_recipients_update on email_recipients for update to authenticated
  using (user_role() = 'admin')
  with check (user_role() = 'admin');
create policy email_recipients_delete on email_recipients for delete to authenticated
  using (user_role() = 'admin');

drop policy if exists app_settings_insert on app_settings;
drop policy if exists app_settings_update on app_settings;
create policy app_settings_insert on app_settings for insert to authenticated
  with check (user_role() = 'admin');
create policy app_settings_update on app_settings for update to authenticated
  using (user_role() = 'admin')
  with check (user_role() = 'admin');

-- pm_events_planner_delete_draft (planner apaga PMs 'planned'/'delayed') já existe e
-- mantém-se — é a regra pedida; faltava só a app mostrar o botão.
