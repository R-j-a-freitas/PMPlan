import { useEffect, useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { useConflictEngine, usePlanRemainingPMs } from '../../hooks';
import { useAuthStore, useCalendarStore, useEquipmentStore, useUiStore } from '../../stores';
import { findEngineerOverlapInReassign, listPmEventsForEquipmentInYear } from '../../lib/conflictRules';
import { toDisplayDate } from '../../lib/dateFormat';
import type { PMStatus } from '../../types';
import { Button, Modal } from '../ui';
import { PMEventForm } from './PMEventForm';
import { RemainingPMsPreview } from './RemainingPMsPreview';
import { useT } from '../../i18n';
import { conflictMessage } from '../../i18n/labels';

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
  const t = useT();
  const existing = useCalendarStore((state) => state.events.find((event) => event.id === eventId));
  const createEvent = useCalendarStore((state) => state.createEvent);
  const updateEvent = useCalendarStore((state) => state.updateEvent);
  const updateEvents = useCalendarStore((state) => state.updateEvents);
  const deleteEvent = useCalendarStore((state) => state.deleteEvent);
  const planningYear = useCalendarStore((state) => state.planningYear);
  const events = useCalendarStore((state) => state.events);
  const yearEvents = useCalendarStore((state) => state.yearEvents);
  const equipment = useEquipmentStore((state) => state.equipment);
  const setSelectedEquipmentId = useEquipmentStore((state) => state.setSelectedEquipmentId);
  const permissions = useAuthStore((state) => state.permissions);
  const role = useAuthStore((state) => state.profile?.role);
  const pushToast = useUiStore((state) => state.pushToast);
  const { validate } = useConflictEngine();
  const planRemaining = usePlanRemainingPMs();

  const readOnly = eventId ? !permissions.canEditPM : !permissions.canCreatePM;

  const initialDate = existing ? new Date(existing.start_date) : (initial?.date ?? new Date());
  const [equipmentId, setEquipmentId] = useState(existing?.equipment_id ?? initial?.equipmentId ?? '');
  const [engineerId, setEngineerId] = useState(existing?.engineer_id ?? initial?.engineerId ?? '');
  const [startDate, setStartDate] = useState(toDateInput(initialDate));
  const [endDate, setEndDate] = useState(
    toDateInput(existing ? new Date(existing.end_date) : (initial?.endDate ?? initialDate)),
  );
  const [status, setStatus] = useState<PMStatus>(existing?.status ?? 'planned');
  // O planner só apaga PMs ainda não realizadas — é o que a RLS permite
  // (pm_events_planner_delete_draft). Decide pelo estado GRAVADO, não pelo do formulário:
  // mudar o select para 'planned' não torna apagável uma PM já concluída.
  const canDelete =
    permissions.canDeletePM &&
    (role === 'admin' || existing?.status === 'planned' || existing?.status === 'delayed');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [applyEngineerToAll, setApplyEngineerToAll] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing || initial?.endDate) return;
    const selected = equipment.find((item) => item.id === equipmentId);
    if (!selected) return;
    setEndDate(toDateInput(addDays(new Date(startDate), selected.pm_duration_days - 1)));
    setEngineerId((current) => current || selected.engineer_primary_id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentId]);

  // PMs já planeadas no ano deste equipamento vs. o contratado ("PM/ano" no formulário de
  // equipamento) — mostrado aqui (contagem + datas expansíveis) para o utilizador ver a quota
  // antes de tentar gravar. Ao contrário do bloqueio em checkPmQuota (que exclui o próprio
  // evento em edição para poder validar a gravação), esta lista NÃO exclui o evento actual —
  // tem de reflectir o nº real de PMs já agendadas, incluindo a que está a ser editada.
  const pmQuota = useMemo(() => {
    const selected = equipment.find((item) => item.id === equipmentId);
    if (!selected) return null;
    const year = new Date(startDate).getFullYear() || planningYear;
    const dates = listPmEventsForEquipmentInYear(selected.id, year, yearEvents);
    return { count: dates.length, max: selected.pm_per_year, year, dates };
  }, [equipment, equipmentId, startDate, yearEvents, planningYear]);

  // Reatribuição em bloco (opção "aplicar a todas"): as OUTRAS PMs do mesmo equipamento no
  // mesmo ano que ficariam com o engenheiro escolhido. Ficam de fora as canceladas (que
  // listPmEventsForEquipmentInYear já exclui), as concluídas — aí o engenheiro é o registo
  // de quem fez o trabalho, não uma atribuição por cumprir — e as que já têm este
  // engenheiro. Lista vazia = a opção não aparece, porque não mudaria nada.
  const engineerReassignTargets = useMemo(() => {
    if (!eventId || !equipmentId || !engineerId) return [];
    const year = new Date(startDate).getFullYear() || planningYear;
    return listPmEventsForEquipmentInYear(equipmentId, year, yearEvents, eventId).filter(
      (event) => event.status !== 'completed' && event.engineer_id !== engineerId,
    );
  }, [eventId, equipmentId, engineerId, startDate, yearEvents, planningYear]);

  // "Planear PM": só numa PM já gravada, activa, e enquanto o equipamento ainda não tem
  // todas as PMs contratadas do ano (nem via ancoragem ao ano anterior nem via geração
  // automática) — propõe as restantes a partir desta, sem gravar até o utilizador confirmar.
  const canPlanRemaining =
    Boolean(existing) &&
    existing?.status !== 'cancelled' &&
    !readOnly &&
    permissions.canCreatePM &&
    pmQuota !== null &&
    pmQuota.count < pmQuota.max;
  const previewing = planRemaining.proposals !== null;

  async function handlePlanRemaining() {
    if (!existing) return;
    // A proposta parte da PM gravada — com datas/equipamento por gravar, as novas PMs
    // ficariam espaçadas de uma data que não é a que o utilizador está a ver.
    const dirty =
      existing.start_date !== startDate || existing.end_date !== endDate || existing.equipment_id !== equipmentId;
    if (dirty) {
      pushToast({ variant: 'warning', message: t('pm.planRemainingUnsaved') });
      return;
    }
    try {
      const proposed = await planRemaining.propose(existing, engineerId);
      if (proposed.length === 0) pushToast({ variant: 'warning', message: t('pm.planRemainingNone') });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('pm.planRemainingFailed') });
    }
  }

  async function handleConfirmPlanRemaining() {
    try {
      const outcome = await planRemaining.save();
      pushToast({ variant: 'success', message: t('pm.planRemainingDone', { count: outcome.created }) });
      if (!outcome.sourceChangesOk) {
        pushToast({ variant: 'warning', message: t('scheduler.sourceChangesFailed') });
      }
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('pm.saveFailed') });
    }
  }

  // Trocar de equipamento muda o conjunto a que "aplicar a todas" se refere — desliga a
  // opção para ninguém reatribuir sem querer as PMs de outro equipamento.
  function handleEquipmentChange(id: string) {
    setEquipmentId(id);
    setApplyEngineerToAll(false);
  }

  async function handleSave() {
    if (!equipmentId || !engineerId) {
      pushToast({ variant: 'error', message: t('pm.selectEquipmentEngineer') });
      return;
    }

    // "obrigatório separar os anos": a PM tem de ficar inteiramente dentro do ano de
    // planeamento activo (Topbar) — nunca misturar com o ano corrente nem com outros anos.
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    if (startYear !== planningYear || endYear !== planningYear) {
      pushToast({ variant: 'error', message: t('pm.mustBeInPlanningYear', { year: planningYear }) });
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
      pushToast({ variant: 'error', message: conflictMessage(blocking, t) ?? t('pm.conflict') });
      return;
    }
    const warning = results.find((result) => result.hasConflict && result.type === 'zone_overload');
    if (warning) {
      pushToast({ variant: 'warning', message: conflictMessage(warning, t) ?? t('pm.zoneOverload') });
    }

    // Trocar o engenheiro nas outras PMs só reabre a Regra 1 (engenheiro sobreposto): as
    // datas, o equipamento e o hospital dessas PMs não mudam, logo as restantes regras
    // dariam o mesmo resultado que deram quando foram criadas. O pool leva a PM em edição
    // já com os valores por gravar, para a verificação ver o estado final e não o antigo.
    const reassignTargets = applyEngineerToAll ? engineerReassignTargets : [];
    if (reassignTargets.length > 0) {
      const visibleIds = new Set(events.map((event) => event.id));
      const pool = [...events, ...yearEvents.filter((event) => !visibleIds.has(event.id))].map(
        (event) =>
          event.id === eventId
            ? { ...event, engineer_id: engineerId, start_date: startDate, end_date: endDate, status }
            : event,
      );
      const clash = findEngineerOverlapInReassign(
        engineerId,
        reassignTargets.map((event) => event.id),
        pool,
      );
      if (clash) {
        pushToast({
          variant: 'error',
          message: t('pm.applyAllConflict', {
            date: toDisplayDate(clash.event.start_date),
            reason: conflictMessage(clash.conflict, t) ?? t('pm.conflict'),
          }),
        });
        return;
      }
    }

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
        if (reassignTargets.length > 0) {
          const saved = await updateEvents(
            reassignTargets.map((event) => event.id),
            { engineer_id: engineerId },
          );
          pushToast({ variant: 'success', message: t('pm.applyAllDone', { count: saved.length }) });
        }
      } else {
        await createEvent({ ...payload, outlook_event_id: null, actual_start_date: null, actual_end_date: null });
        // Desarma o equipamento da sidebar depois de criar com sucesso — evita criar
        // mais PMs sem querer se o utilizador clicar noutro dia mais tarde.
        setSelectedEquipmentId(null);
      }
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('pm.saveFailed') });
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
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('pm.deleteFailed') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={eventId ? t('pm.edit') : t('pm.new')}
      onClose={onClose}
      footer={
        previewing ? (
          <div className="flex w-full justify-end gap-2">
            <Button variant="secondary" onClick={planRemaining.reset} disabled={planRemaining.busy}>
              {t('common.back')}
            </Button>
            <Button onClick={handleConfirmPlanRemaining} disabled={planRemaining.busy}>
              {planRemaining.busy
                ? t('common.saving')
                : t('pm.planRemainingConfirm', { count: planRemaining.proposals?.length ?? 0 })}
            </Button>
          </div>
        ) : (
        // Eliminar à esquerda, longe do par Cancelar/Guardar: é a única acção deste
        // modal que não se desfaz, e não pode estar encostada à que se clica sempre.
        <div className="flex w-full items-center justify-between">
          {eventId && canDelete ? (
            <Button variant="dangerGhost" onClick={handleDelete} disabled={saving}>
              {t('common.delete')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {canPlanRemaining && (
              <Button variant="secondary" onClick={handlePlanRemaining} disabled={saving || planRemaining.busy}>
                {t('pm.planRemaining')}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              {readOnly ? t('common.close') : t('common.cancel')}
            </Button>
            {!readOnly && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            )}
          </div>
        </div>
        )
      }
    >
      <PMEventForm
          equipmentId={equipmentId}
          engineerId={engineerId}
          startDate={startDate}
          endDate={endDate}
          status={status}
          notes={notes}
          showStatus={Boolean(eventId)}
          disabled={readOnly}
          pmQuota={pmQuota}
          applyEngineerToAllCount={engineerReassignTargets.length}
          applyEngineerToAllYear={pmQuota?.year ?? planningYear}
          applyEngineerToAll={applyEngineerToAll}
          onEquipmentChange={handleEquipmentChange}
          onEngineerChange={setEngineerId}
          onApplyEngineerToAllChange={setApplyEngineerToAll}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        onStatusChange={setStatus}
        onNotesChange={setNotes}
      />
      {planRemaining.proposals && (
        <div className="mt-3">
          <RemainingPMsPreview proposals={planRemaining.proposals} />
        </div>
      )}
    </Modal>
  );
}
