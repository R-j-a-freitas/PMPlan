import { useEffect, useRef, useState } from 'react';
import type FullCalendar from '@fullcalendar/react';
import { Topbar } from '../app/Topbar';
import { Sidebar } from '../components/sidebar';
import { CalendarToolbar, MainCalendar } from '../components/calendar';
import { AutoSchedulerModal, PMEventModal } from '../components/modals';
import type { PMEventModalInitial } from '../components/modals';
import { useHolidays } from '../hooks';
import { useAuthStore, useCalendarStore, useEngineerStore, useEquipmentStore, useHospitalStore, useZoneStore } from '../stores';
import { Button } from '../components/ui';

interface ModalState {
  eventId: string | null;
  initial: PMEventModalInitial | null;
}

// Página principal — o calendário é o elemento central e dominante (secção 1).
export function Dashboard() {
  const calendarRef = useRef<FullCalendar>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [showAutoScheduler, setShowAutoScheduler] = useState(false);

  const fetchZones = useZoneStore((state) => state.fetchZones);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const fetchEquipment = useEquipmentStore((state) => state.fetchEquipment);
  const fetchEngineers = useEngineerStore((state) => state.fetchEngineers);
  const canCreatePM = useAuthStore((state) => state.permissions.canCreatePM);
  // Feriados do ano de planeamento activo (Topbar), não do ano civil corrente —
  // planear 2027 em 2026 precisa dos feriados de 2027, não dos de 2026.
  const planningYear = useCalendarStore((state) => state.planningYear);
  const yearEvents = useCalendarStore((state) => state.yearEvents);
  const yearEventsLoading = useCalendarStore((state) => state.yearEventsLoading);
  const fetchYearEvents = useCalendarStore((state) => state.fetchYearEvents);
  useHolidays(planningYear);

  useEffect(() => {
    fetchZones();
    fetchHospitals();
    fetchEquipment();
    fetchEngineers();
  }, [fetchZones, fetchHospitals, fetchEquipment, fetchEngineers]);

  // Carregar os eventos do ano de planeamento sempre que ele mudar — necessário para
  // saber se o ano já tem PMs criadas (condição de visibilidade do botão de geração).
  useEffect(() => {
    fetchYearEvents(planningYear);
  }, [planningYear, fetchYearEvents]);

  const currentYear = new Date().getFullYear();
  const yearHasActivePMs = yearEvents.some((e) => e.status !== 'cancelled');
  // Botão só visível para anos futuros sem PMs activas: planear 2027 em 2026, desde que
  // o ano 2027 ainda não tenha qualquer PM planeada ou aprovada.
  const showGenerateButton =
    canCreatePM && planningYear > currentYear && !yearHasActivePMs && !yearEventsLoading;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <CalendarToolbar
            calendarRef={calendarRef}
            rightSlot={
              showGenerateButton ? (
                <Button variant="secondary" onClick={() => setShowAutoScheduler(true)}>
                  ⚡ Gerar Plano Anual
                </Button>
              ) : undefined
            }
          />
          <div className="flex-1 overflow-hidden">
            <MainCalendar
              calendarRef={calendarRef}
              onSelectEvent={(eventId) => setModalState({ eventId, initial: null })}
              onCreateEvent={(date, prefill) => setModalState({ eventId: null, initial: { date, ...prefill } })}
            />
          </div>
        </div>
      </div>

      {modalState && (
        <PMEventModal
          eventId={modalState.eventId}
          initial={modalState.initial}
          onClose={() => setModalState(null)}
        />
      )}

      {showAutoScheduler && (
        <AutoSchedulerModal
          defaultYear={planningYear}
          onClose={() => setShowAutoScheduler(false)}
        />
      )}
    </div>
  );
}
