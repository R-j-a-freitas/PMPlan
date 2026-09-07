import type { ApprovalTrack, HospitalContact, HospitalContactInsert, HospitalWithZone } from '../../types';
import type { ImportRef, ParsedImportRow } from '../spreadsheet';
import type { ImportAliases } from './importHelpers';
import { boolToPt, parseBooleanPt, resolveRef } from './importHelpers';

/** Rótulo da via na folha de cálculo. "Ambas" é o valor de `approval_track` a null — o
 *  contacto serve as duas vias, que é o caso normal. */
const BOTH_LABEL = 'Ambas';

const TRACK_LABELS: Record<ApprovalTrack, string> = {
  standard: 'Geral',
  brachytherapy: 'Braquiterapia',
};

/** Aceita o que a app exporta, o que vem da lista da Elekta ("LINACS"/"BRAQUI") e o valor
 *  cru da base de dados — um ficheiro que passou por várias mãos traz as três formas. */
const TRACK_ALIASES: Record<string, ApprovalTrack | null> = {
  '': null,
  ambas: null,
  ambos: null,
  todas: null,
  both: null,
  geral: 'standard',
  general: 'standard',
  standard: 'standard',
  linac: 'standard',
  linacs: 'standard',
  braquiterapia: 'brachytherapy',
  braqui: 'brachytherapy',
  braquiterapía: 'brachytherapy',
  brachytherapy: 'brachytherapy',
  brachy: 'brachytherapy',
};

function trackLabel(track: ApprovalTrack | null): string {
  return track ? TRACK_LABELS[track] : BOTH_LABEL;
}

/** `undefined` = valor não reconhecido (a linha é rejeitada, em vez de entrar na via
 *  errada em silêncio). */
function parseTrack(value: string | undefined): ApprovalTrack | null | undefined {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized in TRACK_ALIASES) return TRACK_ALIASES[normalized];
  return undefined;
}

export function buildContactExportRows(
  contacts: HospitalContact[],
  hospitals: HospitalWithZone[],
): Record<string, unknown>[] {
  const byId = new Map(hospitals.map((hospital) => [hospital.id, hospital]));
  return contacts.map((contact) => {
    const hospital = byId.get(contact.hospital_id);
    return {
      // Primeira coluna de propósito: é a que liga a linha ao hospital na reimportação.
      Hospital: hospital?.name ?? '',
      Nome: contact.name,
      Cargo: contact.role ?? '',
      Email: contact.email ?? '',
      Telefone: contact.phone ?? '',
      Móvel: contact.mobile ?? '',
      Fax: contact.fax ?? '',
      Via: trackLabel(contact.approval_track),
      Principal: boolToPt(contact.is_primary),
      Activo: boolToPt(contact.active),
      Notas: contact.notes ?? '',
      // Só informativa (a importação ignora-a): serve para quem abre o ficheiro perceber
      // de que zona é o hospital sem ter de o procurar noutro lado.
      Zona: hospital?.zone_name ?? '',
    };
  });
}

/** Lê as linhas de um ficheiro de contactos. Colunas obrigatórias: "Hospital" e "Nome".
 *  Tudo o resto é opcional, e colunas a mais (ex: "ElektaID", "Revisão", "Hospital
 *  (ficheiro)" no ficheiro preparado a partir da lista da Elekta) são ignoradas. */
export function parseContactImportRows(
  raw: Record<string, string>[],
  hospitals: HospitalWithZone[],
  aliases: ImportAliases = {},
): ParsedImportRow<HospitalContactInsert>[] {
  return raw.map((row, index) => {
    const rowNumber = index + 2;
    const name = (row['Nome'] ?? '').trim();
    if (!name) {
      return { rowNumber, raw: row, data: null, error: 'Falta o nome.', refs: [] };
    }

    const hospital = resolveRef(hospitals, 'hospital', row['Hospital'], aliases);
    // Reportada sempre, mesmo quando casou: uma correspondência automática também pode
    // estar errada, e a pré-visualização deixa trocá-la (ver ImportPreviewModal).
    const refs: ImportRef[] = [
      { kind: 'hospital', column: 'Hospital', value: row['Hospital'] ?? '', resolvedId: hospital?.id ?? null },
    ];

    if (!hospital) {
      return {
        rowNumber,
        raw: row,
        data: null,
        error: `Hospital "${row['Hospital'] || ''}" não encontrado.`,
        refs,
      };
    }

    const track = parseTrack(row['Via']);
    if (track === undefined) {
      return {
        rowNumber,
        raw: row,
        data: null,
        error: `Via "${row['Via']}" inválida (use ${BOTH_LABEL}, ${TRACK_LABELS.standard} ou ${TRACK_LABELS.brachytherapy}).`,
        refs,
      };
    }

    const data: HospitalContactInsert = {
      hospital_id: hospital.id,
      name,
      role: row['Cargo']?.trim() || null,
      email: row['Email']?.trim() || null,
      phone: row['Telefone']?.trim() || null,
      mobile: row['Móvel']?.trim() || null,
      fax: row['Fax']?.trim() || null,
      approval_track: track,
      is_primary: parseBooleanPt(row['Principal'], false),
      active: parseBooleanPt(row['Activo'], true),
      notes: row['Notas']?.trim() || null,
    };
    return { rowNumber, raw: row, data, error: null, refs };
  });
}

/** Resumo de uma linha na pré-visualização. */
export function contactImportPreview(data: HospitalContactInsert): string {
  return [data.name, data.email, trackLabel(data.approval_track)].filter(Boolean).join(' · ');
}
