import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { PMEvent, PMEventInsert, PMEventUpdate } from '../types';

export type CalendarViewName = 'multiMonthYear' | 'multiMonthQuarter' | 'dayGridMonth' | 'timeGridWeek';

interface DateRange {
  start: string;
  end: string;
}

interface CalendarState {
  events: PMEvent[];
  loading: boolean;
  error: string | null;
  activeView: CalendarViewName;
  visibleRange: DateRange | null;
  /** Título formatado da vista actual (ex: "Junho 2026", "15–21 Jun 2026") — vem de
   *  arg.view.title no `datesSet` do FullCalendar; mostrado na CalendarToolbar porque
   *  o headerToolbar nativo (que o traria de série) está desligado. */
  visibleTitle: string;
  selectedEventId: string | null;
  /** Ano de planeamento activo (secção: "obrigatório separar os anos" — ex: planear 2027
   *  em Novembro de 2026). Independente do ano civil corrente; controla o que o calendário
   *  mostra e em que ano as PMs novas são gravadas. */
  planningYear: number;
  /** Todos os eventos do ano de planeamento, independentemente da vista activa do
   *  calendário (`events` só tem o que está visível — Mês/Semana ficam com uma fatia
   *  pequena do ano). Usado pelas métricas de carga (LoadMap), que precisam sempre do
   *  ano completo para o cálculo dar certo. */
  yearEvents: PMEvent[];
  yearEventsLoading: boolean;

  fetchEvents: (range: DateRange) => Promise<void>;
  fetchYearEvents: (year: number) => Promise<void>;
  createEvent: (event: PMEventInsert) => Promise<PMEvent>;
  createBulkEvents: (events: PMEventInsert[]) => Promise<PMEvent[]>;
  updateEvent: (id: string, patch: PMEventUpdate) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  setActiveView: (view: CalendarViewName) => void;
  setSelectedEventId: (id: string | null) => void;
  setPlanningYear: (year: number) => void;
  setVisibleTitle: (title: string) => void;
}

// Consulta pura dos eventos de um ano — NÃO escreve no store. Usada pelo
// AutoSchedulerModal para obter os eventos do ano alvo sem sobrepor os `yearEvents`
// do planningYear activo (LoadMap/Dashboard continuam coerentes durante a geração).
export async function fetchYearEventsSnapshot(year: number): Promise<PMEvent[]> {
  const { data, error } = await supabase
    .from('pm_events')
    .select('*')
    .gte('start_date', `${year}-01-01`)
    .lte('start_date', `${year}-12-31`);
  if (error) throw error;
  return data;
}

export const useCalendarStore = create<CalendarState>()(
  devtools(
    (set, get) => ({
      events: [],
      loading: false,
      error: null,
      activeView: 'multiMonthYear',
      visibleRange: null,
      visibleTitle: '',
      selectedEventId: null,
      planningYear: new Date().getFullYear(),
      yearEvents: [],
      yearEventsLoading: false,

      fetchEvents: async (range) => {
        set({ loading: true, error: null, visibleRange: range });
        const { data, error } = await supabase
          .from('pm_events')
          .select('*')
          .gte('start_date', range.start)
          .lte('end_date', range.end);
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ events: data, loading: false });
      },

      // Separado de `fetchEvents` (que só cobre a vista visível do calendário) — as
      // métricas de carga (LoadMap) precisam sempre do ano de planeamento completo,
      // independentemente de a vista activa estar em Mês/Semana.
      fetchYearEvents: async (year) => {
        set({ yearEventsLoading: true, error: null });
        try {
          const data = await fetchYearEventsSnapshot(year);
          set({ yearEvents: data, yearEventsLoading: false });
        } catch (error) {
          set({
            yearEventsLoading: false,
            error: error instanceof Error ? error.message : 'Falha ao carregar eventos do ano.',
          });
        }
      },

      createEvent: async (event) => {
        const { data, error } = await supabase.from('pm_events').insert(event).select().single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ events: [...get().events, data], yearEvents: [...get().yearEvents, data] });
        return data;
      },

      createBulkEvents: async (events) => {
        if (events.length === 0) return [];
        const { data, error } = await supabase.from('pm_events').insert(events).select();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({
          events: [...get().events, ...data],
          yearEvents: [...get().yearEvents, ...data],
        });
        return data;
      },

      updateEvent: async (id, patch) => {
        const { data, error } = await supabase
          .from('pm_events')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({
          events: get().events.map((event) => (event.id === id ? data : event)),
          yearEvents: get().yearEvents.map((event) => (event.id === id ? data : event)),
        });
      },

      deleteEvent: async (id) => {
        const { error } = await supabase.from('pm_events').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({
          events: get().events.filter((event) => event.id !== id),
          yearEvents: get().yearEvents.filter((event) => event.id !== id),
        });
      },

      setActiveView: (activeView) => set({ activeView }),
      setSelectedEventId: (selectedEventId) => set({ selectedEventId }),
      setPlanningYear: (planningYear) => set({ planningYear }),
      setVisibleTitle: (visibleTitle) => set({ visibleTitle }),
    }),
    { name: 'calendar-store' },
  ),
);
