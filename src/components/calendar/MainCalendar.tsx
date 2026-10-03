import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { addDays, format } from 'date-fns';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import multiMonthPlugin from '@fullcalendar/multimonth';
import interactionPlugin from '@fullcalendar/interaction';
import ptLocale from '@fullcalendar/core/locales/pt';
import esLocale from '@fullcalendar/core/locales/es';
import type {
  Calendar,
  DateSelectArg,
  DatesSetArg,
  DayCellContentArg,
  EventClickArg,
  EventContentArg,
  EventInput,
  EventMountArg,
} from '@fullcalendar/core';
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
import { buildModalityScopeMatcher } from '../../lib/modalityScope';
import { addDaysToIsoDate } from '../../lib/dateFormat';
import { renderEventContent } from './EventContent';
import { buildHolidayBackgroundEvents, buildHolidayDayInfo } from './HolidayLayer';
import { useLang, useT } from '../../i18n';
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

// Fora do componente para não mudarem de referência a cada render: o
// @fullcalendar/react trata uma prop nova como opção alterada e redesenha o
// calendário inteiro (ver o comentário das funções estáveis em MainCalendar).
const CALENDAR_PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, multiMonthPlugin, interactionPlugin];
const TIME_FORMAT_24H = { hour: '2-digit', minute: '2-digit', hour12: false } as const;

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

