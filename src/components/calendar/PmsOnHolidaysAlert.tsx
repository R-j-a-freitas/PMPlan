import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { findPmsOnHolidays, splitPmsOnHolidays } from '../../lib/conflictRules';
import {
  confirmedHolidayDatesByEvent,
  useCalendarStore,
  useEquipmentStore,
  useHolidayStore,
  usePmHolidayConfirmationStore,
} from '../../stores';
import { useT } from '../../i18n';

// Faixa por cima do calendário quando o ano de planeamento tem PMs marcadas em dias que
// são feriado — tipicamente porque os feriados mudaram depois de o plano estar feito (BOE,
// fiestas locales). Usa os mesmos dados que o calendário já tem carregados: as PMs do ano
// (yearEvents, do LoadMap) e os feriados do ano (useHolidays no Dashboard). Sem nada a
// assinalar não ocupa espaço nenhum. As PMs confirmadas (motivo registado na página
// Feriados) não contam. Carregar aqui as confirmações serve também o motor de conflitos do
// calendário, que as usa para não bloquear a edição de uma PM confirmada.
export function PmsOnHolidaysAlert() {
  const t = useT();
  const planningYear = useCalendarStore((state) => state.planningYear);
  const yearEvents = useCalendarStore((state) => state.yearEvents);
  const allHolidays = useHolidayStore((state) => state.holidays);
  const equipment = useEquipmentStore((state) => state.equipment);
  const confirmations = usePmHolidayConfirmationStore((state) => state.confirmations);
  const fetchConfirmations = usePmHolidayConfirmationStore((state) => state.fetchConfirmations);

  useEffect(() => {
    // Falhar a leitura só deixa o aviso a contar também as confirmadas — não vale um erro.
    fetchConfirmations().catch(() => undefined);
  }, [fetchConfirmations]);

  const count = useMemo(() => {
    const holidays = allHolidays.filter((holiday) => holiday.year === planningYear);
    const events = yearEvents.filter((event) => event.start_date.startsWith(String(planningYear)));
    return splitPmsOnHolidays(findPmsOnHolidays(events, equipment, holidays), confirmedHolidayDatesByEvent(confirmations))
      .pending.length;
  }, [allHolidays, yearEvents, equipment, planningYear, confirmations]);

  if (count === 0) return null;

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-sm text-amber-900">
      <span>{t('holidays.onPm.alert', { count, year: planningYear })}</span>
      <Link to={`/holidays?year=${planningYear}`} className="shrink-0 font-medium underline hover:text-amber-700">
        {t('holidays.onPm.alertLink')}
      </Link>
    </div>
  );
}
