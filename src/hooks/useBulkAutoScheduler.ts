import { useCallback, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { compareSchedules, generateAnnualSchedule } from '../lib/autoScheduler';
import type { HistoricalPM, ProposedPMEvent, ScheduleComparison } from '../lib/autoScheduler';
import { useEquipmentStore, useHolidayStore } from '../stores';
import type { PMEvent } from '../types';

export interface BulkSchedulerResult {
  equipmentId: string;
  equipmentName: string;
  hospitalName: string;
  zoneCode: string;
  zoneColor: string;
  proposals: ProposedPMEvent[];
  comparison: ScheduleComparison | null;
  error?: string;
}

interface GenerateParams {
  equipmentIds: string[];
  targetYear: number;
  /** Eventos existentes do ano alvo — vêm de fetchYearEventsSnapshot (consulta pura),
   *  não do store, para a geração nunca sobrepor os yearEvents do planningYear da UI. */
  existingEvents: PMEvent[];
}

interface UseBulkAutoSchedulerReturn {
  generating: boolean;
  progress: { current: number; total: number };
  results: BulkSchedulerResult[];
  generate: (params: GenerateParams) => Promise<void>;
  reset: () => void;
}

// Converte uma ProposedPMEvent numa PMEvent mínima compatível com checkEngineerOverlap,
// para que os equipamentos processados a seguir consigam evitar conflitos de engenheiro
// com as propostas já geradas no mesmo lote.
function proposalToVirtualEvent(p: ProposedPMEvent): PMEvent {
  return {
    id: `__virtual__${p.equipmentId}_${p.proposedStartDate.toISOString()}`,
    equipment_id: p.equipmentId,
    engineer_id: p.engineerId,
    start_date: format(p.proposedStartDate, 'yyyy-MM-dd'),
    end_date: format(p.proposedEndDate, 'yyyy-MM-dd'),
    actual_start_date: null,
    actual_end_date: null,
    completed_at: null,
    status: 'planned',
    outlook_event_id: null,
    notes: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Orquestra o agendamento automático em lote para múltiplos equipamentos.
//
// Lógica de acumulação de conflitos: à medida que cada equipamento é processado, as
// propostas geradas são adicionadas como "eventos virtuais" ao pool de existingEvents.
// Isto garante que o equipamento N+1 nunca recebe uma data que colide com o engenheiro
// já ocupado pelas propostas do equipamento N — mesmo antes de persistir na BD.
export function useBulkAutoScheduler(): UseBulkAutoSchedulerReturn {
  const equipment = useEquipmentStore((state) => state.equipment);
  const holidays = useHolidayStore((state) => state.holidays);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<BulkSchedulerResult[]>([]);

  const generate = useCallback(
    async ({ equipmentIds, targetYear, existingEvents }: GenerateParams) => {
      setGenerating(true);
      setProgress({ current: 0, total: equipmentIds.length });
      const accumulated: BulkSchedulerResult[] = [];

      // Pool de eventos existentes + propostas já geradas (para detecção de conflitos cruzados)
      let virtualPool: PMEvent[] = [...existingEvents];

      for (let i = 0; i < equipmentIds.length; i++) {
        const equipmentId = equipmentIds[i];
        if (!equipmentId) continue;
        setProgress({ current: i + 1, total: equipmentIds.length });

        const targetEquipment = equipment.find((item) => item.id === equipmentId);
        if (!targetEquipment) {
          accumulated.push({
            equipmentId,
            equipmentName: '—',
            hospitalName: '—',
            zoneCode: '—',
            zoneColor: '#ccc',
            proposals: [],
            comparison: null,
            error: 'Equipamento não encontrado no store.',
          });
          continue;
        }

        // Engenheiro preferido: primário do equipamento; se nulo, deixar string vazia
        // (o scheduler irá gerar sem engenheiro, o utilizador corrige no modal de revisão)
        const preferredEngineerId = targetEquipment.engineer_primary_id ?? '';

        try {
          const previousYear = targetYear - 1;
          const { data: previousEvents, error: historyError } = await supabase
            .from('pm_events')
            .select('*')
            .eq('equipment_id', equipmentId)
            .gte('start_date', `${previousYear}-01-01`)
            .lte('start_date', `${previousYear}-12-31`)
            .order('start_date');
          if (historyError) throw historyError;

          const previousYearHistory: HistoricalPM[] = previousEvents
            .filter((event) => event.status === 'completed')
            .map((event) => ({
              plannedDate: new Date(event.start_date),
              actualDate: event.actual_start_date ? new Date(event.actual_start_date) : null,
              status: event.status,
            }));

          const existingEventsTargetYear = virtualPool.filter(
            (event) => new Date(event.start_date).getFullYear() === targetYear,
          );

          const proposals = generateAnnualSchedule({
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

          // Adicionar propostas geradas ao pool virtual para os próximos equipamentos
          virtualPool = [...virtualPool, ...proposals.map(proposalToVirtualEvent)];

          accumulated.push({
            equipmentId,
            equipmentName: targetEquipment.name,
            hospitalName: targetEquipment.hospital_name,
            zoneCode: targetEquipment.zone_code,
            zoneColor: targetEquipment.zone_color,
            proposals,
            comparison: compareSchedules(previousYearHistory, proposals),
          });
        } catch (err) {
          accumulated.push({
            equipmentId,
            equipmentName: targetEquipment.name,
            hospitalName: targetEquipment.hospital_name,
            zoneCode: targetEquipment.zone_code,
            zoneColor: targetEquipment.zone_color,
            proposals: [],
            comparison: null,
            error: err instanceof Error ? err.message : 'Erro desconhecido.',
          });
        }
      }

      setResults(accumulated);
      setGenerating(false);
    },
    [equipment, holidays],
  );

  const reset = useCallback(() => {
    setResults([]);
    setProgress({ current: 0, total: 0 });
  }, []);

  return { generating, progress, results, generate, reset };
}
