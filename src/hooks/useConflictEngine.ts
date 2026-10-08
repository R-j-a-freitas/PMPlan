import { useCallback, useMemo } from 'react';
import {
  buildEquipmentSiteIndex,
  checkPmQuota,
  checkZoneLoad,
  cityKeyOfEquipment,
  isCitySameDayExempt,
  validatePMPlacement,
} from '../lib/conflictRules';
import {
  useCalendarStore,
  useConflictStore,
  useEngineerStore,
  useEquipmentStore,
  useHolidayStore,
  usePmHolidayConfirmationStore,
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
  const holidayConfirmations = usePmHolidayConfirmationStore((state) => state.confirmations);
  const setActiveConflicts = useConflictStore((state) => state.setActiveConflicts);

  // Regras 7/8 (hospital/cidade) — classifica os eventos existentes pelo local do
  // respectivo equipamento; recalculado só quando a lista de equipamentos muda.
  const siteIndex = useMemo(() => buildEquipmentSiteIndex(equipment), [equipment]);

  const validate = useCallback(
    (params: ValidatePlacementParams): ConflictResult[] => {
      const targetEquipment = equipment.find((item) => item.id === params.equipmentId);

      if (!targetEquipment) {
        return [{ hasConflict: false }];
      }

      // As regras que comparam com outros eventos (engenheiro/hospital/cidade) vêem a
      // união da fatia visível do calendário com o ano completo do LoadMap — juntar os
      // dois pools só acrescenta detecção (uma PM de Novembro do mesmo hospital bloqueia
      // mesmo com o calendário em Março), nunca a reduz.
      const visibleIds = new Set(events.map((event) => event.id));
      const eventPool = [...events, ...yearEvents.filter((event) => !visibleIds.has(event.id))];

      // O país vem do hospital (não da zona): uma zona pode ter hospitais de PT e ES.
      const blocking = validatePMPlacement({
        engineerId: params.engineerId,
        zoneId: targetEquipment.zone_id,
        zoneCountry: targetEquipment.hospital_country,
        startDate: params.startDate,
        endDate: params.endDate,
        existingEvents: eventPool,
        holidays,
        weekendWork: targetEquipment.weekend_work,
        hospitalLocality: targetEquipment.hospital_locality,
        hospitalCity: targetEquipment.hospital_city,
        equipmentId: targetEquipment.id,
        hospitalId: targetEquipment.hospital_id,
        cityKey: cityKeyOfEquipment(targetEquipment),
        siteIndex,
        citySameDayWarningOnly: isCitySameDayExempt(targetEquipment.zone_id, zones),
        ...(params.excludeEventId
          ? {
              confirmedHolidayDates: new Set(
                holidayConfirmations
                  .filter((row) => row.pm_event_id === params.excludeEventId)
                  .map((row) => row.holiday_date.slice(0, 10)),
              ),
            }
          : {}),
        ...(params.excludeEventId ? { excludeEventId: params.excludeEventId } : {}),
      });

      const quotaResult = checkPmQuota(
        targetEquipment.id,
        targetEquipment.pm_per_year,
        params.startDate.getFullYear(),
        yearEvents,
        params.excludeEventId,
      );

      const loadWarning = checkZoneLoad(
        targetEquipment.zone_id,
        params.startDate.getFullYear(),
        yearEvents,
        engineers,
        equipment,
        zones,
      );

      const results = [
        ...blocking,
        ...(quotaResult.hasConflict ? [quotaResult] : []),
        ...(loadWarning.hasConflict ? [loadWarning] : []),
      ];
      setActiveConflicts(results);
      return results;
    },
    [events, yearEvents, holidays, equipment, engineers, zones, siteIndex, holidayConfirmations, setActiveConflicts],
  );

  return { validate };
}
