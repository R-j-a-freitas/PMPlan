import type { EngineerInsert, EngineerWithZones, Zone } from '../../types';
import type { ImportRef, ParsedImportRow } from '../spreadsheet';
import type { ImportAliases } from './importHelpers';
import { boolToPt, parseBooleanPt, resolveRef, splitCsvList } from './importHelpers';

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
  aliases: ImportAliases = {},
): ParsedImportRow<EngineerImportRow>[] {
  return raw.map((row, index) => {
    const rowNumber = index + 2;
    const name = row['Nome'];
    const email = row['Email'];
    if (!name || !email) {
      return { rowNumber, raw: row, data: null, error: 'Falta o nome ou o email.', refs: [] };
    }

    // Todas as zonas da linha de uma vez — um engenheiro traz várias e não vale a pena
    // obrigar a resolver uma por passagem.
    const refs: ImportRef[] = [];
    const errors: string[] = [];

    const primaryZone = resolveRef(zones, 'zone', row['Zona Principal'], aliases);
    if (row['Zona Principal']) {
      refs.push({
        kind: 'zone',
        column: 'Zona Principal',
        value: row['Zona Principal'],
        resolvedId: primaryZone?.id ?? null,
      });
      if (!primaryZone) errors.push(`Zona principal "${row['Zona Principal']}" não encontrada.`);
    }

    const otherZones: Zone[] = [];
    for (const zoneName of splitCsvList(row['Zonas Adicionais'])) {
      const zone = resolveRef(zones, 'zone', zoneName, aliases);
      refs.push({ kind: 'zone', column: 'Zonas Adicionais', value: zoneName, resolvedId: zone?.id ?? null });
      if (!zone) {
        errors.push(`Zona adicional "${zoneName}" não encontrada.`);
        continue;
      }
      otherZones.push(zone);
    }

    if (errors.length > 0) {
      return { rowNumber, raw: row, data: null, error: errors.join(' '), refs };
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
    return { rowNumber, raw: row, data, error: null, refs };
  });
}
