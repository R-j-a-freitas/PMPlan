import { addDays } from 'date-fns';
import type { EquipmentFull, PMEvent } from '../../types';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

// DTSTART/DTEND de eventos de dia inteiro usam só a data (sem hora) — DTEND é exclusivo
// no formato iCalendar, tal como no FullCalendar (ver MainCalendar.tsx), por isso soma-se
// 1 dia ao end_date (que na app é sempre o último dia inclusive da PM).
function toIcsDate(isoDate: string, exclusive = false): string {
  const date = exclusive ? addDays(new Date(isoDate), 1) : new Date(isoDate);
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function toIcsDateTime(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Um .ics por hospital com um VEVENT por PM (intervalo real start_date–end_date, não
// expandido dia-a-dia como a tabela da carta) — qualquer calendário (Outlook, Google,
// Apple) sabe importar isto com um duplo-clique, sem precisar de nenhuma API/Azure.
export function buildProposalIcs(hospitalName: string, equipmentList: EquipmentFull[], events: PMEvent[]): string {
  const stamp = toIcsDateTime(new Date());

  const vevents = events
    .filter((event) => event.status !== 'cancelled')
    .map((event) => {
      const equipment = equipmentList.find((item) => item.id === event.equipment_id);
      const summary = `Manutenção Preventiva — ${equipment?.name ?? 'Equipamento'} (${hospitalName})`;
      return [
        'BEGIN:VEVENT',
        `UID:${event.id}@pmplan`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${toIcsDate(event.start_date)}`,
        `DTEND;VALUE=DATE:${toIcsDate(event.end_date, true)}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `LOCATION:${escapeIcsText(hospitalName)}`,
        'END:VEVENT',
      ].join('\r\n');
    });

  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PMPlan//Aprovacoes//PT', 'CALSCALE:GREGORIAN', ...vevents, 'END:VCALENDAR'].join(
    '\r\n',
  );
}

export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
