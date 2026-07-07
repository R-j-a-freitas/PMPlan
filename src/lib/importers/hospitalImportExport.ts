import type { Country, HospitalContact, HospitalInsert, HospitalWithZone, Zone } from '../../types';
import type { ParsedImportRow } from '../spreadsheet';
import { boolToPt, findByName, parseBooleanPt } from './importHelpers';

const COUNTRY_LABELS: Record<Country, string> = { PT: 'Portugal', ES: 'Espanha' };

function parseCountry(value: string | undefined): Country | null {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === 'PT' || normalized === 'PORTUGAL') return 'PT';
  if (normalized === 'ES' || normalized === 'ESPANHA' || normalized === 'ESPAÑA') return 'ES';
  return null;
}

// Um hospital pode ter vários contactos (nome/cargo/email/telefone) — não cabem numa
// única célula como texto simples, por isso usa-se "Nome | Cargo | Email | Telefone"
// por contacto, separados por ";" (ex: "Ana Sousa | Coordenadora | ana@x.pt | 91...;
// Pedro Lima | Técnico | pedro@x.pt | 92..."). Round-trip exacto entre export e import.
function formatContacts(contacts: HospitalContact[]): string {
  return contacts
    .map((contact) => [contact.name, contact.role ?? '', contact.email ?? '', contact.phone ?? ''].join(' | '))
    .join('; ');
}

function parseContacts(value: string | undefined): HospitalContact[] {
  if (!value || !value.trim()) return [];
  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [name, role, email, phone] = entry.split('|').map((part) => part.trim());
      return { name: name || '', role: role || undefined, email: email || undefined, phone: phone || undefined };
    })
    .filter((contact) => contact.name.length > 0);
}

export function buildHospitalExportRows(hospitals: HospitalWithZone[]): Record<string, unknown>[] {
  return hospitals.map((hospital) => ({
    Nome: hospital.name,
    'Nome curto': hospital.short_name ?? '',
    Morada: hospital.address ?? '',
    País: COUNTRY_LABELS[hospital.country],
    Localidade: hospital.locality ?? '',
    Cidade: hospital.city ?? '',
    Zona: hospital.zone_name,
    Contactos: formatContacts(hospital.contacts),
    Activo: boolToPt(hospital.active),
  }));
}

export function parseHospitalImportRows(
  raw: Record<string, string>[],
  leafZones: Zone[],
): ParsedImportRow<HospitalInsert>[] {
  return raw.map((row, index) => {
    const rowNumber = index + 2;
    const name = row['Nome'];
    if (!name) {
      return { rowNumber, raw: row, data: null, error: 'Falta o nome.' };
    }

    const country = parseCountry(row['País']);
    if (!country) {
      return { rowNumber, raw: row, data: null, error: `País "${row['País'] || ''}" inválido (use PT ou ES).` };
    }

    const zone = findByName(leafZones, row['Zona']);
    if (!zone) {
      return {
        rowNumber,
        raw: row,
        data: null,
        error: `Zona "${row['Zona'] || ''}" não encontrada (tem de ser uma zona-folha, sem zonas-filhas).`,
      };
    }

    const data: HospitalInsert = {
      name,
      short_name: row['Nome curto'] || null,
      address: row['Morada'] || null,
      country,
      locality: row['Localidade'] || null,
      city: country === 'ES' ? row['Cidade'] || null : null,
      zone_id: zone.id,
      contacts: parseContacts(row['Contactos']),
      active: parseBooleanPt(row['Activo'], true),
    };
    return { rowNumber, raw: row, data, error: null };
  });
}
