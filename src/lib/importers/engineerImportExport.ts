import type { EngineerInsert, EngineerWithZones, Zone } from '../../types';
import type { ParsedImportRow } from '../spreadsheet';
import { boolToPt, findByName, parseBooleanPt, splitCsvList } from './importHelpers';

export interface EngineerImportRow {
  engineer: EngineerInsert;
  zoneIds: string[];
  primaryZoneId: string | null;
}

export function buildEngineerExportRows(engineers: EngineerWithZones[], zones: Zone[]): Record<string, unknown>[] {
  return engineers.map((engineer) => {
    const primary = engineer.zones.find((zone) => zone.is_primary);
    const primaryZone = primary ? zones.find((zone) => zone.id === primary.zone_id) : undefined;
    const otherZoneNames = engineer.zones
      .filter((zone) => !zone.is_primary)
      .map((zone) => zones.find((candidate) => candidate.id === zone.zone_id)?.name)
      .filter((name): name is string => !!name);

    return {
      Nome: engineer.name,
      Email: engineer.email,
      Telefone: engineer.phone ?? '',
      'Zona Principal': primaryZone?.name ?? '',
      'Zonas Adicionais': otherZoneNames.join(', '),
      Skills: engineer.skills.join(', '),
      Activo: boolToPt(engineer.active),
    };
  });
}

export function parseEngineerImportRows(
  raw: Record<string, string>[],
  zones: Zone[],
): ParsedImportRow<EngineerImportRow>[] {
  return raw.map((row, index) => {
    const rowNumber = index + 2;
    const name = row['Nome'];
    const email = row['Email'];
    if (!name || !email) {
      return { rowNumber, raw: row, data: null, error: 'Falta o nome ou o email.' };
    }

    const primaryZone = findByName(zones, row['Zona Principal']);
    if (row['Zona Principal'] && !primaryZone) {
      return { rowNumber, raw: row, data: null, error: `Zona principal "${row['Zona Principal']}" não encontrada.` };
    }

    const otherZoneNames = splitCsvList(row['Zonas Adicionais']);
    const otherZones: Zone[] = [];
    for (const zoneName of otherZoneNames) {
      const zone = findByName(zones, zoneName);
      if (!zone) {
        return { rowNumber, raw: row, data: null, error: `Zona adicional "${zoneName}" não encontrada.` };
      }
      otherZones.push(zone);
    }

    const zoneIds = [...new Set([...(primaryZone ? [primaryZone.id] : []), ...otherZones.map((zone) => zone.id)])];

    const data: EngineerImportRow = {
      engineer: {
        name,
        email,
        phone: row['Telefone'] || null,
        primary_zone_id: primaryZone?.id ?? null,
        skills: splitCsvList(row['Skills']),
        outlook_calendar_id: null,
        active: parseBooleanPt(row['Activo'], true),
      },
      zoneIds,
      primaryZoneId: primaryZone?.id ?? zoneIds[0] ?? null,
    };
    return { rowNumber, raw: row, data, error: null };
  });
}
