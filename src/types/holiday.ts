import type { Country } from './zone';

export type HolidayType = 'national' | 'regional' | 'local';

/** zone_id null = feriado nacional (aplica a todo o país); preenchido = fecho operacional
 *  de uma zona do PMPlan. locality é o concelho/Comunidade Autónoma oficial (casa com
 *  hospitals.locality) — independente de zone_id, que é um agrupamento do admin. */
export type Holiday = {
  id: string;
  zone_id: string | null;
  locality: string | null;
  country: Country;
  date: string;
  name: string;
  type: HolidayType;
  year: number;
  source: string;
};

export type HolidayInsert = Omit<Holiday, 'id'>;

/** Resposta bruta da API Nager.Date — https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode} */
export type NagerDateHoliday = {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
};
