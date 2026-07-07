import * as XLSX from 'xlsx';

/** Resultado da leitura/validação de uma linha do ficheiro importado — `data` só vem
 *  preenchido quando a linha é válida; `error` explica porque foi rejeitada. */
export interface ParsedImportRow<T> {
  rowNumber: number;
  raw: Record<string, string>;
  data: T | null;
  error: string | null;
}

// Exportação: gera sempre .xlsx (a mesma ferramenta lê .xlsx/.xls/.csv na importação, mas
// escreve sempre o formato mais robusto/com menos ambiguidade de tipos).
export function exportRowsToSpreadsheet(rows: Record<string, unknown>[], fileName: string, sheetName = 'Dados'): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

// Importação: aceita .xlsx/.xls/.csv (o SheetJS trata os três da mesma forma uma vez
// lido o ArrayBuffer). raw:false formata tudo como string — mais previsível para validar
// (datas/números nunca chegam como tipos nativos inesperados).
export async function readSpreadsheetFile(file: File): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '', raw: false });
  // Cabeçalhos/valores com espaços a mais (comuns em ficheiros editados à mão) não devem
  // partir o matching exacto usado pelos parsers de cada entidade.
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), String(value ?? '').trim()])),
  );
}
