/** Linha plana usada pelos exporters — já com os joins (equipamento/hospital/engenheiro) resolvidos. */
export interface PMReportRow {
  equipmentName: string;
  modality: string;
  hospitalName: string;
  zoneName: string;
  engineerName: string;
  /** Datas já formatadas (DD/MM/AAAA) — o que o PDF mostra. */
  startDate: string;
  endDate: string;
  status: string;
  notes: string;
}

/** Datas ISO ('yyyy-MM-dd'), opcionais: com elas o Excel grava datas verdadeiras, que se
 *  ordenam e filtram como datas, em vez de texto. */
export type PMReportRowWithIso = PMReportRow & { startDateIso?: string; endDateIso?: string };
