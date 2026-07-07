import * as XLSX from 'xlsx';
import type { PMReportRow } from './reportRow';

export function exportPMEventsToExcel(rows: PMReportRow[], fileName = 'pmplan-relatorio.xlsx'): void {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      Equipamento: row.equipmentName,
      Hospital: row.hospitalName,
      Zona: row.zoneName,
      Engenheiro: row.engineerName,
      'Data Início': row.startDate,
      'Data Fim': row.endDate,
      Estado: row.status,
      Notas: row.notes,
    })),
  );
  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 24 },
    { wch: 14 },
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 40 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'PM');
  XLSX.writeFile(workbook, fileName);
}
