import type { Country } from './zone';

export type HospitalContact = {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
};

/** Hospital/cliente — a origem da hierarquia de zonas (equipment.zone_id deriva daqui).
 *  country fica aqui, não na zona: a mesma zona pode agrupar hospitais de PT e de ES. */
export type Hospital = {
  id: string;
  name: string;
  short_name: string | null;
  address: string | null;
  country: Country;
  /** Concelho (PT, texto livre, ex: "Braga") ou Comunidade Autónoma no formato ISO
   *  3166-2 da Nager.Date (ES, ex: "ES-GA" Galiza) — casa com holidays.locality para
   *  feriados municipais/regionais oficiais. */
  locality: string | null;
  /** Cidade/concelho espanhol (ex: "Vigo") — "fiestas locales" próprias do município,
   *  distintas do feriado regional da Comunidade Autónoma (locality acima). PT não usa
   *  este campo: locality já é o concelho. */
  city: string | null;
  zone_id: string;
  contacts: HospitalContact[];
  active: boolean;
  created_at: string;
};

/** Linha da view `hospitals_with_zone` — usar sempre esta view nas queries do frontend. */
export type HospitalWithZone = Hospital & {
  zone_name: string;
  zone_code: string;
  zone_color: string;
};

export type HospitalInsert = Omit<Hospital, 'id' | 'created_at'>;
export type HospitalUpdate = Partial<HospitalInsert>;
