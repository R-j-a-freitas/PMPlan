import { useCallback } from 'react';
import { addDays, format } from 'date-fns';
import type { EventDropArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { useConflictEngine } from './useConflictEngine';
import { useCalendarStore, useUiStore } from '../stores';
import { useT } from '../i18n';
import { conflictMessage } from '../i18n/labels';
import { isWarningOnly } from '../lib/conflictRules';

interface DragDropResult {
  handleEventDrop: (info: EventDropArg) => Promise<void>;
  handleEventResize: (info: EventResizeDoneArg) => Promise<void>;
}

interface DraggedEventProps {
  equipmentId: string;
  // null = PM sem engenheiro atribuído (extendedProps vem de event.engineer_id nullable).
  engineerId: string | null;
}

// `event.start`/`event.end` do FullCalendar vêm como Date local (meia-noite local do dia
// arrastado) — `.toISOString()` converteria para UTC e, com fuso positivo (Portugal/Espanha
// em horário de Verão), devolvia sempre o dia anterior. `format` do date-fns lê os
// componentes locais, por isso mantém o dia correcto.
function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
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
  const t = useT();
  const { validate } = useConflictEngine();
  const updateEvent = useCalendarStore((state) => state.updateEvent);
  const pushToast = useUiStore((state) => state.pushToast);

  const applyOrRevert = useCallback(
    async (params: {
      eventId: string;
      equipmentId: string;
      engineerId: string | null;
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

      const blocking = results.find((result) => result.hasConflict && !isWarningOnly(result));
      if (blocking) {
        params.revert();
        pushToast({ variant: 'error', message: conflictMessage(blocking, t) ?? t('pm.conflict') });
        return;
      }

      // Avisos não impedem gravar: carga de zona e a Regra 8 nas zonas isentas (Madrid).
      for (const warning of results.filter((result) => result.hasConflict && isWarningOnly(result))) {
        pushToast({ variant: 'warning', message: conflictMessage(warning, t) ?? t('pm.zoneOverload') });
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
          message: err instanceof Error ? err.message : t('pm.dragSaveFailed'),
        });
      }
    },
    [validate, updateEvent, pushToast, t],
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
