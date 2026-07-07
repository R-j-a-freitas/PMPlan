import type { Country } from './zone';

/** Modalidades conhecidas — lista sugerida para a UI, não é um union estrito (campo é livre na BD). */
export const KNOWN_MODALITIES = [
  'LINAC',
  'Braquiterapia',
  'TPS',
  'Dosimetria',
  'TC Simulação',
  'Outro',
] as const;

export type PmPerYear = 1 | 2 | 3 | 4;

/** Controlo de trabalho ao fim-de-semana por contrato (Regra 5 do agendador automático).
 *  'none' = apenas dias úteis (padrão). 'saturday' = sábados permitidos.
 *  'both' = sábados e domingos permitidos. */
export type WeekendWork = 'none' | 'saturday' | 'both';

/** zone_id é desnormalizado de hospitals.zone_id e gerido por trigger — nunca editar directamente. */
export type Equipment = {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  modality: string;
  serial_number: string | null;
  hospital_id: string;
  zone_id: string;
  engineer_primary_id: string | null;
  engineer_secondary_id: string | null;
  pm_per_year: PmPerYear;
  pm_duration_days: number;
  needs_shutdown: boolean;
  weekend_work: WeekendWork;
  color: string;
  active: boolean;
  created_at: string;
};

/** Linha da view `equipment_full` — usar sempre esta view nas queries do calendário. */
export type EquipmentFull = Equipment & {
  hospital_name: string;
  hospital_short_name: string | null;
  /** País do hospital — fonte de verdade para o matching de feriados (zone já não tem país). */
  hospital_country: Country;
  /** Concelho/Comunidade Autónoma do hospital — casa com holidays.locality para
   *  feriados municipais/regionais oficiais (distinto de zone, que é operacional). */
  hospital_locality: string | null;
  /** Cidade espanhola (ex: "Vigo") — casa com holidays.locality para "fiestas locales"
   *  municipais, distintas do feriado regional. PT não usa: hospital_locality já é o concelho. */
  hospital_city: string | null;
  zone_name: string;
  zone_code: string;
  zone_color: string;
};

// zone_id continua presente no payload (a BD não tem default): o formulário deriva-o
// sempre de hospital_id e o campo é apresentado como readonly na UI — nunca editável
// directamente pelo utilizador (ver secção 4, regra 1).
export type EquipmentInsert = Omit<Equipment, 'id' | 'created_at'>;
export type EquipmentUpdate = Partial<EquipmentInsert>;
