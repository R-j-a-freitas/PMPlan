import { useEffect, useMemo, useState } from 'react';
import { findPmsOnHolidays, splitPmsOnHolidays, type PmOnHoliday } from '../../lib/conflictRules';
import { toDisplayDate } from '../../lib/dateFormat';
import {
  confirmedHolidayDatesByEvent,
  fetchYearEventsSnapshot,
  useAuthStore,
  useEquipmentStore,
  usePmHolidayConfirmationStore,
  useUiStore,
} from '../../stores';
import type { Holiday, PMEvent, PmHolidayConfirmationReason } from '../../types';
import { Badge, Button, Card, EmptyState, FormModal } from '../ui';
import type { TFunction, TranslationKey } from '../../i18n';

interface PmsOnHolidaysCardProps {
  t: TFunction;
  year: number;
  /** Os feriados do ano em vista — os mesmos que a página mostra. */
  holidays: Holiday[];
}

const SCOPE_KEYS: Record<Holiday['type'], TranslationKey> = {
  national: 'holidays.onPm.scope.national',
  regional: 'holidays.onPm.scope.regional',
  local: 'holidays.onPm.scope.local',
};

const STATUS_KEYS: Partial<Record<string, TranslationKey>> = {
  planned: 'holidays.onPm.status.planned',
  confirmed: 'holidays.onPm.status.confirmed',
  delayed: 'holidays.onPm.status.delayed',
  in_progress: 'holidays.onPm.status.in_progress',
};

const REASONS: { value: PmHolidayConfirmationReason; key: TranslationKey }[] = [
  { value: 'client_request', key: 'holidays.onPm.reason.client_request' },
  { value: 'other_engineer', key: 'holidays.onPm.reason.other_engineer' },
  { value: 'other', key: 'holidays.onPm.reason.other' },
];

const pmDates = (event: PMEvent) =>
  event.start_date === event.end_date
    ? toDisplayDate(event.start_date)
    : `${toDisplayDate(event.start_date)} → ${toDisplayDate(event.end_date)}`;

