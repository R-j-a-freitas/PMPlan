import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { compareSchedules, generateAnnualSchedule, proposalToVirtualEvent } from '../lib/autoScheduler';
import type { HistoricalPM, ProposedPMEvent, ScheduleComparison } from '../lib/autoScheduler';
import { buildEquipmentSiteIndex, cityKeyOfEquipment } from '../lib/conflictRules';
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

      // Regras 7/8 (hospital/cidade) precisam de saber o local de CADA evento existente
      // ou virtual — o índice cobre todos os equipamentos, não só os seleccionados.
      const siteIndex = buildEquipmentSiteIndex(equipment);

      // Regra 4: equipamentos com fim-de-semana contratado agendam PRIMEIRO — têm de
      // ficar ancorados ao sábado/domingo (+ dias adjacentes, ex: sexta), por isso ganham
      // prioridade sobre os equipamentos de dias úteis na disputa pelos mesmos dias do
      // mesmo hospital/cidade (os de semana têm muito mais alternativas válidas).
      const weekendPriority = (id: string): number =>
        (equipment.find((item) => item.id === id)?.weekend_work ?? 'none') !== 'none' ? 0 : 1;
      const orderedIds = [...equipmentIds].sort((a, b) => weekendPriority(a) - weekendPriority(b));

      // Os rascunhos (planned/delayed) do ano alvo dos equipamentos a gerar vão ser
      // substituídos ao guardar (fluxo de confirmação do AutoSchedulerModal) — saem do
      // pool de conflitos para as novas propostas não se desviarem de eventos condenados.
      // (Se o utilizador desseleccionar um equipamento na revisão, os rascunhos dele
      // sobrevivem — caso raro; qualquer conflito reaparece no motor de conflitos.)
      const generatingIds = new Set(equipmentIds);
      const replaceableDraftIds = new Set(
        existingEvents
          .filter(
            (event) =>
              generatingIds.has(event.equipment_id) &&
              (event.status === 'planned' || event.status === 'delayed'),
          )
          .map((event) => event.id),
      );

      // Pool de eventos existentes + propostas já geradas (para detecção de conflitos cruzados)
      let virtualPool: PMEvent[] = existingEvents.filter((event) => !replaceableDraftIds.has(event.id));

      for (let i = 0; i < orderedIds.length; i++) {
        const equipmentId = orderedIds[i];
        if (!equipmentId) continue;
        setProgress({ current: i + 1, total: orderedIds.length });

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

        // Âncora do ano alvo: primeira PM já marcada (não cancelada) em QUALQUER
        // equipamento do mesmo hospital. Procura-se em existingEvents (não no pool
        // filtrado) de propósito: os rascunhos a substituir também contam como âncora —
        // a data já marcada preserva-se, porque a 1.ª proposta cai exactamente nela.
        // Sem nada marcado no ano alvo → generateAnnualSchedule recai no histórico do
        // ano anterior (e, sem histórico, na distribuição base).
        const hospitalEquipmentIds = new Set(
          equipment
            .filter((item) => item.hospital_id === targetEquipment.hospital_id)
            .map((item) => item.id),
        );
        const anchorEvent = existingEvents
          .filter(
            (event) =>
              hospitalEquipmentIds.has(event.equipment_id) &&
              event.status !== 'cancelled' &&
              new Date(event.start_date).getFullYear() === targetYear,
          )
          .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

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

          // Regra 1: ancora à semana já agendada no ano anterior, esteja ou não marcada
          // 'completed' — o plano de {previousYear} reflecte a semana acordada com o
          // cliente mesmo que ninguém tenha fechado o estado da PM entretanto. Só as
          // 'cancelled' ficam de fora (mesma convenção de eventIsActive em conflictRules).
          const previousYearHistory: HistoricalPM[] = previousEvents
            .filter((event) => event.status !== 'cancelled')
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
            currentYearAnchor: anchorEvent ? new Date(anchorEvent.start_date) : null,
            hospitalId: targetEquipment.hospital_id,
            cityKey: cityKeyOfEquipment(targetEquipment),
            siteIndex,
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
