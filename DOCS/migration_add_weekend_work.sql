-- Migração: adicionar campo weekend_work à tabela equipment
-- Data: 2026-06-28
--
-- 'none'     → apenas dias úteis (comportamento padrão)
-- 'saturday' → PM pode ser agendada ao sábado (contrato inclui sábado)
-- 'both'     → PM pode ser agendada a sábado e domingo

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS weekend_work TEXT NOT NULL DEFAULT 'none'
  CHECK (weekend_work IN ('none', 'saturday', 'both'));

-- A view equipment_full precisa de ser recriada para incluir o novo campo.
-- Verificar se existe antes de recriar (Supabase UI: Database > Views > equipment_full).

DROP VIEW IF EXISTS equipment_full;
CREATE VIEW equipment_full AS
SELECT
  e.id,
  e.name,
  e.manufacturer,
  e.model,
  e.modality,
  e.serial_number,
  e.hospital_id,
  e.zone_id,
  e.engineer_primary_id,
  e.engineer_secondary_id,
  e.pm_per_year,
  e.pm_duration_days,
  e.needs_shutdown,
  e.weekend_work,
  e.color,
  e.active,
  e.created_at,
  h.name            AS hospital_name,
  h.short_name      AS hospital_short_name,
  h.country         AS hospital_country,
  h.locality        AS hospital_locality,
  h.city            AS hospital_city,
  z.name            AS zone_name,
  z.code            AS zone_code,
  z.color           AS zone_color
FROM equipment e
JOIN hospitals h ON e.hospital_id = h.id
JOIN zones     z ON e.zone_id     = z.id;
