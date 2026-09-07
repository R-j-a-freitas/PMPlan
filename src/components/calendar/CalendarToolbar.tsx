import type { ReactNode, RefObject } from 'react';
import type FullCalendar from '@fullcalendar/react';
import { useCalendarStore, useUiStore } from '../../stores';
import type { CalendarViewName, EventLineDensity } from '../../stores';
import { SegmentedGroup, SegmentedOption } from '../ui';
import { useT, type TranslationKey } from '../../i18n';

interface CalendarToolbarProps {
  calendarRef: RefObject<FullCalendar>;
  /** Slot opcional para acções adicionais à direita dos botões de vista. */
  rightSlot?: ReactNode;
}

const VIEW_LABELS: { view: CalendarViewName; labelKey: TranslationKey }[] = [
  { view: 'multiMonthYear', labelKey: 'calendar.view.year' },
  { view: 'multiMonthQuarter', labelKey: 'calendar.view.quarter' },
  { view: 'dayGridMonth', labelKey: 'calendar.view.month' },
  { view: 'timeGridWeek', labelKey: 'calendar.view.week' },
];

const DENSITY_OPTIONS: { density: EventLineDensity; labelKey: TranslationKey; titleKey: TranslationKey }[] = [
  { density: 1, labelKey: 'calendar.density.one', titleKey: 'calendar.density.oneTitle' },
  { density: 2, labelKey: 'calendar.density.two', titleKey: 'calendar.density.twoTitle' },
];

// Barra de controlos e vistas — substitui o headerToolbar nativo do FullCalendar para
// não depender de mais nenhum plugin além dos Standard (MIT).
export function CalendarToolbar({ calendarRef, rightSlot }: CalendarToolbarProps) {
  const t = useT();
  const activeView = useCalendarStore((state) => state.activeView);
  const setActiveView = useCalendarStore((state) => state.setActiveView);
  const visibleTitle = useCalendarStore((state) => state.visibleTitle);
  const eventLineDensity = useUiStore((state) => state.eventLineDensity);
  const setEventLineDensity = useUiStore((state) => state.setEventLineDensity);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-2">
      <div className="flex items-center gap-3">
        {/* Navegação temporal agrupada num único controlo segmentado — antes eram três
            botões soltos que não se liam como um conjunto. */}
        <div className="flex items-center rounded-md border border-gray-300 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => calendarRef.current?.getApi().prev()}
            aria-label={t('calendar.previousPeriod')}
            className="h-8 rounded-l-md px-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => calendarRef.current?.getApi().today()}
            className="h-8 border-x border-gray-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t('calendar.today')}
          </button>
          <button
            type="button"
            onClick={() => calendarRef.current?.getApi().next()}
            aria-label={t('calendar.nextPeriod')}
            className="h-8 rounded-r-md px-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            ›
          </button>
        </div>
        <span className="text-base font-semibold tracking-tight text-gray-900">{visibleTitle}</span>
      </div>

      <div className="flex items-center gap-2">
        <SegmentedGroup>
          {VIEW_LABELS.map(({ view, labelKey }) => (
            <SegmentedOption key={view} active={activeView === view} onClick={() => setActiveView(view)}>
              {t(labelKey)}
            </SegmentedOption>
          ))}
        </SegmentedGroup>
        {/* Densidade das barras de PM (1 ou 2 linhas) — preferência de UI persistida
           (uiStore), não muda por vista: útil sobretudo em Ano/Trimestre, onde o
           FullCalendar não deixa desligar o limite "mais +N" por outra via. */}
        <SegmentedGroup>
          {DENSITY_OPTIONS.map(({ density, labelKey, titleKey }) => (
            <SegmentedOption
              key={density}
              active={eventLineDensity === density}
              onClick={() => setEventLineDensity(density)}
              title={t(titleKey)}
            >
              {t(labelKey)}
            </SegmentedOption>
          ))}
        </SegmentedGroup>
        {rightSlot}
      </div>
    </div>
  );
}
