import type { ReactNode, RefObject } from 'react';
import type FullCalendar from '@fullcalendar/react';
import { useCalendarStore, useUiStore } from '../../stores';
import type { CalendarViewName, EventLineDensity } from '../../stores';
import { Button } from '../ui';

interface CalendarToolbarProps {
  calendarRef: RefObject<FullCalendar>;
  /** Slot opcional para acções adicionais à direita dos botões de vista. */
  rightSlot?: ReactNode;
}

const VIEW_LABELS: { view: CalendarViewName; label: string }[] = [
  { view: 'multiMonthYear', label: 'Ano' },
  { view: 'multiMonthQuarter', label: 'Trimestre' },
  { view: 'dayGridMonth', label: 'Mês' },
  { view: 'timeGridWeek', label: 'Semana' },
];

const DENSITY_OPTIONS: { density: EventLineDensity; label: string; title: string }[] = [
  { density: 1, label: '1 linha', title: 'PMs compactas — cabem mais sobrepostas no mesmo dia' },
  { density: 2, label: '2 linhas', title: 'PMs detalhadas — equipamento + hospital' },
];

// Barra de controlos e vistas — substitui o headerToolbar nativo do FullCalendar para
// não depender de mais nenhum plugin além dos Standard (MIT).
export function CalendarToolbar({ calendarRef, rightSlot }: CalendarToolbarProps) {
  const activeView = useCalendarStore((state) => state.activeView);
  const setActiveView = useCalendarStore((state) => state.setActiveView);
  const visibleTitle = useCalendarStore((state) => state.visibleTitle);
  const eventLineDensity = useUiStore((state) => state.eventLineDensity);
  const setEventLineDensity = useUiStore((state) => state.setEventLineDensity);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={() => calendarRef.current?.getApi().prev()}>
            ‹
          </Button>
          <Button variant="ghost" onClick={() => calendarRef.current?.getApi().today()}>
            Hoje
          </Button>
          <Button variant="ghost" onClick={() => calendarRef.current?.getApi().next()}>
            ›
          </Button>
        </div>
        <span className="text-sm font-semibold text-gray-700">{visibleTitle}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {VIEW_LABELS.map(({ view, label }) => (
            <Button
              key={view}
              variant={activeView === view ? 'primary' : 'secondary'}
              onClick={() => setActiveView(view)}
            >
              {label}
            </Button>
          ))}
        </div>
        {/* Densidade das barras de PM (1 ou 2 linhas) — preferência de UI persistida
           (uiStore), não muda por vista: útil sobretudo em Ano/Trimestre, onde o
           FullCalendar não deixa desligar o limite "mais +N" por outra via. */}
        <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
          {DENSITY_OPTIONS.map(({ density, label, title }) => (
            <Button
              key={density}
              variant={eventLineDensity === density ? 'primary' : 'secondary'}
              onClick={() => setEventLineDensity(density)}
              title={title}
            >
              {label}
            </Button>
          ))}
        </div>
        {rightSlot}
      </div>
    </div>
  );
}
