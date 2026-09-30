import type { Country } from '../types';

// Onde confirmar cada tipo de feriado — usado pela nota do topo da página Feriados e pelo
// link "Confirmar" de cada cidade espanhola. Todos os endereços foram testados em
// 30/09/2026 (os de calendarioslaborales.com, para as 49 cidades com hospital).

const NAGER_COUNTRY_NAME: Record<Country, string> = { PT: 'Portugal', ES: 'Spain' };

/** Página pública da Nager.Date com os feriados que a app importa para o país/ano. */
export function nagerUrl(country: Country, year: number): string {
  return `https://date.nager.at/PublicHoliday/${NAGER_COUNTRY_NAME[country]}/${year}`;
}

/** Texto integral de uma resolução do BOE. */
export function boeResolutionUrl(boeId: string): string {
  return `https://www.boe.es/diario_boe/txt.php?id=${encodeURIComponent(boeId)}`;
}

export const BOE_SEARCH_URL = 'https://www.boe.es/buscar/boe.php';
export const PT_HOLIDAYS_URL = 'https://pt.wikipedia.org/wiki/Feriados_em_Portugal';
export const PT_MUNICIPAL_HOLIDAYS_URL = 'https://icalendario.pt/feriados/municipais/';
export const CATALONIA_CALENDAR_URL = 'https://treball.gencat.cat/ca/ambits/relacions_laborals/ci/calendari_laboral/';

// Nomes curtos gravados em hospitals.city que o site conhece pelo nome completo.
const CITY_SLUG_ALIASES: Record<string, string> = {
  Talavera: 'talavera-de-la-reina',
  Vitoria: 'vitoria-gasteiz',
  Jerez: 'jerez-de-la-frontera',
};

function citySlug(city: string): string {
  return (
    CITY_SLUG_ALIASES[city] ??
    city
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/'/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

/** Calendário laboral da cidade (nacionais, regionais e as duas fiestas locales). Não é
 *  fonte oficial, mas junta num só sítio o que está espalhado pelos boletins provinciais. */
export function spanishCityCalendarUrl(city: string, year: number): string {
  return `https://calendarioslaborales.com/calendario-laboral-${citySlug(city)}-${year}.htm`;
}
