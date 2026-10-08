import { jsPDF } from 'jspdf';
import type { PMReportRow } from './reportRow';
import { BRAND_DARK, BRAND_LIGHT, loadReportLogo, type ReportMeta } from './reportHeader';

// Relatório de PMs em PDF (A4 horizontal): cabeçalho com o logótipo do PMPlan e o título
// formatado, tabela com as células a quebrar linha (a altura de cada linha acompanha a
// célula mais alta — antes as linhas tinham altura fixa e os nomes compridos de hospital
// sobrepunham-se à linha seguinte), cabeçalho da tabela repetido em cada página e rodapé
// com "Página x de y".

const MARGIN = 12;
const FONT_SIZE = 8.5;
const LINE_HEIGHT = 3.8;
const PAD_X = 2;
const PAD_Y = 1.9;
const HEADER_ROW_HEIGHT = 8;
const FOOTER_SPACE = 12;

// Larguras em mm, a somar os 273 mm úteis (297 − 2 × 12). O hospital fica com a coluna
// mais larga: é o texto mais comprido e o que mais partia linha.
const COLUMNS: { key: keyof PMReportRow; width: number }[] = [
  { key: 'equipmentName', width: 44 },
  { key: 'modality', width: 26 },
  { key: 'hospitalName', width: 66 },
  { key: 'zoneName', width: 24 },
  { key: 'engineerName', width: 40 },
  { key: 'startDate', width: 22 },
  { key: 'endDate', width: 22 },
  { key: 'status', width: 29 },
];

const GRAY_TEXT: [number, number, number] = [95, 107, 120];
const ZEBRA: [number, number, number] = [244, 249, 249];
const GRID: [number, number, number] = [222, 230, 232];

export async function exportPMEventsToPdf(
  rows: PMReportRow[],
  meta: ReportMeta,
  fileName = 'pmplan-relatorio.pdf',
): Promise<void> {
  const logo = await loadReportLogo();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  // ─── Cabeçalho da primeira página ─────────────────────────────────────────
  function drawMainHeader(): number {
    const logoHeight = 11;
    const logoWidth = logo ? logoHeight * logo.ratio : 0;
    if (logo) doc.addImage(logo.dataUrl, 'PNG', MARGIN, 10, logoWidth, logoHeight);
    const textX = MARGIN + (logo ? logoWidth + 8 : 0);
    const textWidth = pageWidth - MARGIN - textX - 70;

    doc.setTextColor(BRAND_DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(meta.title, textX, 14.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 50, 60);
    doc.text(meta.subtitle, textX, 20);

    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY_TEXT);
    const filterLines = doc.splitTextToSize(meta.filters, textWidth) as string[];
    doc.text(filterLines, textX, 25);

    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(meta.generated, 66) as string[], pageWidth - MARGIN, 14.5, { align: 'right' });

    const bottom = Math.max(10 + logoHeight, 25 + (filterLines.length - 1) * 3.6) + 4;
    doc.setDrawColor(BRAND_DARK);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, bottom, pageWidth - MARGIN, bottom);
    doc.setDrawColor(BRAND_LIGHT);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, bottom + 1.1, pageWidth - MARGIN, bottom + 1.1);
    return bottom + 6;
  }

  // ─── Cabeçalho das páginas seguintes (compacto) ───────────────────────────
  function drawContinuationHeader(): number {
    const logoHeight = 6;
    const logoWidth = logo ? logoHeight * logo.ratio : 0;
    if (logo) doc.addImage(logo.dataUrl, 'PNG', MARGIN, 8, logoWidth, logoHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(BRAND_DARK);
    doc.text(meta.title, MARGIN + (logo ? logoWidth + 5 : 0), 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY_TEXT);
    doc.text(meta.subtitle, pageWidth - MARGIN, 12.5, { align: 'right' });
    doc.setDrawColor(BRAND_LIGHT);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, 16, pageWidth - MARGIN, 16);
    return 20;
  }

  function drawTableHeader(y: number): number {
    doc.setFillColor(BRAND_DARK);
    doc.rect(MARGIN, y, contentWidth, HEADER_ROW_HEIGHT, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT_SIZE);
    doc.setTextColor(255, 255, 255);
    let x = MARGIN;
    for (const column of COLUMNS) {
      doc.text(meta.columns[column.key], x + PAD_X, y + HEADER_ROW_HEIGHT / 2 + 1.2);
      x += column.width;
    }
    doc.setFont('helvetica', 'normal');
    return y + HEADER_ROW_HEIGHT;
  }

  const cellText = (row: PMReportRow, key: keyof PMReportRow) =>
    key === 'status' ? meta.statusLabel(row.status) : String(row[key] ?? '');

  let y = drawTableHeader(drawMainHeader());
  doc.setFontSize(FONT_SIZE);

  rows.forEach((row, index) => {
    const cells = COLUMNS.map(
      (column) => doc.splitTextToSize(cellText(row, column.key), column.width - PAD_X * 2) as string[],
    );
    const rowHeight = Math.max(...cells.map((lines) => lines.length)) * LINE_HEIGHT + PAD_Y * 2;

    if (y + rowHeight > pageHeight - FOOTER_SPACE) {
      doc.addPage();
      y = drawTableHeader(drawContinuationHeader());
      doc.setFontSize(FONT_SIZE);
    }

    if (index % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(MARGIN, y, contentWidth, rowHeight, 'F');
    }
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + rowHeight, pageWidth - MARGIN, y + rowHeight);

    doc.setTextColor(30, 38, 46);
    let x = MARGIN;
    cells.forEach((lines, columnIndex) => {
      doc.text(lines, x + PAD_X, y + PAD_Y + LINE_HEIGHT - 0.9);
      x += COLUMNS[columnIndex]!.width;
    });
    y += rowHeight;
  });

  // ─── Rodapé em todas as páginas ───────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY_TEXT);
    doc.text('PMPlan · pmplan.net', MARGIN, pageHeight - 6);
    doc.text(meta.pageLabel(page, total), pageWidth - MARGIN, pageHeight - 6, { align: 'right' });
  }

  doc.save(fileName);
}
