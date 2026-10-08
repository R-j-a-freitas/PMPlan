import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { PmHolidayConfirmation, PmHolidayConfirmationInsert } from '../types';

// Confirmações de PMs marcadas em feriados (migração 0029). Partilhada pela revisão da
// página Feriados, pelo aviso do calendário e pelo motor de conflitos — os três têm de
// concordar sobre o que já foi confirmado. A tabela é pequena (uma linha por PM
// confirmada num feriado), por isso carrega-se inteira.
interface PmHolidayConfirmationState {
  confirmations: PmHolidayConfirmation[];
  loaded: boolean;
  fetchConfirmations: () => Promise<void>;
  confirm: (rows: PmHolidayConfirmationInsert[]) => Promise<void>;
  undo: (pmEventId: string, holidayDates: string[]) => Promise<void>;
}

export const usePmHolidayConfirmationStore = create<PmHolidayConfirmationState>()(
  devtools(
    (set, get) => ({
      confirmations: [],
      loaded: false,

      fetchConfirmations: async () => {
        const { data, error } = await supabase.from('pm_holiday_confirmations').select('*');
        if (error) throw error;
        set({ confirmations: data, loaded: true });
      },

      confirm: async (rows) => {
        const { data, error } = await supabase
          .from('pm_holiday_confirmations')
          .upsert(rows, { onConflict: 'pm_event_id,holiday_date' })
          .select();
        if (error) throw error;
        const replaced = new Set(data.map((row) => `${row.pm_event_id}|${row.holiday_date}`));
        set({
          confirmations: [
            ...get().confirmations.filter((row) => !replaced.has(`${row.pm_event_id}|${row.holiday_date}`)),
            ...data,
          ],
        });
      },

      undo: async (pmEventId, holidayDates) => {
        const { error } = await supabase
          .from('pm_holiday_confirmations')
          .delete()
          .eq('pm_event_id', pmEventId)
          .in('holiday_date', holidayDates);
        if (error) throw error;
        const dates = new Set(holidayDates);
        set({
          confirmations: get().confirmations.filter(
            (row) => !(row.pm_event_id === pmEventId && dates.has(row.holiday_date)),
          ),
        });
      },
    }),
    { name: 'pm-holiday-confirmation-store' },
  ),
);

/** Dias de feriado já confirmados por PM: pmEventId → conjunto de 'yyyy-MM-dd'. */
export function confirmedHolidayDatesByEvent(confirmations: PmHolidayConfirmation[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of confirmations) {
    const set = map.get(row.pm_event_id) ?? new Set<string>();
    set.add(row.holiday_date.slice(0, 10));
    map.set(row.pm_event_id, set);
  }
  return map;
}
