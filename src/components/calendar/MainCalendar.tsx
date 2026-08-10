import { useEffect, useMemo, type RefObject } from 'react';
import { addDays, format } from 'date-fns';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import multiMonthPlugin from '@fullcalendar/multimonth';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import type { DateSelectArg, DayCellContentArg, EventClickArg, EventInput } from '@fullcalendar/core';
import type { EventReceiveArg } from '@fullcalendar/interaction';
import {
  useAuthStore,
  useCalendarStore,
  useConflictStore,
  useEngineerStore,
  useEquipmentStore,
  useHolidayStore,
  useUiStore,
  useZoneStore,
} from '../../stores';
import { useDragDrop } from '../../hooks';
import { computeActiveLocalities, filterRelevantHolidays } from '../../lib/activeLocalities';
import { addDaysToIsoDate } from '../../lib/dateFormat';
import { renderEventContent } from './EventContent';
import { buildHolidayBackgroundEvents, buildHolidayDayInfo } from './HolidayLayer';
import { getConflictClassNames } from './ConflictIndicator';

// Vistas Standard apenas (secção 6) — sem Timeline/Resource View (Premium).
// Tipo inferido a partir da prop `views` do FullCalendar (ViewConfigInputHash não é exportado publicamente).
const CALENDAR_VIEWS = {
  // NOTA sobre PMs sobrepostas nas vistas multi-mês: o plugin multimonth (v6.1.20)
  // IGNORA dayMaxEvents no ecrã (hardcoded `!forPrint`), por isso o limite "mais +N"
  // não é desligável por opção. A mitigação real é o toggle "1 linha"/"2 linhas" da
  // CalendarToolbar (uiStore.eventLineDensity, aplicado em EventContent.renderEventContent)
  // — density=1 encolhe cada barra a uma linha, cabendo 2-3 PMs por célula em vez de 1.
  // dayMaxEvents: false fica na mesma — é inócuo hoje e activa-se sozinho se o
  // FullCalendar corrigir o plugin.
  multiMonthYear: {
    type: 'multiMonth',
    duration: { years: 1 },
    multiMonthMaxColumns: 3,
    fixedWeekCount: false,
    dayMaxEvents: false,
  },
  multiMonthQuarter: { type: 'multiMonth', duration: { months: 3 }, multiMonthMaxColumns: 3, dayMaxEvents: false },
  dayGridMonth: { type: 'dayGrid', duration: { months: 1 } },
  timeGridWeek: { type: 'timeGrid', duration: { weeks: 1 } },
};

export interface CreateEventPrefill {
  equipmentId: string;
  engineerId: string;
  /** Fim do intervalo seleccionado no calendário (inclusivo) — só presente quando a
   *  criação vem de uma selecção de dias com um equipamento "armado" na sidebar. */
  endDate?: Date;
}

interface MainCalendarProps {
  calendarRef: RefObject<FullCalendar>;
  onSelectEvent: (eventId: string) => void;
  onCreateEvent: (date: Date, prefill?: CreateEventPrefill) => void;
}

