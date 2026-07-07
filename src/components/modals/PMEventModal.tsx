import { useEffect, useState } from 'react';
import { addDays, format } from 'date-fns';
import { useConflictEngine } from '../../hooks';
import { useAuthStore, useCalendarStore, useEquipmentStore, useUiStore } from '../../stores';
import type { PMStatus } from '../../types';
import { Button } from '../ui';
import { PMEventForm } from './PMEventForm';

export interface PMEventModalInitial {
  date: Date;
  equipmentId?: string;
  engineerId?: string;
  /** Fim explícito (inclusivo) — vem de uma selecção de dias no calendário com um
   *  equipamento armado; quando presente, não é recalculado a partir de pm_duration_days. */
  endDate?: Date;
}

interface PMEventModalProps {
  eventId: string | null;
  initial: PMEventModalInitial | null;
  onClose: () => void;
}

function toDateInput(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

// Criar/editar evento PM — valida conflitos (useConflictEngine) antes de qualquer gravação.
export function PMEventModal({ eventId, initial, onClose }: PMEventModalProps) {
  const existing = useCalendarStore((state) => state.events.find((event) => event.id === eventId));
  const createEvent = useCalendarStore((state) => state.createEvent);
  const updateEvent = useCalendarStore((state) => state.updateEvent);
  const deleteEvent = useCalendarStore((state) => state.deleteEvent);
  const planningYear = useCalendarStore((state) => state.planningYear);
  const equipment = useEquipmentStore((state) => state.equipment);
  const setSelectedEquipmentId = useEquipmentStore((state) => state.setSelectedEquipmentId);
  const permissions = useAuthStore((state) => state.permissions);
  const pushToast = useUiStore((state) => state.pushToast);
  const { validate } = useConflictEngine();

  const readOnly = eventId ? !permissions.canEditPM : !permissions.canCreatePM;

  const initialDate = existing ? new Date(existing.start_date) : (initial?.date ?? new Date());
  const [equipmentId, setEquipmentId] = useState(existing?.equipment_id ?? initial?.equipmentId ?? '');
  const [engineerId, setEngineerId] = useState(existing?.engineer_id ?? initial?.engineerId ?? '');
  const [startDate, setStartDate] = useState(toDateInput(initialDate));
  const [endDate, setEndDate] = useState(
    toDateInput(existing ? new Date(existing.end_date) : (initial?.endDate ?? initialDate)),
  );
  const [status, setStatus] = useState<PMStatus>(existing?.status ?? 'planned');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing || initial?.endDate) return;
    const selected = equipment.find((item) => item.id === equipmentId);
    if (!selected) return;
    setEndDate(toDateInput(addDays(new Date(startDate), selected.pm_duration_days - 1)));
    setEngineerId((current) => current || selected.engineer_primary_id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentId]);

  async function handleSave() {
    if (!equipmentId || !engineerId) {
      pushToast({ variant: 'error', message: 'Seleccione equipamento e engenheiro.' });
      return;
    }

    // "obrigatório separar os anos": a PM tem de ficar inteiramente dentro do ano de
    // planeamento activo (Topbar) — nunca misturar com o ano corrente nem com outros anos.
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    if (startYear !== planningYear || endYear !== planningYear) {
      pushToast({
        variant: 'error',
        message: `Esta PM tem de ficar dentro do ano de planeamento ${planningYear}.`,
      });
      return;
    }

    const results = validate({
      equipmentId,
      engineerId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      ...(eventId ? { excludeEventId: eventId } : {}),
    });
    const blocking = results.find((result) => result.hasConflict && result.type !== 'zone_overload');
    if (blocking) {
      pushToast({ variant: 'error', message: blocking.message ?? 'Conflito ao agendar PM.' });
      return;
    }
    const warning = results.find((result) => result.hasConflict && result.type === 'zone_overload');
    if (warning) pushToast({ variant: 'warning', message: warning.message ?? 'Zona com carga elevada.' });

    setSaving(true);
    try {
      const payload = {
        equipment_id: equipmentId,
        engineer_id: engineerId,
        start_date: startDate,
        end_date: endDate,
        status,
        notes: notes || null,
      };
      if (eventId) {
        await updateEvent(eventId, payload);
      } else {
        await createEvent({ ...payload, outlook_event_id: null, actual_start_date: null, actual_end_date: null });
        // Desarma o equipamento da sidebar depois de criar com sucesso — evita criar
        // mais PMs sem querer se o utilizador clicar noutro dia mais tarde.
        setSelectedEquipmentId(null);
      }
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao gravar.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!eventId) return;
    setSaving(true);
    try {
      await deleteEvent(eventId);
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao eliminar.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-gray-900">{eventId ? 'Editar PM' : 'Nova PM'}</h2>

        <PMEventForm
          equipmentId={equipmentId}
          engineerId={engineerId}
          startDate={startDate}
          endDate={endDate}
          status={status}
          notes={notes}
          showStatus={Boolean(eventId)}
          disabled={readOnly}
          onEquipmentChange={setEquipmentId}
          onEngineerChange={setEngineerId}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onStatusChange={setStatus}
          onNotesChange={setNotes}
        />

        <div className="mt-4 flex items-center justify-between">
          {eventId && permissions.canDeletePM ? (
            <Button variant="danger" onClick={handleDelete} disabled={saving}>
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              {readOnly ? 'Fechar' : 'Cancelar'}
            </Button>
            {!readOnly && (
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                Guardar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
