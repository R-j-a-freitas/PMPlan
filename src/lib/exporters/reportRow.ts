/** Linha plana usada pelos exporters — já com os joins (equipamento/hospital/engenheiro) resolvidos. */
export interface PMReportRow {
  equipmentName: string;
  hospitalName: string;
  zoneName: string;
  engineerName: string;
  startDate: string;
  endDate: string;
  status: string;
  notes: string;
}
