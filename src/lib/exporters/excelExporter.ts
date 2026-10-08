import type { PMReportRowWithIso } from './reportRow';
import { BRAND_DARK, downloadBlob, loadReportLogo, type ReportMeta } from './reportHeader';

// Relatório de PMs em Excel com cabeçalho: logótipo do PMPlan, título, filtros e data de
// geração por cima da tabela. A edição gratuita do SheetJS (usada nos import/export das
// listas) não escreve imagens nem estilos, por isso este relatório usa o ExcelJS —
// carregado só aqui (import dinâmico), para não pesar no arranque da app.

const HEADER_ROW = 6;
const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;

const COLUMNS: { key: keyof PMReportRowWithIso; width: number; wrap?: boolean }[] = [
  { key: 'equipmentName', width: 26 },
  { key: 'modality', width: 14 },
  { key: 'hospitalName', width: 42, wrap: true },
  { key: 'zoneName', width: 14 },
  { key: 'engineerName', width: 24 },
  { key: 'startDate', width: 12 },
  { key: 'endDate', width: 12 },
  { key: 'status', width: 14 },
  { key: 'notes', width: 44, wrap: true },
];

function isoToExcelDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  // UTC: o ExcelJS converte a data a partir do instante UTC — com hora local, um fuso a leste
  // de Greenwich passava o dia para o anterior.
  return new Date(Date.UTC(year, month - 1, day));
}

export async function exportPMEventsToExcel(
  rows: PMReportRowWithIso[],
  meta: ReportMeta,
  fileName = 'pmplan-relatorio.xlsx',
): Promise<void> {
  const [{ default: ExcelJS }, logo] = await Promise.all([import('exceljs'), loadReportLogo()]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PMPlan';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('PMs', {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: { oddFooter: '&LPMPlan · pmplan.net&R&P / &N' },
  });
  sheet.columns = COLUMNS.map((column) => ({ width: column.width }));

  // ─── Cabeçalho: logótipo à esquerda (A1:B4), texto a partir da coluna C ────
  for (const rowNumber of [1, 2, 3, 4]) sheet.getRow(rowNumber).height = rowNumber === 1 ? 26 : 17;
  if (logo) {
    const imageId = workbook.addImage({ base64: logo.dataUrl, extension: 'png' });
    const height = 52;
    sheet.addImage(imageId, { tl: { col: 0.15, row: 0.4 }, ext: { width: height * logo.ratio, height } });
  }
  const lastColumn = String.fromCharCode(64 + COLUMNS.length);
  const headerLines: [string, Partial<import('exceljs').Font>][] = [
    [meta.title, { bold: true, size: 16, color: { argb: argb(BRAND_DARK) } }],
    [meta.subtitle, { size: 11, color: { argb: 'FF28323C' } }],
    [meta.filters, { size: 9, color: { argb: 'FF5F6B78' } }],
    [meta.generated, { size: 9, italic: true, color: { argb: 'FF5F6B78' } }],
  ];
  headerLines.forEach(([text, font], index) => {
    const rowNumber = index + 1;
    sheet.mergeCells(`C${rowNumber}:${lastColumn}${rowNumber}`);
    const cell = sheet.getCell(`C${rowNumber}`);
    cell.value = text;
    cell.font = { name: 'Calibri', ...font };
    cell.alignment = { vertical: 'middle' };
  });
  // Linha de separação na cor da marca, por baixo do cabeçalho.
  for (let column = 1; column <= COLUMNS.length; column++) {
    sheet.getCell(5, column).border = { bottom: { style: 'medium', color: { argb: argb(BRAND_DARK) } } };
  }
  sheet.getRow(5).height = 6;

  // ─── Tabela ────────────────────────────────────────────────────────────────
  const header = sheet.getRow(HEADER_ROW);
  header.values = COLUMNS.map((column) => meta.columns[column.key as keyof typeof meta.columns]);
  header.height = 20;
  header.eachCell((cell) => {
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(BRAND_DARK) } };
    cell.alignment = { vertical: 'middle' };
  });

  const thin = { style: 'thin' as const, color: { argb: 'FFDEE6E8' } };
  rows.forEach((row, index) => {
    const values = COLUMNS.map((column) => {
      if (column.key === 'startDate') return isoToExcelDate(row.startDateIso) ?? row.startDate;
      if (column.key === 'endDate') return isoToExcelDate(row.endDateIso) ?? row.endDate;
      if (column.key === 'status') return meta.statusLabel(row.status);
      return row[column.key] ?? '';
    });
    const excelRow = sheet.addRow(values);
    excelRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const column = COLUMNS[columnNumber - 1];
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = { bottom: thin };
      cell.alignment = { vertical: 'top', wrapText: Boolean(column?.wrap) };
      if (cell.value instanceof Date) cell.numFmt = 'dd/mm/yyyy';
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F9F9' } };
    });
  });

  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: COLUMNS.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName,
  );
}
