import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { DEFAULT_SOURCE_TYPE, includesSourceChange } from '../lib/pmLabels';
import type { PMEvent, PMEventInsert, PMEventUpdate, SourceChangeInsert } from '../types';

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
  /** PMs propostas mostradas em modo de pré-visualização (tracejadas, não persistidas) —
   *  alimentadas pelo AutoSchedulerModal para o utilizador ver a distribuição do ano
   *  inteiro no calendário antes de confirmar. Vazio fora da pré-visualização. */
  previewEvents: PMEvent[];

  fetchEvents: (range: DateRange) => Promise<void>;
  fetchYearEvents: (year: number) => Promise<void>;
  createEvent: (event: PMEventInsert) => Promise<PMEvent>;
  createBulkEvents: (events: PMEventInsert[]) => Promise<PMEvent[]>;
  updateEvent: (id: string, patch: PMEventUpdate) => Promise<void>;
  /** Aplica o mesmo patch a vários eventos numa só ida à BD (ex: reatribuir o
   *  engenheiro a todas as PMs de um equipamento). Devolve as linhas gravadas. */
  updateEvents: (ids: string[], patch: PMEventUpdate) => Promise<PMEvent[]>;
  deleteEvent: (id: string) => Promise<void>;
  deleteEvents: (ids: string[]) => Promise<void>;
  setActiveView: (view: CalendarViewName) => void;
  setSelectedEventId: (id: string | null) => void;
  setPlanningYear: (year: number) => void;
  setVisibleTitle: (title: string) => void;
  setPreviewEvents: (events: PMEvent[]) => void;
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

// Trocas de fonte que acompanham as PMs de fontes (etiqueta "SCRX …") criadas pelo
// agendador automático. source_changes não tem ligação a pm_events — a correspondência é
// (equipamento, data de início), a mesma chave usada na importação de 2026.
export async function createSourceChangesForEvents(events: PMEvent[]): Promise<void> {
  const withSource = events.filter((event) => includesSourceChange(event.calendar_label));
  if (withSource.length === 0) return;
  const { error } = await supabase.from('source_changes').insert(
    withSource.map(
      (event): SourceChangeInsert => ({
        equipment_id: event.equipment_id,
        source_type: DEFAULT_SOURCE_TYPE,
        initial_activity_gbq: null,
        planned_date: event.start_date,
        actual_date: null,
        serial_number: null,
        manufacturer: null,
        status: 'planned',
        notes: event.calendar_label,
      }),
    ),
  );
  if (error) throw error;
}

// Ao substituir PMs planeadas, as trocas de fonte planeadas nessas datas deixam de ter
// PM. Cancela-as em vez de as apagar: o planner pode apagar PMs planeadas mas a RLS só
// deixa o admin apagar source_changes (0001_init.sql) — e fica o registo do que mudou.
export async function cancelSourceChangesForEvents(events: PMEvent[]): Promise<void> {
  const datesByEquipment = new Map<string, string[]>();
  for (const event of events) {
    datesByEquipment.set(event.equipment_id, [...(datesByEquipment.get(event.equipment_id) ?? []), event.start_date]);
  }
  for (const [equipmentId, dates] of datesByEquipment) {
    const { error } = await supabase
      .from('source_changes')
      .update({ status: 'cancelled' })
      .eq('equipment_id', equipmentId)
      .eq('status', 'planned')
      .in('planned_date', dates);
    if (error) throw error;
  }
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
      previewEvents: [],

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

      // Mesma precaução do deleteEvents: o estado local é reconstruído a partir das linhas
      // devolvidas pelo update (e não dos ids pedidos) — se a RLS filtrar alguma, o
      // calendário não fica a mostrar uma alteração que a base de dados não aceitou.
      updateEvents: async (ids, patch) => {
        if (ids.length === 0) return [];
        const { data, error } = await supabase
          .from('pm_events')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .in('id', ids)
          .select();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        const saved = new Map((data ?? []).map((event) => [event.id, event]));
        const merge = (list: PMEvent[]) => list.map((event) => saved.get(event.id) ?? event);
        set({ events: merge(get().events), yearEvents: merge(get().yearEvents) });
        return data ?? [];
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

      // Usa os ids devolvidos pelo delete (não os pedidos) para actualizar o estado local —
      // protege contra o caso de um evento ter mudado de status entretanto (ex: passou a
      // 'confirmed'), que a RLS exclui silenciosamente do delete real.
      deleteEvents: async (ids) => {
        if (ids.length === 0) return;
        const { data, error } = await supabase.from('pm_events').delete().in('id', ids).select();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        const deletedIds = new Set((data ?? []).map((event) => event.id));
        set({
          events: get().events.filter((event) => !deletedIds.has(event.id)),
          yearEvents: get().yearEvents.filter((event) => !deletedIds.has(event.id)),
        });
      },

      setActiveView: (activeView) => set({ activeView }),
      setSelectedEventId: (selectedEventId) => set({ selectedEventId }),
      setPlanningYear: (planningYear) => set({ planningYear }),
      setVisibleTitle: (visibleTitle) => set({ visibleTitle }),
      setPreviewEvents: (previewEvents) => set({ previewEvents }),
    }),
    { name: 'calendar-store' },
  ),
);
