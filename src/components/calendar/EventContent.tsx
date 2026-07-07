import type { EventContentArg } from '@fullcalendar/core';

interface PMEventExtendedProps {
  hospitalName?: string;
  status?: string;
}

// Render customizado de eventos PM — substitui o título simples do FullCalendar.
export function renderEventContent(arg: EventContentArg) {
  if (arg.event.display === 'background') return null;

  const { hospitalName, status } = arg.event.extendedProps as PMEventExtendedProps;

  return (
    <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight text-white">
      <div className="truncate font-semibold">{arg.event.title}</div>
      {hospitalName && <div className="truncate opacity-90">{hospitalName}</div>}
      {status === 'delayed' && <div className="truncate font-semibold text-red-100">Atrasado</div>}
    </div>
  );
}
