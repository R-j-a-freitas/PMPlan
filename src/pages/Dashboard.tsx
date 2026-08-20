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
  const fetchYearEvents = useCalendarStore((state) => state.fetchYearEvents);
  useHolidays(planningYear);

  useEffect(() => {
    fetchZones();
    fetchHospitals();
    fetchEquipment();
    fetchEngineers();
  }, [fetchZones, fetchHospitals, fetchEquipment, fetchEngineers]);

  // Carregar os eventos do ano de planeamento sempre que ele mudar — usado só pelo
  // LoadMap (na Sidebar, montada por esta página) para as métricas de carga; não
  // condiciona a visibilidade do botão de geração (cada zona/team leader gera
  // independentemente, mesmo que outras zonas já tenham PMs criadas nesse ano).
  useEffect(() => {
    fetchYearEvents(planningYear);
  }, [planningYear, fetchYearEvents]);

  const currentYear = new Date().getFullYear();
  // Botão visível para o ano corrente ou futuros: planear 2027 em 2026, ou gerar o
  // próprio 2026. Fica sempre disponível independentemente de já existirem PMs nesse
  // ano — o AutoSchedulerModal é que decide, por equipamento, o que pode (re)gerar.
  const showGenerateButton = canCreatePM && planningYear >= currentYear;

  return (
    // O calendário é o único ecrã sem PageShell: ocupa o viewport todo, a branco e sem
    // moldura de cartão, porque é ele o "documento" desta página (secção 10).
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden bg-white">
          <CalendarToolbar
            calendarRef={calendarRef}
            rightSlot={
              showGenerateButton ? (
                // A única acção que cria trabalho neste ecrã — primária, e agora a única
                // coisa azul da barra (as vistas passaram a controlo segmentado).
                <Button onClick={() => setShowAutoScheduler(true)}>⚡ Gerar Plano Anual</Button>
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
