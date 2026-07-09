import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { compareSchedules, generateAnnualSchedule } from '../lib/autoScheduler';
import type { HistoricalPM, ProposedPMEvent, ScheduleComparison } from '../lib/autoScheduler';
import { useCalendarStore, useEquipmentStore, useHolidayStore } from '../stores';

interface GenerateParams {
  equipmentId: string;
  targetYear: number;
  preferredEngineerId: string;
}

interface UseAutoSchedulerResult {
  generating: boolean;
  error: string | null;
  proposals: ProposedPMEvent[] | null;
  comparison: ScheduleComparison | null;
  generate: (params: GenerateParams) => Promise<void>;
  reset: () => void;
}

// Orquestra o algoritmo puro de lib/autoScheduler.ts com dados reais (histórico do ano
// anterior vem directo do Supabase; equipamento/zona/feriados/eventos vêm dos stores).
export function useAutoScheduler(): UseAutoSchedulerResult {
  const equipment = useEquipmentStore((state) => state.equipment);
  // Detecção de conflitos precisa do ano COMPLETO, não da fatia visível do calendário
  // (`events`) — senão uma PM de Novembro não é vista com o Março no ecrã. O chamador
  // garante fetchYearEvents(targetYear) antes de generate (ou, de preferência, migrar
  // para o padrão do useBulkAutoScheduler: fetchYearEventsSnapshot + parâmetro).
  const yearEvents = useCalendarStore((state) => state.yearEvents);
  const holidays = useHolidayStore((state) => state.holidays);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ProposedPMEvent[] | null>(null);
  const [comparison, setComparison] = useState<ScheduleComparison | null>(null);

  const generate = useCallback(
    async ({ equipmentId, targetYear, preferredEngineerId }: GenerateParams) => {
      setGenerating(true);
      setError(null);

      try {
        const targetEquipment = equipment.find((item) => item.id === equipmentId);
        if (!targetEquipment) {
          throw new Error('Equipamento não encontrado.');
        }

        const previousYear = targetYear - 1;
        const { data: previousEvents, error: historyError } = await supabase
          .from('pm_events')
          .select('*')
          .eq('equipment_id', equipmentId)
          .gte('start_date', `${previousYear}-01-01`)
          .lte('start_date', `${previousYear}-12-31`)
          .order('start_date');
        if (historyError) throw historyError;

        // Detecta automaticamente o histórico 'completed' do ano anterior (modo histórico);
        // se vier vazio, generateAnnualSchedule recai sozinho na distribuição base (modo 1).
        const previousYearHistory: HistoricalPM[] = previousEvents
          .filter((event) => event.status === 'completed')
          .map((event) => ({
            plannedDate: new Date(event.start_date),
            actualDate: event.actual_start_date ? new Date(event.actual_start_date) : null,
            status: event.status,
          }));

        // AUDIT-FOLLOWUP: o filtro por equipment_id limita a Regra 1 (sobreposição de
        // engenheiro) aos eventos do próprio equipamento — o useBulkAutoScheduler filtra
        // só por ano. Fora do âmbito do item J; rever se este hook ganhar consumidores.
        const existingEventsTargetYear = yearEvents.filter(
          (event) =>
            event.equipment_id === equipmentId &&
            new Date(event.start_date).getFullYear() === targetYear,
        );

        const generated = generateAnnualSchedule({
          equipmentId,
          pmPerYear: targetEquipment.pm_per_year,
          pmDurationDays: targetEquipment.pm_duration_days,
          targetYear,
          preferredEngineerId,
          holidays,
          existingEventsTargetYear,
          zoneId: targetEquipment.zone_id,
          zoneCountry: targetEquipment.hospital_country,
          hospitalLocality: targetEquipment.hospital_locality,
          hospitalCity: targetEquipment.hospital_city,
          previousYearHistory,
          // Fallback defensivo para ambientes onde a migração weekend_work ainda não
          // correu (a coluna vem undefined) — 'none' é o comportamento mais restritivo.
          weekendWork: targetEquipment.weekend_work ?? 'none',
        });

        setProposals(generated);
        setComparison(compareSchedules(previousYearHistory, generated));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao gerar plano anual.');
      } finally {
        setGenerating(false);
      }
    },
    [equipment, yearEvents, holidays],
  );

  const reset = useCallback(() => {
    setProposals(null);
    setComparison(null);
    setError(null);
  }, []);

  return { generating, error, proposals, comparison, generate, reset };
}
