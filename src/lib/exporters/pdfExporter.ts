import { jsPDF } from 'jspdf';
import type { PMReportRow } from './reportRow';

const PAGE_MARGIN = 14;
const ROW_HEIGHT = 7;

const COLUMNS: { header: string; key: keyof PMReportRow; width: number }[] = [
  { header: 'Equipamento', key: 'equipmentName', width: 45 },
  { header: 'Hospital', key: 'hospitalName', width: 40 },
  { header: 'Engenheiro', key: 'engineerName', width: 40 },
  { header: 'Início', key: 'startDate', width: 24 },
  { header: 'Fim', key: 'endDate', width: 24 },
  { header: 'Estado', key: 'status', width: 28 },
];

export function exportPMEventsToPdf(rows: PMReportRow[], fileName = 'pmplan-relatorio.pdf'): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(14);
  doc.text('PMPlan — Relatório de Manutenções Preventivas', PAGE_MARGIN, 14);

  function drawHeader(y: number): number {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    let x = PAGE_MARGIN;
    for (const column of COLUMNS) {
      doc.text(column.header, x, y);
      x += column.width;
    }
    doc.setFont('helvetica', 'normal');
    return y + ROW_HEIGHT;
  }

  let y = drawHeader(24);

  for (const row of rows) {
    if (y > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = drawHeader(PAGE_MARGIN);
    }
    let x = PAGE_MARGIN;
    for (const column of COLUMNS) {
      doc.text(String(row[column.key] ?? ''), x, y, { maxWidth: column.width - 2 });
      x += column.width;
    }
    y += ROW_HEIGHT;
  }

  doc.save(fileName);
}
