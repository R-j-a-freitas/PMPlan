import type { Country, HospitalInsert, HospitalUpdate, HospitalWithZone, Zone } from '../../types';
import type { ImportRef, ParsedImportRow } from '../spreadsheet';
import type { ImportAliases } from './importHelpers';
import { boolToPt, parseBooleanPt, resolveRef } from './importHelpers';

const COUNTRY_LABELS: Record<Country, string> = { PT: 'Portugal', ES: 'Espanha' };

function parseCountry(value: string | undefined): Country | null {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === 'PT' || normalized === 'PORTUGAL') return 'PT';
  if (normalized === 'ES' || normalized === 'ESPANHA' || normalized === 'ESPAÑA') return 'ES';
  return null;
}

/** Uma linha do ficheiro: ou actualiza um hospital que já existe, ou cria um novo. */
export interface HospitalImportRow {
  /** Hospital existente que esta linha actualiza; null = linha de criação. */
  existingId: string | null;
  /** Nome do hospital na base de dados, para a pré-visualização dizer o que vai mudar. */
  existingName: string | null;
  /** Preenchido quando existingId é null. */
  insert: HospitalInsert | null;
  /** Preenchido quando existingId não é null — só com as colunas que o ficheiro traz. */
  update: HospitalUpdate | null;
}

function normalizeName(value: string | undefined | null): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Hospital que esta linha representa: primeiro pelo ID Elekta (que não muda de grafia),
 *  depois pelo nome — o próprio, ou o nome curto. */
function findExisting(hospitals: HospitalWithZone[], row: Record<string, string>): HospitalWithZone | undefined {
  const elektaId = (row['ElektaID'] ?? '').trim();
  if (elektaId) {
    const byElektaId = hospitals.find((hospital) => hospital.elekta_id === elektaId);
    if (byElektaId) return byElektaId;
  }
  const name = normalizeName(row['Nome']);
  if (!name) return undefined;
  return hospitals.find(
    (hospital) => normalizeName(hospital.name) === name || normalizeName(hospital.short_name) === name,
  );
}

// Os contactos não viajam neste ficheiro. Viajavam, numa coluna "Contactos" com tudo
// espremido em texto ("Nome | Cargo | Email | Telefone; …"), enquanto viviam dentro do
// hospital. Desde a migração 0021 são uma tabela própria com via, móvel, fax e estado —
// e têm ficheiro próprio, na página Contactos (ver lib/importers/contactImportExport.ts).
// Um ficheiro antigo com a coluna "Contactos" continua a importar-se: a coluna é ignorada.
export function buildHospitalExportRows(hospitals: HospitalWithZone[]): Record<string, unknown>[] {
  return hospitals.map((hospital) => ({
    Nome: hospital.name,
    'Nome curto': hospital.short_name ?? '',
    'Nome carta': hospital.letter_name ?? '',
    Morada: hospital.address ?? '',
    'Código postal': hospital.postal_code ?? '',
    País: COUNTRY_LABELS[hospital.country],
    Localidade: hospital.locality ?? '',
    Cidade: hospital.city ?? '',
    Zona: hospital.zone_name,
    ElektaID: hospital.elekta_id ?? '',
    Activo: boolToPt(hospital.active),
  }));
}

/** Lê as linhas de um ficheiro de hospitais.
 *
 *  Uma linha cujo nome (ou ID Elekta) já existe **actualiza** esse hospital em vez de criar
 *  outro — sem isto, reimportar o ficheiro que a app acabou de exportar duplicava a lista
 *  inteira, e não havia forma de trazer de fora dados para hospitais já registados (a
 *  morada e o código postal da lista do cliente, por exemplo).
 *
 *  Numa actualização só entram as colunas que o ficheiro traz preenchidas: uma célula
 *  vazia deixa o valor como está, nunca o apaga. E a zona é obrigatória apenas ao criar —
 *  actualizar um hospital sem coluna "Zona" mantém a que ele já tem. */
