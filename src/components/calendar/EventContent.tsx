import type { EventContentArg } from '@fullcalendar/core';
import type { EventLineDensity } from '../../stores/uiStore';
import type { TFunction } from '../../i18n';

interface PMEventExtendedProps {
  hospitalName?: string;
  status?: string;
}

// Render customizado de eventos PM — substitui o título simples do FullCalendar.
// `density` é a preferência do utilizador (toggle "1 linha"/"2 linhas" na CalendarToolbar),
// não depende da vista: nas vistas multi-mês (Ano/Trimestre) o plugin multimonth do
// FullCalendar FORÇA dayMaxEvents no ecrã (ignora a opção — hardcoded `!forPrint` na
// v6.1.20), por isso density=1 é o que permite 2+ PMs sobrepostas no mesmo dia caberem
// sem colapsar em "mais +N". Em density=1 o hospital só fica acessível no tooltip nativo
// (atributo title, definido em MainCalendar.eventDidMount).
export function renderEventContent(arg: EventContentArg, density: EventLineDensity, t: TFunction) {
  if (arg.event.display === 'background') return null;

  const { hospitalName, status } = arg.event.extendedProps as PMEventExtendedProps;

  if (density === 1) {
    return (
      <div className="truncate px-1 text-[10px] font-semibold leading-[14px] text-white">
        {status === 'delayed' ? '⚠ ' : ''}
        {arg.event.title}
      </div>
    );
  }

  return (
    <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight text-white">
      <div className="truncate font-semibold">{arg.event.title}</div>
      {hospitalName && <div className="truncate opacity-90">{hospitalName}</div>}
      {status === 'delayed' && (
        <div className="truncate font-semibold text-red-100">{t('calendar.eventDelayed')}</div>
      )}
    </div>
  );
}
