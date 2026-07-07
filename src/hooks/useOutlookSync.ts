import { useCallback, useState } from 'react';
import { createOutlookEvent, getEngineerAvailability, updateOutlookEvent } from '../lib/graphClient';
import { useCalendarStore } from '../stores';
import type { ConflictResult, EquipmentFull, Hospital, PMEvent } from '../types';

interface UseOutlookSyncResult {
  syncing: boolean;
  error: string | null;
  pushEventToOutlook: (
    pm: PMEvent,
    equipment: EquipmentFull,
    hospital: Pick<Hospital, 'name'>,
  ) => Promise<void>;
  checkEngineerUnavailable: (
    engineerEmail: string,
    startDate: Date,
    endDate: Date,
  ) => Promise<ConflictResult>;
}

// Fase 3 do roteiro (secção 14) — requer MSAL configurado (VITE_MSAL_CLIENT_ID/TENANT_ID).
// Mantido fora do caminho crítico do drag-and-drop da Fase 1/2: chamado explicitamente
// pelo PMEventModal/ConflictModal quando o utilizador pede sincronização ou disponibilidade.
export function useOutlookSync(): UseOutlookSyncResult {
  const updateEvent = useCalendarStore((state) => state.updateEvent);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pushEventToOutlook = useCallback(
    async (pm: PMEvent, equipment: EquipmentFull, hospital: Pick<Hospital, 'name'>) => {
      setSyncing(true);
      setError(null);
      try {
        if (pm.outlook_event_id) {
          await updateOutlookEvent(pm.outlook_event_id, pm, equipment, hospital);
        } else {
          const outlookEventId = await createOutlookEvent(pm, equipment, hospital);
          await updateEvent(pm.id, { outlook_event_id: outlookEventId });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao sincronizar com o Outlook.');
        throw err;
      } finally {
        setSyncing(false);
      }
    },
    [updateEvent],
  );

  const checkEngineerUnavailable = useCallback(
    async (engineerEmail: string, startDate: Date, endDate: Date): Promise<ConflictResult> => {
      const slots = await getEngineerAvailability(
        engineerEmail,
        startDate.toISOString(),
        endDate.toISOString(),
      );
      const busy = slots.find((slot) => slot.status === 'busy' || slot.status === 'oof');
      if (!busy) return { hasConflict: false };
      return {
        hasConflict: true,
        type: 'engineer_unavailable',
        message: `Engenheiro indisponível no Outlook entre ${busy.start} e ${busy.end}.`,
      };
    },
    [],
  );

  return { syncing, error, pushEventToOutlook, checkEngineerUnavailable };
}