export function parseHospitalImportRows(
  raw: Record<string, string>[],
  leafZones: Zone[],
  hospitals: HospitalWithZone[],
  aliases: ImportAliases = {},
): ParsedImportRow<HospitalImportRow>[] {
  return raw.map((row, index) => {
    const rowNumber = index + 2;
    const name = (row['Nome'] ?? '').trim();
    if (!name) {
      return { rowNumber, raw: row, data: null, error: 'Falta o nome.', refs: [] };
    }

    const existing = findExisting(hospitals, row);
    const zoneValue = row['Zona'] ?? '';
    const zone = zoneValue.trim() ? resolveRef(leafZones, 'zone', zoneValue, aliases) : undefined;
    // A referência à zona só se reporta quando o ficheiro a traz: uma coluna vazia numa
    // actualização não é uma correspondência por resolver, é uma zona que não se mexe.
    const refs: ImportRef[] = zoneValue.trim()
      ? [{ kind: 'zone', column: 'Zona', value: zoneValue, resolvedId: zone?.id ?? null }]
      : [];

    if (zoneValue.trim() && !zone) {
      return {
        rowNumber,
        raw: row,
        data: null,
        error: `Zona "${zoneValue}" não encontrada (tem de ser uma zona-folha, sem zonas-filhas).`,
        refs,
      };
    }

    const country = row['País']?.trim() ? parseCountry(row['País']) : null;
    if (row['País']?.trim() && !country) {
      return {
        rowNumber,
        raw: row,
        data: null,
        error: `País "${row['País']}" inválido (use PT ou ES).`,
        refs,
      };
    }

    // ─── Actualização ────────────────────────────────────────────────────────
    if (existing) {
      const update: HospitalUpdate = {};
      // `undefined` = coluna ausente ou vazia (não mexer); só o que vem escrito é gravado.
      const set = <K extends keyof HospitalUpdate>(key: K, value: HospitalUpdate[K] | undefined) => {
        if (value !== undefined) update[key] = value;
      };
      set('name', name !== existing.name ? name : undefined);
      set('short_name', row['Nome curto']?.trim() || undefined);
      set('letter_name', row['Nome carta']?.trim() || undefined);
      set('address', row['Morada']?.trim() || undefined);
      set('postal_code', row['Código postal']?.trim() || undefined);
      set('country', country ?? undefined);
      set('locality', row['Localidade']?.trim() || undefined);
      set('elekta_id', row['ElektaID']?.trim() || undefined);
      set('zone_id', zone?.id);
      // Cidade só faz sentido em ES (ver o comentário do campo em types/hospital.ts).
      const effectiveCountry = country ?? existing.country;
      if (effectiveCountry === 'ES') set('city', row['Cidade']?.trim() || undefined);
      if (row['Activo']?.trim()) set('active', parseBooleanPt(row['Activo'], existing.active));

      if (Object.keys(update).length === 0) {
        return {
          rowNumber,
          raw: row,
          data: null,
          error: `"${existing.name}" já existe e a linha não traz nada de novo.`,
          refs,
        };
      }
      return {
        rowNumber,
        raw: row,
        data: { existingId: existing.id, existingName: existing.name, insert: null, update },
        error: null,
        refs,
      };
    }

    // ─── Criação ─────────────────────────────────────────────────────────────
    if (!country) {
      return {
        rowNumber,
        raw: row,
        data: null,
        error: `País "${row['País'] || ''}" inválido (use PT ou ES).`,
        refs,
      };
    }
    if (!zone) {
      return {
        rowNumber,
        raw: row,
        data: null,
        error: `Zona "${zoneValue}" não encontrada (obrigatória para criar um hospital novo).`,
        refs: zoneValue.trim() ? refs : [{ kind: 'zone', column: 'Zona', value: zoneValue, resolvedId: null }],
      };
    }

    const insert: HospitalInsert = {
      name,
      short_name: row['Nome curto'] || null,
      letter_name: row['Nome carta'] || null,
      address: row['Morada'] || null,
      postal_code: row['Código postal'] || null,
      country,
      locality: row['Localidade'] || null,
      city: country === 'ES' ? row['Cidade'] || null : null,
      zone_id: zone.id,
      elekta_id: row['ElektaID'] || null,
      contacts: [],
      active: parseBooleanPt(row['Activo'], true),
    };
    return {
      rowNumber,
      raw: row,
      data: { existingId: null, existingName: null, insert, update: null },
      error: null,
      refs,
    };
  });
}
