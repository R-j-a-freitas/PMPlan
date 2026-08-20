import * as XLSX from 'xlsx';

/** Tipo de registo que uma coluna do ficheiro referencia pelo nome. */
export type RefKind = 'zone' | 'hospital' | 'engineer';

/** Referência a outro registo feita pelo nome numa coluna do ficheiro. Ficheiros vindos de
 *  outros sistemas quase nunca escrevem os nomes como a aplicação os tem ("ULS Coimbra,
 *  E.P.E." vs "IPO Coimbra", "Norte" vs "Norte PT"), e sem isto a linha só se salvava
 *  editando o ficheiro à mão — a pré-visualização usa isto para deixar escolher a
 *  correspondência.
 *
 *  São reportadas TODAS, e não só as que falharam: uma correspondência automática também
 *  pode estar errada (dois hospitais com nomes parecidos), e quem importa tem de a poder
 *  rever antes de gravar. */
export interface ImportRef {
  kind: RefKind;
  /** Coluna do ficheiro onde apareceu (ex: "Zona", "Engenheiro principal"). */
  column: string;
  /** Valor lido no ficheiro. */
  value: string;
  /** Registo com que casou (por nome ou por escolha manual); null se não casou com nada. */
  resolvedId: string | null;
}

/** Resultado da leitura/validação de uma linha do ficheiro importado — `data` só vem
 *  preenchido quando a linha é válida; `error` explica porque foi rejeitada. */
export interface ParsedImportRow<T> {
  rowNumber: number;
  raw: Record<string, string>;
  data: T | null;
  error: string | null;
  /** Referências desta linha, resolvidas ou não. Vazio quando a linha nem chega a ser
   *  interpretada (ex: falta o nome). */
  refs: ImportRef[];
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
