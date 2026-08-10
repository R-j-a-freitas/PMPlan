import type {
  EngineerWithZones,
  EquipmentFull,
  EquipmentInsert,
  HospitalWithZone,
  PmPerYear,
  WeekendWork,
} from '../../types';
import { KNOWN_MODALITIES } from '../../types';
import type { ParsedImportRow } from '../spreadsheet';
import { boolToPt, findByName, parseBooleanPt } from './importHelpers';

const VALID_PM_PER_YEAR = [1, 2, 3, 4];

// Rótulos PT do trabalho ao fim-de-semana (iguais aos da tabela de equipamentos).
const WEEKEND_WORK_EXPORT: Record<WeekendWork, string> = {
  none: 'Só úteis',
  saturday: 'Sáb',
  both: 'Sáb+Dom',
};

// Aceita os rótulos exportados e os códigos crus — omisso/desconhecido cai em 'none'
// (padrão defensivo: nunca agenda ao fim-de-semana sem indicação explícita).
function parseWeekendWork(value: string | undefined): WeekendWork {
  const normalized = (value ?? '').trim().toLowerCase();
  if (['sáb', 'sab', 'saturday', 'sábado', 'sabado'].includes(normalized)) return 'saturday';
  if (['sáb+dom', 'sab+dom', 'both', 'ambos', 'sábado+domingo'].includes(normalized)) return 'both';
  return 'none';
}

export function buildEquipmentExportRows(
  equipment: EquipmentFull[],
  engineers: EngineerWithZones[],
): Record<string, unknown>[] {
  return equipment.map((item) => ({
    Nome: item.name,
    Hospital: item.hospital_name,
    Modelo: item.model ?? '',
    Modalidade: item.modality,
    'Nº de Série': item.serial_number ?? '',
    'PM/ano': item.pm_per_year,
    'Duração PM (dias)': item.pm_duration_days,
    'Fim-de-semana': WEEKEND_WORK_EXPORT[item.weekend_work],
    'Necessita paragem': boolToPt(item.needs_shutdown),
    'Engenheiro principal': engineers.find((engineer) => engineer.id === item.engineer_primary_id)?.name ?? '',
    'Engenheiro secundário': engineers.find((engineer) => engineer.id === item.engineer_secondary_id)?.name ?? '',
    Cor: item.color,
    Activo: boolToPt(item.active),
  }));
}

interface EquipmentImportContext {
  hospitals: HospitalWithZone[];
  engineers: EngineerWithZones[];
}

export function parseEquipmentImportRows(
  raw: Record<string, string>[],
  { hospitals, engineers }: EquipmentImportContext,
): ParsedImportRow<EquipmentInsert>[] {
  return raw.map((row, index) => {
    const rowNumber = index + 2; // +1 cabeçalho, +1 índice 1-based
    const name = row['Nome'];
    if (!name) {
      return { rowNumber, raw: row, data: null, error: 'Falta o nome.' };
    }

    const hospital = findByName(hospitals, row['Hospital']);
    if (!hospital) {
      return { rowNumber, raw: row, data: null, error: `Hospital "${row['Hospital'] || ''}" não encontrado.` };
    }

    const pmPerYearRaw = Number(row['PM/ano']);
    const pmPerYear = VALID_PM_PER_YEAR.includes(pmPerYearRaw) ? (pmPerYearRaw as PmPerYear) : (1 as PmPerYear);

    const engineerPrimary = findByName(engineers, row['Engenheiro principal']);
    if (row['Engenheiro principal'] && !engineerPrimary) {
      return {
        rowNumber,
        raw: row,
        data: null,
        error: `Engenheiro principal "${row['Engenheiro principal']}" não encontrado.`,
      };
    }
    const engineerSecondary = findByName(engineers, row['Engenheiro secundário']);
    if (row['Engenheiro secundário'] && !engineerSecondary) {
      return {
        rowNumber,
        raw: row,
        data: null,
        error: `Engenheiro secundário "${row['Engenheiro secundário']}" não encontrado.`,
      };
    }

    const data: EquipmentInsert = {
      name,
      // Fabricante não é editável/importável — equipamento é sempre da mesma marca,
      // não vale a pena distinguir linha a linha.
      manufacturer: null,
      model: row['Modelo'] || null,
      modality: row['Modalidade'] || KNOWN_MODALITIES[0],
      serial_number: row['Nº de Série'] || null,
      hospital_id: hospital.id,
      zone_id: hospital.zone_id,
      engineer_primary_id: engineerPrimary?.id ?? null,
      engineer_secondary_id: engineerSecondary?.id ?? null,
      pm_per_year: pmPerYear,
      pm_duration_days: Number(row['Duração PM (dias)']) || 1,
      weekend_work: parseWeekendWork(row['Fim-de-semana']),
      needs_shutdown: parseBooleanPt(row['Necessita paragem'], false),
      color: row['Cor'] || '#3B82F6',
      active: parseBooleanPt(row['Activo'], true),
    };
    return { rowNumber, raw: row, data, error: null };
  });
}
