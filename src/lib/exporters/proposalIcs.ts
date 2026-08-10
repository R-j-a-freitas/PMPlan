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

// RFC 5545 §3.1 (line folding): uma "content line" com mais de 75 OCTETOS tem de ser
// dobrada — cada continuação começa por um espaço. O Outlook classic é estrito nisto e
// recusa/trunca ficheiros com linhas longas por dobrar (ex.: SUMMARY com o nome do
// equipamento + hospital passa fácil dos 75). Conta-se em bytes UTF-8, não em caracteres,
// e nunca se corta uma sequência multi-byte a meio (senão o acento vira lixo): recua-se
// enquanto o próximo byte for uma continuação UTF-8 (10xxxxxx).
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();
function foldLine(line: string): string {
  const bytes = utf8Encoder.encode(line);
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let start = 0;
  let limit = 75; // primeira linha: 75 octetos; continuações: 74 (o espaço inicial conta)
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    if (end < bytes.length) {
      // `end` está sempre dentro do array aqui (só decresce a partir de um índice
      // válido), mas o noUncheckedIndexedAccess não o consegue provar.
      while (end > start && (bytes[end]! & 0xc0) === 0x80) end--;
    }
    chunks.push(utf8Decoder.decode(bytes.slice(start, end)));
    start = end;
    limit = 74;
  }
  return chunks.join('\r\n ');
}

// Um .ics por hospital com um VEVENT por PM (intervalo real start_date–end_date, não
// expandido dia-a-dia como a tabela da carta) — qualquer calendário (Outlook, Google,
// Apple) sabe importar isto com um duplo-clique, sem precisar de nenhuma API/Azure.
// METHOD:PUBLISH marca-o como calendário publicado (import), não como convite — sem isto
// o Gmail tenta renderizar um cartão de evento e falha, e alguns Outlook recusam importar.
export function buildProposalIcs(hospitalName: string, equipmentList: EquipmentFull[], events: PMEvent[]): string {
  const stamp = toIcsDateTime(new Date());

  const veventLines = events
    .filter((event) => event.status !== 'cancelled')
    .flatMap((event) => {
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
      ];
    });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PMPlan//Aprovacoes//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...veventLines,
    'END:VCALENDAR',
  ];

  // UTF-8 SEM BOM: o Outlook classic rejeita ("não é possível carregar") qualquer byte
  // antes de BEGIN:VCALENDAR, e um BOM é exactamente isso. O charset é sinalizado onde
  // importa — no Content-Type do anexo de email (text/calendar; charset=utf-8, ver
  // Approvals.tsx / a Edge Function) e no Blob do download abaixo — não com um BOM.
  // Dobra cada content line e junta com CRLF (obrigatório em iCalendar).
  return lines.map(foldLine).join('\r\n');
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