// Revisão das PMs já marcadas que caem num feriado (lib/conflictRules.findPmsOnHolidays).
// Vive na página Feriados porque é aqui que os feriados mudam — importação do BOE, regras
// das fiestas locales — e é logo a seguir a uma mudança que interessa ver o que apanhou.
// Uma PM pode estar certa de propósito (o cliente pediu o dia, vai outro engenheiro): quem
// pode editar PMs confirma-a com o motivo, e ela passa para a lista das confirmadas
// (migração 0029). As PMs do ano vêm por consulta própria, para o ano escolhido aqui não
// ter de ser o ano de planeamento.
export function PmsOnHolidaysCard({ t, year, holidays }: PmsOnHolidaysCardProps) {
  const equipment = useEquipmentStore((state) => state.equipment);
  const canConfirm = useAuthStore((state) => state.permissions.canEditPM);
  const profile = useAuthStore((state) => state.profile);
  const confirmations = usePmHolidayConfirmationStore((state) => state.confirmations);
  const fetchConfirmations = usePmHolidayConfirmationStore((state) => state.fetchConfirmations);
  const confirm = usePmHolidayConfirmationStore((state) => state.confirm);
  const undo = usePmHolidayConfirmationStore((state) => state.undo);
  const pushToast = useUiStore((state) => state.pushToast);

  const [events, setEvents] = useState<PMEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirming, setConfirming] = useState<PmOnHoliday | null>(null);
  const [reason, setReason] = useState<PmHolidayConfirmationReason>('client_request');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(null);
    Promise.all([fetchYearEventsSnapshot(year), fetchConfirmations()])
      .then(([data]) => {
        if (!cancelled) setEvents(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [year, reloadKey, fetchConfirmations]);

  const { pending, confirmed } = useMemo(() => {
    if (!events) return { pending: [], confirmed: [] };
    return splitPmsOnHolidays(
      findPmsOnHolidays(events, equipment, holidays),
      confirmedHolidayDatesByEvent(confirmations),
    );
  }, [events, equipment, holidays, confirmations]);

  const statusLabel = (status: string) => {
    const key = STATUS_KEYS[status];
    return key ? t(key) : status;
  };

  function openConfirm(row: PmOnHoliday) {
    setConfirming(row);
    setReason('client_request');
    setNotes('');
  }

  async function handleConfirm() {
    if (!confirming) return;
    setSaving(true);
    try {
      await confirm(
        confirming.holidays.map((holiday) => ({
          pm_event_id: confirming.event.id,
          holiday_date: holiday.date.slice(0, 10),
          reason,
          notes: notes.trim() || null,
          confirmed_by_name: profile?.name || profile?.email || null,
        })),
      );
      setConfirming(null);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('holidays.onPm.confirmFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function handleUndo(row: PmOnHoliday) {
    try {
      await undo(
        row.event.id,
        row.holidays.map((holiday) => holiday.date.slice(0, 10)),
      );
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('holidays.onPm.confirmFailed') });
    }
  }

  const holidayCell = (hits: Holiday[]) =>
    hits.map((holiday) => (
      <div key={holiday.id}>
        <span className="font-medium">{toDisplayDate(holiday.date)}</span> {holiday.name}{' '}
        <span className="text-xs text-gray-500">
          ({holiday.zone_id ? t('holidays.onPm.scope.zone') : t(SCOPE_KEYS[holiday.type])})
        </span>
      </div>
    ));

  const confirmationOf = (row: PmOnHoliday) =>
    confirmations.find(
      (item) => item.pm_event_id === row.event.id && item.holiday_date.slice(0, 10) === row.holidays[0]?.date.slice(0, 10),
    );

  const title = (
    <span className="flex items-center gap-2">
      {t('holidays.onPm.title', { year })}
      {events && <Badge tone={pending.length > 0 ? 'danger' : 'success'}>{pending.length}</Badge>}
    </span>
  );

  return (
    <Card
      padded={false}
      title={title}
      actions={
        <Button variant="ghost" size="sm" onClick={() => setReloadKey((key) => key + 1)} disabled={!events}>
          {t('holidays.onPm.reload')}
        </Button>
      }
    >
      {error ? (
        <EmptyState>{t('holidays.onPm.error', { error })}</EmptyState>
      ) : !events ? (
        <EmptyState>{t('holidays.onPm.loading')}</EmptyState>
      ) : (
        <>
          {pending.length === 0 ? (
            <EmptyState>{t('holidays.onPm.none', { year })}</EmptyState>
          ) : (
            <>
              <p className="px-4 pt-3 text-sm text-gray-600">{t('holidays.onPm.hint')}</p>
              <div className="overflow-x-auto">
                <table className="pm-table">
                  <thead>
                    <tr>
                      <th>{t('holidays.onPm.col.pm')}</th>
                      <th>{t('holidays.onPm.col.equipment')}</th>
                      <th>{t('holidays.onPm.col.hospital')}</th>
                      <th>{t('holidays.onPm.col.zone')}</th>
                      <th>{t('holidays.onPm.col.holiday')}</th>
                      <th>{t('holidays.onPm.col.status')}</th>
                      {canConfirm && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((row) => (
                      <tr key={row.event.id}>
                        <td className="whitespace-nowrap py-1.5 pr-2">{pmDates(row.event)}</td>
                        <td className="py-1.5 pr-2">{row.equipment?.name ?? '—'}</td>
                        <td className="py-1.5 pr-2">{row.equipment?.hospital_name ?? '—'}</td>
                        <td className="py-1.5 pr-2">
                          <Badge variant="neutral">{row.equipment?.zone_code ?? '—'}</Badge>
                        </td>
                        <td className="py-1.5 pr-2">{holidayCell(row.holidays)}</td>
                        <td className="py-1.5 pr-2">{statusLabel(row.event.status)}</td>
                        {canConfirm && (
                          <td className="py-1.5 pr-2 text-right">
                            <Button variant="secondary" size="sm" onClick={() => openConfirm(row)}>
                              {t('holidays.onPm.confirm')}
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {confirmed.length > 0 && (
            <details className="border-t border-gray-100 px-4 py-2 text-sm">
              <summary className="cursor-pointer font-medium text-gray-700">
                {t('holidays.onPm.confirmedTitle', { count: confirmed.length })}
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="pm-table">
                  <thead>
                    <tr>
                      <th>{t('holidays.onPm.col.pm')}</th>
                      <th>{t('holidays.onPm.col.equipment')}</th>
                      <th>{t('holidays.onPm.col.hospital')}</th>
                      <th>{t('holidays.onPm.col.holiday')}</th>
                      <th>{t('holidays.onPm.col.reason')}</th>
                      <th>{t('holidays.onPm.col.confirmedBy')}</th>
                      {canConfirm && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {confirmed.map((row) => {
                      const info = confirmationOf(row);
                      const reasonKey = REASONS.find((item) => item.value === info?.reason)?.key;
                      return (
                        <tr key={row.event.id}>
                          <td className="whitespace-nowrap py-1.5 pr-2">{pmDates(row.event)}</td>
                          <td className="py-1.5 pr-2">{row.equipment?.name ?? '—'}</td>
                          <td className="py-1.5 pr-2">{row.equipment?.hospital_name ?? '—'}</td>
                          <td className="py-1.5 pr-2">{holidayCell(row.holidays)}</td>
                          <td className="py-1.5 pr-2">
                            {reasonKey ? t(reasonKey) : '—'}
                            {info?.notes && <div className="text-xs text-gray-500">{info.notes}</div>}
                          </td>
                          <td className="py-1.5 pr-2 text-xs text-gray-600">
                            {info?.confirmed_by_name ?? '—'}
                            {info && <div>{toDisplayDate(info.confirmed_at.slice(0, 10))}</div>}
                          </td>
                          {canConfirm && (
                            <td className="py-1.5 pr-2 text-right">
                              <Button variant="ghost" size="sm" onClick={() => handleUndo(row)}>
                                {t('holidays.onPm.undo')}
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      {confirming && (
        <FormModal
          title={t('holidays.onPm.confirmTitle')}
          submitLabel={t('holidays.onPm.confirm')}
          saving={saving}
          canSubmit={reason !== 'other' || notes.trim().length > 0}
          onCancel={() => setConfirming(null)}
          onSubmit={handleConfirm}
        >
          <div className="col-span-2 text-sm text-gray-700">
            <div className="font-medium">
              {confirming.equipment?.name} — {confirming.equipment?.hospital_name}
            </div>
            <div>{pmDates(confirming.event)}</div>
            <div className="mt-1">{holidayCell(confirming.holidays)}</div>
          </div>
          <fieldset className="col-span-2 flex flex-col gap-1.5 text-sm">
            <legend className="mb-1 font-medium text-gray-700">{t('holidays.onPm.reasonLabel')}</legend>
            {REASONS.map((item) => (
              <label key={item.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="pm-holiday-reason"
                  checked={reason === item.value}
                  onChange={() => setReason(item.value)}
                />
                {t(item.key)}
              </label>
            ))}
          </fieldset>
          <textarea
            className="col-span-2 pm-field"
            rows={3}
            placeholder={reason === 'other' ? t('holidays.onPm.notesRequired') : t('holidays.onPm.notesOptional')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormModal>
      )}
    </Card>
  );
}