// Titulo do evento no calendario: nome do equipamento e, quando a PM traz etiqueta, o
// que se vai fazer nessa visita (ex: "FT00746 FLEXITRON - SCRX + PM + OTP"). A etiqueta
// nao vem da modalidade porque muda de visita para visita na mesma maquina.
function eventTitle(equipmentName: string, label: string | null | undefined): string {
  return label ? `${equipmentName} - ${label}` : equipmentName;
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
  const t = useT();
  const lang = useLang();
  const equipment = useEquipmentStore((state) => state.equipment);
  const selectedEquipmentId = useEquipmentStore((state) => state.selectedEquipmentId);
  const selectedEquipmentIds = useEquipmentStore((state) => state.selectedEquipmentIds);
  const selectedModalityKeys = useEquipmentStore((state) => state.filters.modalityKeys);
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

  // Modalidades marcadas por zona-mãe (chave `zonaId::modalidade`): o equipamento está numa
  // zona-folha, por isso a comparação passa pelo matcher que expande a mãe aos descendentes.
  const matchesModality = useMemo(
    () => buildModalityScopeMatcher(selectedModalityKeys, zones),
    [selectedModalityKeys, zones],
  );

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

  const holidayDayInfo = useMemo(
    () => buildHolidayDayInfo(relevantHolidays, zones, t),
    [relevantHolidays, zones, t],
  );

  const equipmentById = useMemo(() => new Map(equipment.map((item) => [item.id, item])), [equipment]);

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
    const hasModalityFilter = selectedModalityKeys.length > 0;
    const visibleEvents =
      !hasZoneFilter && !hasEngineerFilter && !hasEquipmentFilter && !hasModalityFilter
        ? []
        : events.filter((event) => {
            const eq = equipmentById.get(event.equipment_id);
            const zoneMatch = hasZoneFilter && !!eq && selectedZoneIds.includes(eq.zone_id);
            const engineerMatch =
              hasEngineerFilter && !!event.engineer_id && selectedEngineerIds.includes(event.engineer_id);
            const equipmentMatch = hasEquipmentFilter && selectedEquipmentIds.includes(event.equipment_id);
            const modalityMatch = hasModalityFilter && !!eq && matchesModality(eq.zone_id, eq.modality);
            return zoneMatch || engineerMatch || equipmentMatch || modalityMatch;
          });

    const pmEvents: EventInput[] = visibleEvents.map((event) => {
      const eq = equipmentById.get(event.equipment_id);
      return {
        id: event.id,
        title: eventTitle(eq?.name ?? t('common.equipment'), event.calendar_label),
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
      const eq = equipmentById.get(event.equipment_id);
      return {
        id: event.id,
        title: eq?.name ?? t('common.equipment'),
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
    equipmentById,
    relevantHolidays,
    selectedZoneIds,
    selectedEngineerIds,
    selectedEquipmentIds,
    selectedModalityKeys,
    matchesModality,
    // `t` só é usado no título de recurso de um equipamento que não esteja carregado,
    // mas trocar de idioma tem de reconstruir os eventos para esse fallback acompanhar.
    t,
  ]);

  // A prop `events` do @fullcalendar/react nem sempre redesenha quando o array muda de
  // referência (bug conhecido do wrapper) — sincroniza-se aqui de forma imperativa via
  // calendarApi para garantir que o filtro (zonas/engenheiros/equipamentos) chega sempre
  // ao calendário, mesmo quando só o conteúdo do array varia entre renders.
  // Tudo dentro de batchRendering: fora dele, cada addEvent redesenha o calendário
  // inteiro (na vista Ano, os 12 meses), e com 200 PMs eram 200 redesenhos por cada
  // clique num filtro — 7 s e o aviso de página parada. Dentro, é um só (0,3 s).
  useEffect(() => {
    // O getApi() do @fullcalendar/react devolve a instância `Calendar`, que tem
    // batchRendering; o tipo declarado (CalendarApi) é que não o inclui.
    const api = calendarRef.current?.getApi() as Calendar | undefined;
    if (!api) return;
    api.batchRendering(() => {
      api.removeAllEvents();
      calendarEvents.forEach((event) => api.addEvent(event));
    });
  }, [calendarEvents, calendarRef]);

  // Funções passadas ao FullCalendar com referência estável. O @fullcalendar/react
  // compara as props por referência: uma função nova a cada render conta como opção
  // alterada e redesenha o calendário inteiro (na vista Ano com 200 PMs, ~180 ms em
  // vez de ~16 ms), e este componente re-renderiza a cada clique num filtro. O que
  // muda a cada render (o equipamento "armado", os handlers do Dashboard, o ano)
  // lê-se de `latest` em vez de entrar nas dependências.
  const latest = useRef({ equipment, selectedEquipmentId, planningYear, onSelectEvent, onCreateEvent });
  latest.current = { equipment, selectedEquipmentId, planningYear, onSelectEvent, onCreateEvent };

  const eventContent = useCallback(
    (arg: EventContentArg) => renderEventContent(arg, eventLineDensity, t),
    [eventLineDensity, t],
  );

  const eventClassNames = useCallback(
    (arg: { event: { id: string; extendedProps: Record<string, unknown> } }) => [
      ...getConflictClassNames(conflictedEventIds.has(arg.event.id)),
      ...(arg.event.extendedProps.isPreview ? ['pmplan-event-preview'] : []),
    ],
    [conflictedEventIds],
  );

  const dayCellContent = useCallback(
    (arg: DayCellContentArg) => {
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
    },
    [holidayDayInfo],
  );

  const datesSet = useCallback(
    (arg: DatesSetArg) => {
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
      if (viewYear !== latest.current.planningYear) setPlanningYear(viewYear);
    },
    [fetchEvents, setVisibleTitle, setPlanningYear],
  );

  const select = useCallback((arg: DateSelectArg) => {
    // Equipamento "armado" na sidebar (EquipmentList) → cria já a PM com hospital/
    // engenheiro pré-preenchidos, cobrindo exactamente os dias seleccionados com o
    // rato (arg.end é exclusivo em selecções allDay — passa a inclusivo com -1 dia).
    const { equipment: items, selectedEquipmentId: armedId, onCreateEvent: create } = latest.current;
    const armed = items.find((item) => item.id === armedId);
    if (armed) {
      create(arg.start, {
        equipmentId: armed.id,
        engineerId: armed.engineer_primary_id ?? '',
        endDate: addDays(arg.end, -1),
      });
      return;
    }
    create(arg.start);
  }, []);

  const eventClick = useCallback((arg: EventClickArg) => {
    if (arg.event.display === 'background') return;
    // Propostas em pré-visualização não são PMs reais — não abrem o modal de edição.
    if (arg.event.extendedProps.isPreview) return;
    latest.current.onSelectEvent(arg.event.id);
  }, []);

  const eventDidMount = useCallback(
    (arg: EventMountArg) => {
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
    },
    [holidayDayInfo],
  );

  const eventReceive = useCallback((arg: EventReceiveArg) => {
    // Vindo do drag-source da sidebar (EquipmentList) — nunca grava directamente:
    // remove o "fantasma" do FullCalendar e abre o PMEventModal pré-preenchido
    // para validar conflitos antes do commit (regra 6, secção 15).
    const { equipmentId, engineerId } = arg.event.extendedProps as {
      equipmentId: string;
      engineerId: string;
    };
    const start = arg.event.start ?? new Date();
    arg.event.remove();
    latest.current.onCreateEvent(start, { equipmentId, engineerId });
  }, []);

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={CALENDAR_PLUGINS}
      views={CALENDAR_VIEWS}
      initialView="multiMonthYear"
      initialDate={`${planningYear}-01-01`}
      headerToolbar={false}
      height="100%"
      // Nomes de meses e dias da semana no idioma do utilizador, com formato 24H
      // (secção: datas em DD/MM/AAAA, sem AM/PM). O locale pt-PT do FullCalendar
      // substitui o pt-BR que aqui estava: os nomes de mês são iguais, mas os dias da
      // semana não ("segunda-feira" vs "segunda-feira" abreviado de forma diferente).
      locale={lang === 'es' ? esLocale : ptLocale}
      // Semana começa sempre à segunda-feira — fixado aqui em vez de depender do locale,
      // que difere entre os dois (aplica-se a mês, trimestre, ano e semana).
      firstDay={1}
      slotLabelFormat={TIME_FORMAT_24H}
      eventTimeFormat={TIME_FORMAT_24H}
      // engineer/readonly: calendário só-consulta (secção: "engenheiros só podem
      // consultar o calendário sem o alterar").
      selectable={permissions.canCreatePM}
      editable={permissions.canEditPM}
      droppable={permissions.canCreatePM}
      eventContent={eventContent}
      eventClassNames={eventClassNames}
      dayCellContent={dayCellContent}
      datesSet={datesSet}
      select={select}
      eventClick={eventClick}
      eventDidMount={eventDidMount}
      eventDrop={handleEventDrop}
      eventResize={handleEventResize}
      eventReceive={eventReceive}
    />
  );
}