export function MainCalendar({ calendarRef, onSelectEvent, onCreateEvent }: MainCalendarProps) {
  const events = useCalendarStore((state) => state.events);
  const previewEvents = useCalendarStore((state) => state.previewEvents);
  const activeView = useCalendarStore((state) => state.activeView);
  const planningYear = useCalendarStore((state) => state.planningYear);
  const setPlanningYear = useCalendarStore((state) => state.setPlanningYear);
  const fetchEvents = useCalendarStore((state) => state.fetchEvents);
  const setVisibleTitle = useCalendarStore((state) => state.setVisibleTitle);
  const eventLineDensity = useUiStore((state) => state.eventLineDensity);
  const equipment = useEquipmentStore((state) => state.equipment);
  const selectedEquipmentId = useEquipmentStore((state) => state.selectedEquipmentId);
  const selectedEquipmentIds = useEquipmentStore((state) => state.selectedEquipmentIds);
  const selectedModalities = useEquipmentStore((state) => state.filters.modalities);
  const selectedEngineerIds = useEngineerStore((state) => state.selectedEngineerIds);
  const holidays = useHolidayStore((state) => state.holidays);
  const zones = useZoneStore((state) => state.zones);
  const selectedZoneIds = useZoneStore((state) => state.selectedZoneIds);
  const conflictLog = useConflictStore((state) => state.log);
  const permissions = useAuthStore((state) => state.permissions);
  const { handleEventDrop, handleEventResize } = useDragDrop();

  useEffect(() => {
    calendarRef.current?.getApi().changeView(activeView);
  }, [activeView, calendarRef]);

  // "obrigatório separar os anos": mudar o ano de planeamento (Topbar) navega o
  // calendário para esse ano. Guarda: só reposiciona se o calendário estiver noutro ano,
  // para não puxar a vista de volta a Janeiro quando o planningYear foi sincronizado A
  // PARTIR da própria navegação do calendário (setas ‹ › da CalendarToolbar → datesSet).
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api && api.getDate().getFullYear() !== planningYear) {
      api.gotoDate(`${planningYear}-01-01`);
    }
  }, [planningYear, calendarRef]);

  const conflictedEventIds = useMemo(
    () => new Set(conflictLog.filter((entry) => !entry.resolved && entry.event_id).map((entry) => entry.event_id)),
    [conflictLog],
  );

  // Calendário só mostra feriados de localidades onde há equipamento real (secção:
  // "mostra somente os feriados dos locais que têm hospitais e equipamentos") — os
  // restantes ficam na BD (relevantes noutras zonas/clientes) mas não aparecem aqui.
  const activeLocalities = useMemo(() => computeActiveLocalities(equipment), [equipment]);
  const relevantHolidays = useMemo(
    () => filterRelevantHolidays(holidays, activeLocalities),
    [holidays, activeLocalities],
  );

  const holidayDayInfo = useMemo(() => buildHolidayDayInfo(relevantHolidays, zones), [relevantHolidays, zones]);

  const calendarEvents = useMemo<EventInput[]>(() => {
    // O calendário reflecte sempre exactamente o que está marcado no planeamento (zonas,
    // engenheiros, equipamentos e modalidades — em OR entre si). `selectedZoneIds` já vem com
    // a cascata zona-mãe → filhas aplicada no momento do clique (ver zoneStore.toggleZoneSelection)
    // — NÃO voltar a expandir aqui, ou desmarcar uma filha individual deixaria de ter
    // efeito (a mãe reincluía-a sempre). A modalidade (secção EQUIPAMENTOS da sidebar) mostra
    // as PMs de todo o equipamento dessa modalidade, tal como uma zona mostra as da zona.
    // Nada marcado em nenhum dos quatro = calendário vazio, não "mostra tudo" — é o
    // utilizador quem decide o que quer ver.
    const hasZoneFilter = selectedZoneIds.length > 0;
    const hasEngineerFilter = selectedEngineerIds.length > 0;
    const hasEquipmentFilter = selectedEquipmentIds.length > 0;
    const hasModalityFilter = selectedModalities.length > 0;
    const visibleEvents =
      !hasZoneFilter && !hasEngineerFilter && !hasEquipmentFilter && !hasModalityFilter
        ? []
        : events.filter((event) => {
            const eq = equipment.find((item) => item.id === event.equipment_id);
            const zoneMatch = hasZoneFilter && !!eq && selectedZoneIds.includes(eq.zone_id);
            const engineerMatch =
              hasEngineerFilter && !!event.engineer_id && selectedEngineerIds.includes(event.engineer_id);
            const equipmentMatch = hasEquipmentFilter && selectedEquipmentIds.includes(event.equipment_id);
            const modalityMatch = hasModalityFilter && !!eq && selectedModalities.includes(eq.modality);
            return zoneMatch || engineerMatch || equipmentMatch || modalityMatch;
          });

    const pmEvents: EventInput[] = visibleEvents.map((event) => {
      const eq = equipment.find((item) => item.id === event.equipment_id);
      return {
        id: event.id,
        title: eq?.name ?? 'Equipamento',
        start: event.start_date,
        allDay: true,
        // event.end_date é o último dia inclusive da PM (convenção da app — BD, modal,
        // conflictRules); o `end` do FullCalendar é exclusivo, por isso soma-se 1 dia. Tem
        // de continuar como string 'yyyy-MM-dd' (não `new Date(...)`) — o FullCalendar só
        // reconhece o evento como allDay se AMBAS start/end não tiverem componente de hora;
        // um objecto Date real conta sempre como "com hora", o que desalinhava allDay e
        // fazia o último dia (com a hora do desvio UTC→local) transbordar para o dia seguinte
        // na grelha, mostrando sempre +1 dia no calendário.
        end: addDaysToIsoDate(event.end_date, 1),
        backgroundColor: eq?.color ?? '#3B82F6',
        borderColor: eq?.color ?? '#3B82F6',
        extendedProps: {
          equipmentId: event.equipment_id,
          engineerId: event.engineer_id,
          status: event.status,
          hospitalName: eq?.hospital_name,
        },
      };
    });

    // Eventos de pré-visualização (propostas do AutoSchedulerModal ainda não guardadas):
    // ignoram por completo o filtro de zonas/engenheiros/equipamentos — o objectivo é ver
    // toda a distribuição proposta do ano de uma vez. Estilo tracejado (pmplan-event-preview)
    // e não editáveis/clicáveis (são propostas, não PMs reais).
    const previewPmEvents: EventInput[] = previewEvents.map((event) => {
      const eq = equipment.find((item) => item.id === event.equipment_id);
      return {
        id: event.id,
        title: eq?.name ?? 'Equipamento',
        start: event.start_date,
        allDay: true,
        end: addDaysToIsoDate(event.end_date, 1),
        backgroundColor: eq?.color ?? '#3B82F6',
        borderColor: eq?.color ?? '#3B82F6',
        editable: false,
        extendedProps: {
          equipmentId: event.equipment_id,
          engineerId: event.engineer_id,
          status: event.status,
          hospitalName: eq?.hospital_name,
          isPreview: true,
        },
      };
    });

    return [...pmEvents, ...previewPmEvents, ...buildHolidayBackgroundEvents(relevantHolidays)];
  }, [
    events,
    previewEvents,
    equipment,
    relevantHolidays,
    selectedZoneIds,
    selectedEngineerIds,
    selectedEquipmentIds,
    selectedModalities,
  ]);

  // A prop `events` do @fullcalendar/react nem sempre redesenha quando o array muda de
  // referência (bug conhecido do wrapper) — sincroniza-se aqui de forma imperativa via
  // calendarApi para garantir que o filtro (zonas/engenheiros/equipamentos) chega sempre
  // ao calendário, mesmo quando só o conteúdo do array varia entre renders.
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.removeAllEvents();
    calendarEvents.forEach((event) => api.addEvent(event));
  }, [calendarEvents, calendarRef]);

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin, interactionPlugin]}
      views={CALENDAR_VIEWS}
      initialView="multiMonthYear"
      initialDate={`${planningYear}-01-01`}
      headerToolbar={false}
      height="100%"
      // Locale PT-BR + formato 24H (secção: datas em DD/MM/AAAA, sem AM/PM).
      locale={ptBrLocale}
      // Semana começa sempre à segunda-feira — sobrepõe-se ao domingo que o locale pt-br
      // traz por omissão (aplica-se a todas as vistas: mês, trimestre, ano e semana).
      firstDay={1}
      slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      // engineer/readonly: calendário só-consulta (secção: "engenheiros só podem
      // consultar o calendário sem o alterar").
      selectable={permissions.canCreatePM}
      editable={permissions.canEditPM}
      droppable={permissions.canCreatePM}
      eventContent={(arg) => renderEventContent(arg, eventLineDensity)}
      eventClassNames={(arg) => [
        ...getConflictClassNames(conflictedEventIds.has(arg.event.id)),
        ...(arg.event.extendedProps.isPreview ? ['pmplan-event-preview'] : []),
      ]}
      dayCellContent={(arg: DayCellContentArg) => {
        // Feriado nesse dia → mostra de que zona é (se regional) e um tooltip nativo
        // (title) com o detalhe completo ao passar o rato (secção: "quando passado o
        // rato por cima" deve mostrar do que se trata e quem afecta).
        const info = holidayDayInfo.get(format(arg.date, 'yyyy-MM-dd'));
        if (!info) return arg.dayNumberText;
        return (
          <div className="flex w-full flex-col items-end gap-0.5" title={info.tooltip}>
            <span>{arg.dayNumberText}</span>
            {info.zoneNames.length > 0 && (
              <span className="truncate rounded bg-red-100 px-1 text-[9px] font-medium leading-tight text-red-700">
                {info.zoneNames.join(', ')}
              </span>
            )}
          </div>
        );
      }}
      datesSet={(arg) => {
        fetchEvents({ start: arg.startStr, end: arg.endStr });
        // headerToolbar está desligado (toolbar própria) — sem isto, dayGridMonth/
        // timeGridWeek ficam sem indicação nenhuma de que mês/semana se está a ver.
        setVisibleTitle(arg.view.title);
        // Navegar o calendário (setas ‹ ›, "Hoje", ou o próprio Topbar) mantém o
        // planningYear alinhado com o ano em vista — senão a geração de plano usaria um
        // ano diferente do que o utilizador está a ver (bug: ver 2027, gerar 2026).
        // currentStart é o início do período activo (Jan do ano na vista Ano/Trimestre;
        // 1.º dia do mês na vista Mês), não o intervalo com dias de padding.
        const viewYear = arg.view.currentStart.getFullYear();
        if (viewYear !== planningYear) setPlanningYear(viewYear);
      }}
      select={(arg: DateSelectArg) => {
        // Equipamento "armado" na sidebar (EquipmentList) → cria já a PM com hospital/
        // engenheiro pré-preenchidos, cobrindo exactamente os dias seleccionados com o
        // rato (arg.end é exclusivo em selecções allDay — passa a inclusivo com -1 dia).
        const armed = equipment.find((item) => item.id === selectedEquipmentId);
        if (armed) {
          onCreateEvent(arg.start, {
            equipmentId: armed.id,
            engineerId: armed.engineer_primary_id ?? '',
            endDate: addDays(arg.end, -1),
          });
          return;
        }
        onCreateEvent(arg.start);
      }}
      eventClick={(arg: EventClickArg) => {
        if (arg.event.display === 'background') return;
        // Propostas em pré-visualização não são PMs reais — não abrem o modal de edição.
        if (arg.event.extendedProps.isPreview) return;
        onSelectEvent(arg.event.id);
      }}
      eventDidMount={(arg) => {
        if (arg.event.display === 'background') {
          // Tooltip nativo no próprio fundo do feriado, não só perto do número do dia.
          const info = arg.event.start ? holidayDayInfo.get(format(arg.event.start, 'yyyy-MM-dd')) : undefined;
          if (info) arg.el.setAttribute('title', info.tooltip);
          return;
        }
        // PMs: tooltip com equipamento + hospital — nas vistas multi-mês a barra compacta
        // (EventContent) esconde a linha do hospital, que fica acessível ao passar o rato.
        const { hospitalName } = arg.event.extendedProps as { hospitalName?: string };
        arg.el.setAttribute('title', hospitalName ? `${arg.event.title} — ${hospitalName}` : arg.event.title);
      }}
      eventDrop={handleEventDrop}
      eventResize={handleEventResize}
      eventReceive={(arg: EventReceiveArg) => {
        // Vindo do drag-source da sidebar (EquipmentList) — nunca grava directamente:
        // remove o "fantasma" do FullCalendar e abre o PMEventModal pré-preenchido
        // para validar conflitos antes do commit (regra 6, secção 15).
        const { equipmentId, engineerId } = arg.event.extendedProps as {
          equipmentId: string;
          engineerId: string;
        };
        const start = arg.event.start ?? new Date();
        arg.event.remove();
        onCreateEvent(start, { equipmentId, engineerId });
      }}
    />
  );
}
