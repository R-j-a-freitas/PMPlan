import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { exportPMEventsToExcel, exportPMEventsToPdf } from '../lib/exporters';
import type { PMReportRow } from '../lib/exporters';
import { useCalendarStore, useEngineerStore, useEquipmentStore } from '../stores';
import { Button } from '../components/ui';
import { toDisplayDate } from '../lib/dateFormat';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

// startDate/endDate em PMReportRow já vêm formatados (DD/MM/AAAA) para os exporters —
// ordenar por essas strings ordenaria alfabeticamente, não cronologicamente, por isso
// guarda-se também a data ISO só para a ordenação da tabela.
interface ReportRow extends PMReportRow {
  startDateIso: string;
  endDateIso: string;
}

type SortKey = 'equipmentName' | 'hospitalName' | 'engineerName' | 'startDate' | 'endDate' | 'status';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'equipmentName', label: 'Equipamento' },
  { key: 'hospitalName', label: 'Hospital' },
  { key: 'engineerName', label: 'Engenheiro' },
  { key: 'startDate', label: 'Início' },
  { key: 'endDate', label: 'Fim' },
  { key: 'status', label: 'Estado' },
];

function compareRows(a: ReportRow, b: ReportRow, key: SortKey): number {
  if (key === 'startDate') return a.startDateIso.localeCompare(b.startDateIso);
  if (key === 'endDate') return a.endDateIso.localeCompare(b.endDateIso);
  return a[key].localeCompare(b[key]);
}

// Relatórios e exportação (secção 3) — Excel via SheetJS, PDF via jsPDF (secção 2, sem plugins extra).
export function Reports() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const events = useCalendarStore((state) => state.events);
  const fetchEvents = useCalendarStore((state) => state.fetchEvents);
  const equipment = useEquipmentStore((state) => state.equipment);
  const fetchEquipment = useEquipmentStore((state) => state.fetchEquipment);
  const engineers = useEngineerStore((state) => state.engineers);
  const fetchEngineers = useEngineerStore((state) => state.fetchEngineers);

  const [hospitalFilter, setHospitalFilter] = useState('');
  const [engineerFilter, setEngineerFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('startDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    fetchEquipment();
    fetchEngineers();
  }, [fetchEquipment, fetchEngineers]);

  useEffect(() => {
    fetchEvents({ start: `${year}-01-01`, end: `${year}-12-31` });
  }, [year, fetchEvents]);

  const allRows = useMemo<ReportRow[]>(
    () =>
      events.map((event) => {
        const eq = equipment.find((item) => item.id === event.equipment_id);
        const engineer = engineers.find((item) => item.id === event.engineer_id);
        return {
          equipmentName: eq?.name ?? '—',
          hospitalName: eq?.hospital_name ?? '—',
          zoneName: eq?.zone_name ?? '—',
          engineerName: engineer?.name ?? '—',
          startDate: toDisplayDate(event.start_date),
          endDate: toDisplayDate(event.end_date),
          startDateIso: event.start_date,
          endDateIso: event.end_date,
          status: event.status,
          notes: event.notes ?? '',
        };
      }),
    [events, equipment, engineers],
  );

  const hospitalOptions = useMemo(
    () => [...new Set(allRows.map((row) => row.hospitalName))].sort((a, b) => a.localeCompare(b)),
    [allRows],
  );
  const engineerOptions = useMemo(
    () => [...new Set(allRows.map((row) => row.engineerName))].sort((a, b) => a.localeCompare(b)),
    [allRows],
  );

  const rows = useMemo(() => {
    const filtered = allRows.filter(
      (row) =>
        (!hospitalFilter || row.hospitalName === hospitalFilter) &&
        (!engineerFilter || row.engineerName === engineerFilter),
    );
    const sorted = [...filtered].sort((a, b) => compareRows(a, b, sortKey));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [allRows, hospitalFilter, engineerFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-4 text-lg font-semibold text-gray-900">Relatórios</h1>

        <div className="mb-4 flex items-end gap-2 rounded-md border border-gray-200 p-3">
          <label className="flex flex-col gap-1 text-sm">
            Ano
            <select
              className="rounded-md border border-gray-300 px-2 py-1"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {YEAR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Hospital
            <select
              className="rounded-md border border-gray-300 px-2 py-1"
              value={hospitalFilter}
              onChange={(event) => setHospitalFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {hospitalOptions.map((hospitalName) => (
                <option key={hospitalName} value={hospitalName}>
                  {hospitalName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Engenheiro
            <select
              className="rounded-md border border-gray-300 px-2 py-1"
              value={engineerFilter}
              onChange={(event) => setEngineerFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {engineerOptions.map((engineerName) => (
                <option key={engineerName} value={engineerName}>
                  {engineerName}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={() => exportPMEventsToExcel(rows, `pmplan-${year}.xlsx`)} disabled={rows.length === 0}>
            Exportar Excel
          </Button>
          <Button
            variant="secondary"
            onClick={() => exportPMEventsToPdf(rows, `pmplan-${year}.pdf`)}
            disabled={rows.length === 0}
          >
            Exportar PDF
          </Button>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              {COLUMNS.map((column) => (
                <th key={column.key} className="py-1.5 pr-2">
                  <button
                    type="button"
                    onClick={() => handleSort(column.key)}
                    className="flex items-center gap-1 font-medium hover:text-gray-700"
                  >
                    {column.label}
                    {sortKey === column.key && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-gray-100">
                <td className="py-1.5 pr-2">{row.equipmentName}</td>
                <td className="py-1.5 pr-2">{row.hospitalName}</td>
                <td className="py-1.5 pr-2">{row.engineerName}</td>
                <td className="py-1.5 pr-2">{row.startDate}</td>
                <td className="py-1.5 pr-2">{row.endDate}</td>
                <td className="py-1.5 pr-2">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
