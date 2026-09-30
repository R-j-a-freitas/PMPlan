import { useCallback, useState } from 'react';
import { format } from 'date-fns';
import { proposeRemainingPMs } from '../lib/autoScheduler';
import type { ProposedPMEvent } from '../lib/autoScheduler';
import { resolveApprovalTrack } from '../lib/approvalTrack';
import { buildEquipmentSiteIndex, cityKeyOfEquipment, listPmEventsForEquipmentInYear } from '../lib/conflictRules';
import { defaultCalendarLabel } from '../lib/pmLabels';
import {
  createSourceChangesForEvents,
  fetchYearEventsSnapshot,
  useCalendarStore,
  useEquipmentStore,
  useHolidayStore,
  useModalityStore,
} from '../stores';
import type { PMEvent, PMEventInsert } from '../types';

interface SaveOutcome {
  created: number;
  /** false = as PMs ficaram gravadas mas o registo das trocas de fonte falhou. */
  sourceChangesOk: boolean;
}

interface UsePlanRemainingPMsResult {
  proposals: ProposedPMEvent[] | null;
  busy: boolean;
  /** Calcula as PMs em falta do equipamento da PM âncora (não grava nada). */
  propose: (anchor: PMEvent, engineerId: string) => Promise<ProposedPMEvent[]>;
  /** Grava as propostas actuais. */
  save: () => Promise<SaveOutcome>;
  reset: () => void;
}

// Botão "Planear PM" do modal de edição: completa o plano anual de um equipamento a
// partir da PM aberta, quando ainda não há todas as PMs contratadas marcadas (nem pela
// ancoragem ao ano anterior nem pela geração automática). Mesmos dados e regras do
// AutoSchedulerModal — eventos do ano via consulta pura, para não mexer nos yearEvents.
export function usePlanRemainingPMs(): UsePlanRemainingPMsResult {
  const equipment = useEquipmentStore((state) => state.equipment);
  const holidays = useHolidayStore((state) => state.holidays);
  const modalities = useModalityStore((state) => state.modalities);
  const createBulkEvents = useCalendarStore((state) => state.createBulkEvents);

  const [proposals, setProposals] = useState<ProposedPMEvent[] | null>(null);
  const [busy, setBusy] = useState(false);

  const propose = useCallback(
    async (anchor: PMEvent, engineerId: string) => {
      const target = equipment.find((item) => item.id === anchor.equipment_id);
      if (!target) throw new Error('Equipamento não encontrado.');
      setBusy(true);
      try {
        const anchorDate = new Date(anchor.start_date);
        const targetYear = anchorDate.getFullYear();
        const yearEvents = await fetchYearEventsSnapshot(targetYear);
        const proposed = proposeRemainingPMs({
            equipmentId: target.id,
            pmPerYear: target.pm_per_year,
            pmDurationDays: target.pm_duration_days,
            targetYear,
            preferredEngineerId: engineerId || target.engineer_primary_id || '',
            holidays,
            existingEventsTargetYear: yearEvents,
            zoneId: target.zone_id,
            zoneCountry: target.hospital_country,
            hospitalLocality: target.hospital_locality,
            hospitalCity: target.hospital_city,
            weekendWork: target.weekend_work ?? 'none',
            hospitalId: target.hospital_id,
            cityKey: cityKeyOfEquipment(target),
            siteIndex: buildEquipmentSiteIndex(equipment),
            anchorDate,
            bookedEventsTargetYear: listPmEventsForEquipmentInYear(target.id, targetYear, yearEvents),
        });
        setProposals(proposed.length > 0 ? proposed : null);
        return proposed;
      } finally {
        setBusy(false);
      }
    },
    [equipment, holidays],
  );

  const save = useCallback(async () => {
    if (!proposals || proposals.length === 0) return { created: 0, sourceChangesOk: true };
    setBusy(true);
    try {
      const rows: PMEventInsert[] = proposals.map((proposal) => {
        const target = equipment.find((item) => item.id === proposal.equipmentId);
        const label = target ? defaultCalendarLabel(resolveApprovalTrack(target.modality, modalities)) : 'PM';
        return {
          equipment_id: proposal.equipmentId,
          engineer_id: proposal.engineerId || null,
          start_date: format(proposal.proposedStartDate, 'yyyy-MM-dd'),
          end_date: format(proposal.proposedEndDate, 'yyyy-MM-dd'),
          actual_start_date: null,
          actual_end_date: null,
          status: 'planned',
          outlook_event_id: null,
          calendar_label: label,
          notes: proposal.adjustmentReason
            ? `Planeada a partir da PM marcada. ${proposal.adjustmentReason}`
            : 'Planeada a partir da PM marcada.',
        };
      });
      const created = await createBulkEvents(rows);
      // Trocas de fonte das PMs "PM + SCRX" — falhar aqui não desfaz as PMs criadas.
      let sourceChangesOk = true;
      try {
        await createSourceChangesForEvents(created);
      } catch {
        sourceChangesOk = false;
      }
      setProposals(null);
      return { created: created.length, sourceChangesOk };
    } finally {
      setBusy(false);
    }
  }, [proposals, equipment, modalities, createBulkEvents]);

  const reset = useCallback(() => setProposals(null), []);

  return { proposals, busy, propose, save, reset };
}
