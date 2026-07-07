import { useCallback } from 'react';
import { addDays } from 'date-fns';
import type { EventDropArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { useConflictEngine } from './useConflictEngine';
import { useCalendarStore, useUiStore } from '../stores';

interface DragDropResult {
  handleEventDrop: (info: EventDropArg) => Promise<void>;
  handleEventResize: (info: EventResizeDoneArg) => Promise<void>;
}

interface DraggedEventProps {
  equipmentId: string;
  engineerId: string;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// `event.end` do FullCalendar é exclusivo; `end_date` da app é o último dia inclusive da
// PM (mesma convenção do MainCalendar/BD/conflictRules) — por isso subtrai-se 1 dia.
// Sem `end` (evento de 1 dia só), o próprio `start` já é o último dia inclusive.
function toInclusiveEndDate(event: { start: Date | null; end: Date | null }): Date {
  if (event.end) return addDays(event.end, -1);
  return event.start ?? new Date();
}

// Comportamento de drag-and-drop com conflito (secção 5):
// feriado / sobreposição de engenheiro → bloqueia e reverte; carga de zona → avisa mas permite.
export function useDragDrop(): DragDropResult {
  const { validate } = useConflictEngine();
  const updateEvent = useCalendarStore((state) => state.updateEvent);
  const pushToast = useUiStore((state) => state.pushToast);

  const applyOrRevert = useCallback(
    async (params: {
      eventId: string;
      equipmentId: string;
      engineerId: string;
      startDate: Date;
      endDate: Date;
      revert: () => void;
    }) => {
      const results = validate({
        equipmentId: params.equipmentId,
        engineerId: params.engineerId,
        startDate: params.startDate,
        endDate: params.endDate,
        excludeEventId: params.eventId,
      });

      const blocking = results.find((result) => result.hasConflict && result.type !== 'zone_overload');
      if (blocking) {
        params.revert();
        pushToast({ variant: 'error', message: blocking.message ?? 'Conflito ao agendar PM.' });
        return;
      }

      const warning = results.find((result) => result.hasConflict && result.type === 'zone_overload');
      if (warning) {
        pushToast({ variant: 'warning', message: warning.message ?? 'Zona com carga elevada.' });
      }

      try {
        await updateEvent(params.eventId, {
          start_date: toIsoDate(params.startDate),
          end_date: toIsoDate(params.endDate),
        });
      } catch (err) {
        params.revert();
        pushToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Falha ao gravar a PM.',
        });
      }
    },
    [validate, updateEvent, pushToast],
  );

  const handleEventDrop = useCallback(
    async (info: EventDropArg) => {
      const { equipmentId, engineerId } = info.event.extendedProps as DraggedEventProps;
      await applyOrRevert({
        eventId: info.event.id,
        equipmentId,
        engineerId,
        startDate: info.event.start ?? new Date(),
        endDate: toInclusiveEndDate(info.event),
        revert: info.revert,
      });
    },
    [applyOrRevert],
  );

  const handleEventResize = useCallback(
    async (info: EventResizeDoneArg) => {
      const { equipmentId, engineerId } = info.event.extendedProps as DraggedEventProps;
      await applyOrRevert({
        eventId: info.event.id,
        equipmentId,
        engineerId,
        startDate: info.event.start ?? new Date(),
        endDate: toInclusiveEndDate(info.event),
        revert: info.revert,
      });
    },
    [applyOrRevert],
  );

  return { handleEventDrop, handleEventResize };
}
