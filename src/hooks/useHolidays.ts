import { useEffect } from 'react';
import { expandHolidayRule } from '../lib/expandHolidayRule';
import { useHolidayRuleStore, useHolidayStore } from '../stores';
import type { Country, Holiday, HolidayInsert, NagerDateHoliday } from '../types';

const NAGER_BASE_URL = 'https://date.nager.at/api/v3/PublicHolidays';
const SUPPORTED_COUNTRIES: Country[] = ['PT', 'ES'];

async function fetchFromNager(year: number, country: Country): Promise<NagerDateHoliday[]> {
  const response = await fetch(`${NAGER_BASE_URL}/${year}/${country}`);
  if (!response.ok) {
    throw new Error(`Falha ao obter feriados ${country} ${year} (Nager.Date): ${response.status}`);
  }
  return (await response.json()) as NagerDateHoliday[];
}

// global=true → feriado nacional (locality null). global=false + counties → a Nager.Date
// já devolve feriados regionais oficiais (ex: "Dia da Galiza" só em counties=["ES-GA"]) —
// uma linha por região, para o matching em conflictRules usar hospital.locality.
function toHolidayInserts(raw: NagerDateHoliday, country: Country, year: number): HolidayInsert[] {
  const name = raw.localName || raw.name;

  if (raw.global || !raw.counties || raw.counties.length === 0) {
    return [{ zone_id: null, locality: null, country, date: raw.date, name, type: 'national', year, source: 'nager-date' }];
  }

  return raw.counties.map((locality) => ({
    zone_id: null,
    locality,
    country,
    date: raw.date,
    name,
    type: 'regional',
    year,
    source: 'nager-date',
  }));
}

interface UseHolidaysResult {
  holidays: Holiday[];
  loading: boolean;
  error: string | null;
}

// No arranque da app (ou ao mudar de ano no calendário), garante que os feriados PT+ES
// desse ano existem na BD — vai à Nager.Date apenas se ainda não estiverem lá.
export function useHolidays(year: number): UseHolidaysResult {
  const holidays = useHolidayStore((state) => state.holidays.filter((h) => h.year === year));
  const loading = useHolidayStore((state) => state.loading);
  const error = useHolidayStore((state) => state.error);
  const isYearLoaded = useHolidayStore((state) => state.isYearLoaded);
  const fetchHolidaysFromDb = useHolidayStore((state) => state.fetchHolidaysFromDb);
  const addHolidays = useHolidayStore((state) => state.addHolidays);
  const fetchHolidayRules = useHolidayRuleStore((state) => state.fetchRules);

  useEffect(() => {
    if (isYearLoaded(year)) return;
    let cancelled = false;

    async function ensureYear(): Promise<void> {
      const existing = await fetchHolidaysFromDb(year);
      if (cancelled || existing.length > 0) return;

      const [fetchedPerCountry, rules] = await Promise.all([
        Promise.all(SUPPORTED_COUNTRIES.map((country) => fetchFromNager(year, country))),
        fetchHolidayRules(),
      ]);
      if (cancelled) return;

      const fromNager = fetchedPerCountry.flatMap((holidaysForCountry, index) => {
        const country = SUPPORTED_COUNTRIES[index];
        if (!country) return [];
        return holidaysForCountry.flatMap((raw) => toHolidayInserts(raw, country, year));
      });
      // Regras recorrentes (feriados locais PT, fixos ou móveis) expandidas para este ano.
      const fromRules = rules.map((rule) => expandHolidayRule(rule, year));
      await addHolidays([...fromNager, ...fromRules], year);
    }

    ensureYear().catch((err: unknown) => {
      console.error(`useHolidays: falha ao garantir feriados de ${year}`, err);
    });

    return () => {
      cancelled = true;
    };
  }, [year, isYearLoaded, fetchHolidaysFromDb, addHolidays, fetchHolidayRules]);

  return { holidays, loading, error };
}
