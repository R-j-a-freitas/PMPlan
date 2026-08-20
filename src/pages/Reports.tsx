import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { exportPMEventsToExcel, exportPMEventsToPdf } from '../lib/exporters';
import type { PMReportRow } from '../lib/exporters';
import { useCalendarStore, useEngineerStore, useEquipmentStore } from '../stores';
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui';
import { toDisplayDate } from '../lib/dateFormat';
import { PM_STATUS_META } from '../lib/pmStatus';
import type { PMStatus } from '../types';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

// startDate/endDate em PMReportRow já vêm formatados (DD/MM/AAAA) para os exporters —
// ordenar por essas strings ordenaria alfabeticamente, não cronologicamente, por isso
// guarda-se também a data ISO só para a ordenação da tabela.
interface ReportRow extends PMReportRow {
  startDateIso: string;
  endDateIso: string;
  /** Estreitado face a PMReportRow (que o tem como string, para os exporters) — é o que
   *  permite ir buscar o rótulo e a cor do estado a lib/pmStatus. */
  status: PMStatus;
}

type SortKey =
  | 'equipmentName'
  | 'modality'
  | 'hospitalName'
  | 'engineerName'
  | 'startDate'
  | 'endDate'
  | 'status';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'equipmentName', label: 'Equipamento' },
  { key: 'modality', label: 'Modalidade' },
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

  const [modalityFilter, setModalityFilter] = useState('');
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
          // equipment.modality é texto livre e pode vir por preencher (ver ModalityFilter).
          modality: eq?.modality || '—',
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

  const modalityOptions = useMemo(
    () => [...new Set(allRows.map((row) => row.modality))].sort((a, b) => a.localeCompare(b)),
    [allRows],
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
        (!modalityFilter || row.modality === modalityFilter) &&
        (!hospitalFilter || row.hospitalName === hospitalFilter) &&
        (!engineerFilter || row.engineerName === engineerFilter),
    );
    const sorted = [...filtered].sort((a, b) => compareRows(a, b, sortKey));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [allRows, modalityFilter, hospitalFilter, engineerFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Relatórios"
        description="As PMs do ano, filtradas e ordenadas à medida — prontas a exportar para Excel ou PDF."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => exportPMEventsToPdf(rows, `pmplan-${year}.pdf`)}
              disabled={rows.length === 0}
            >
              Exportar PDF
            </Button>
            <Button onClick={() => exportPMEventsToExcel(rows, `pmplan-${year}.xlsx`)} disabled={rows.length === 0}>
              Exportar Excel
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Ano
            <select
              className="pm-field"
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

          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Modalidade
            <select
              className="pm-field"
              value={modalityFilter}
              onChange={(event) => setModalityFilter(event.target.value)}
            >
              <option value="">Todas</option>
              {modalityOptions.map((modality) => (
                <option key={modality} value={modality}>
                  {modality}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Hospital
            <select
              className="pm-field"
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

          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Engenheiro
            <select
              className="pm-field"
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
        </div>
      </Card>

      <Card padded={false} title={`${rows.length} PM(s) em ${year}`}>
        {rows.length === 0 ? (
          <EmptyState>Sem PMs para os filtros escolhidos.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="pm-table">
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <th key={column.key} className="py-1.5 pr-2">
                      {/* Coluna ordenável: a seta só aparece na coluna activa, e o
                          cabeçalho inteiro é a área de clique. */}
                      <button
                        type="button"
                        onClick={() => handleSort(column.key)}
                        className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
                          sortKey === column.key ? 'text-brand-700' : 'text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        {column.label}
                        <span aria-hidden="true" className={sortKey === column.key ? '' : 'invisible'}>
                          {sortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td className="py-1.5 pr-2 font-medium text-gray-800">{row.equipmentName}</td>
                    <td className="py-1.5 pr-2">{row.modality}</td>
                    <td className="py-1.5 pr-2">{row.hospitalName}</td>
                    <td className="py-1.5 pr-2">{row.engineerName}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{row.startDate}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{row.endDate}</td>
                    <td className="py-1.5 pr-2">
                      <Badge color={PM_STATUS_META[row.status].color}>{PM_STATUS_META[row.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
