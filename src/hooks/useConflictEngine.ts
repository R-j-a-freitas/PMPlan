import { useCallback } from 'react';
import { checkZoneLoad, validatePMPlacement } from '../lib/conflictRules';
import {
  useCalendarStore,
  useConflictStore,
  useEngineerStore,
  useEquipmentStore,
  useHolidayStore,
  useZoneStore,
} from '../stores';
import type { ConflictResult } from '../types';

interface ValidatePlacementParams {
  equipmentId: string;
  // null = PM sem engenheiro atribuído — a Regra 1 ignora-a (ver checkEngineerOverlap).
  engineerId: string | null;
  startDate: Date;
  endDate: Date;
  excludeEventId?: string;
}

/** Compõe conflictRules (lib pura) com os stores — usado por useDragDrop e PMEventModal. */
export function useConflictEngine() {
  const events = useCalendarStore((state) => state.events);
  // checkZoneLoad precisa do ano completo (LoadMap já o mantém carregado) — `events` só
  // tem o que a vista activa do calendário tem carregado, ver calendarStore.yearEvents.
  const yearEvents = useCalendarStore((state) => state.yearEvents);
  const holidays = useHolidayStore((state) => state.holidays);
  const equipment = useEquipmentStore((state) => state.equipment);
  const engineers = useEngineerStore((state) => state.engineers);
  const zones = useZoneStore((state) => state.zones);
  const setActiveConflicts = useConflictStore((state) => state.setActiveConflicts);

  const validate = useCallback(
    (params: ValidatePlacementParams): ConflictResult[] => {
      const targetEquipment = equipment.find((item) => item.id === params.equipmentId);

      if (!targetEquipment) {
        return [{ hasConflict: false }];
      }

      // O país vem do hospital (não da zona): uma zona pode ter hospitais de PT e ES.
      const blocking = validatePMPlacement({
        engineerId: params.engineerId,
        zoneId: targetEquipment.zone_id,
        zoneCountry: targetEquipment.hospital_country,
        startDate: params.startDate,
        endDate: params.endDate,
        existingEvents: events,
        holidays,
        weekendWork: targetEquipment.weekend_work,
        hospitalLocality: targetEquipment.hospital_locality,
        hospitalCity: targetEquipment.hospital_city,
        ...(params.excludeEventId ? { excludeEventId: params.excludeEventId } : {}),
      });

      const loadWarning = checkZoneLoad(
        targetEquipment.zone_id,
        params.startDate.getFullYear(),
        yearEvents,
        engineers,
        equipment,
        zones,
      );

      const results = loadWarning.hasConflict ? [...blocking, loadWarning] : blocking;
      setActiveConflicts(results);
      return results;
    },
    [events, yearEvents, holidays, equipment, engineers, zones, setActiveConflicts],
  );

  return { validate };
}
