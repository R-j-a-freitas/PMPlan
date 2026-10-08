import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { exportPMEventsToExcel, exportPMEventsToPdf } from '../lib/exporters';
import type { PMReportRow, ReportMeta } from '../lib/exporters';
import { useAuthStore, useCalendarStore, useEngineerStore, useEquipmentStore, useUiStore } from '../stores';
import { Badge, Button, Card, EmptyState, PageHeader, SortableTh } from '../components/ui';
import { useTableSort } from '../hooks';
import type { SortAccessors } from '../hooks';
import { toDisplayDate } from '../lib/dateFormat';
import { PM_STATUS_COLORS } from '../lib/pmStatus';
import type { PMStatus } from '../types';
import { useT, type TFunction, type TranslationKey } from '../i18n';
import { PM_STATUS_KEYS } from '../i18n/labels';

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

const COLUMNS: { key: SortKey; labelKey: TranslationKey }[] = [
  { key: 'equipmentName', labelKey: 'common.equipment' },
  { key: 'modality', labelKey: 'common.modality' },
  { key: 'hospitalName', labelKey: 'common.hospital' },
  { key: 'engineerName', labelKey: 'common.engineer' },
  { key: 'startDate', labelKey: 'common.start' },
  { key: 'endDate', labelKey: 'common.end' },
  { key: 'status', labelKey: 'common.status' },
];

// As datas ordenam pela versão ISO — ordenar pelas strings DD/MM/AAAA que a coluna
// mostra daria uma ordem alfabética, não cronológica. O estado ordena pelo rótulo
// traduzido (o que se lê na pastilha), por isso os extractores dependem do idioma
// activo e vivem num useMemo dentro da página, e não numa constante de módulo.
function buildReportSort(t: TFunction): SortAccessors<ReportRow, SortKey> {
  return {
    equipmentName: (row) => row.equipmentName,
    modality: (row) => row.modality,
    hospitalName: (row) => row.hospitalName,
    engineerName: (row) => row.engineerName,
    startDate: (row) => row.startDateIso,
    endDate: (row) => row.endDateIso,
    status: (row) => t(PM_STATUS_KEYS[row.status]),
  };
}

// Relatórios e exportação (secção 3) — Excel via SheetJS, PDF via jsPDF (secção 2, sem plugins extra).
export function Reports() {
  const t = useT();
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

  const filteredRows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          (!modalityFilter || row.modality === modalityFilter) &&
          (!hospitalFilter || row.hospitalName === hospitalFilter) &&
          (!engineerFilter || row.engineerName === engineerFilter),
      ),
    [allRows, modalityFilter, hospitalFilter, engineerFilter],
  );

  const reportSort = useMemo(() => buildReportSort(t), [t]);
  const { rows, sortableProps } = useTableSort(filteredRows, reportSort, 'startDate');
  const profile = useAuthStore((state) => state.profile);
  const pushToast = useUiStore((state) => state.pushToast);
  const [exporting, setExporting] = useState(false);

  // Cabeçalho dos ficheiros exportados: o que foi exportado (ano, filtros, nº de PMs), por
  // quem e quando — para quem recebe o PDF/Excel saber o que tem na mão sem ver a app.
  function reportMeta(): ReportMeta {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const when = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const who = profile?.name || profile?.email || '';
    return {
      title: t('reports.file.title'),
      subtitle: t('reports.file.subtitle', { year, count: rows.length }),
      filters: [
        `${t('common.modality')}: ${modalityFilter || t('reports.allFem')}`,
        `${t('common.hospital')}: ${hospitalFilter || t('reports.allMasc')}`,
        `${t('common.engineer')}: ${engineerFilter || t('reports.allMasc')}`,
      ].join('  ·  '),
      generated: who ? t('reports.file.generatedBy', { when, who }) : t('reports.file.generated', { when }),
      columns: {
        equipmentName: t('common.equipment'),
        modality: t('common.modality'),
        hospitalName: t('common.hospital'),
        zoneName: t('common.zone'),
        engineerName: t('common.engineer'),
        startDate: t('common.start'),
        endDate: t('common.end'),
        status: t('common.status'),
        notes: t('common.notes'),
      },
      statusLabel: (status) => (status in PM_STATUS_KEYS ? t(PM_STATUS_KEYS[status as PMStatus]) : status),
      pageLabel: (page, total) => t('reports.file.page', { page, total }),
    };
  }

  async function handleExport(kind: 'pdf' | 'xlsx') {
    setExporting(true);
    try {
      if (kind === 'pdf') await exportPMEventsToPdf(rows, reportMeta(), `pmplan-${year}.pdf`);
      else await exportPMEventsToExcel(rows, reportMeta(), `pmplan-${year}.xlsx`);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('reports.file.failed') });
    } finally {
      setExporting(false);
    }
  }
  return (
    <PageShell>
      <PageHeader
        title={t('reports.title')}
        description={t('reports.description')}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => handleExport('pdf')}
              disabled={rows.length === 0 || exporting}
            >
              {t('reports.exportPdf')}
            </Button>
            <Button onClick={() => handleExport('xlsx')} disabled={rows.length === 0 || exporting}>
              {t('reports.exportExcel')}
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            {t('common.year')}
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
            {t('common.modality')}
            <select
              className="pm-field"
              value={modalityFilter}
              onChange={(event) => setModalityFilter(event.target.value)}
            >
              <option value="">{t('reports.allFem')}</option>
              {modalityOptions.map((modality) => (
                <option key={modality} value={modality}>
                  {modality}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-600">
            {t('common.hospital')}
            <select
              className="pm-field"
              value={hospitalFilter}
              onChange={(event) => setHospitalFilter(event.target.value)}
            >
              <option value="">{t('reports.allMasc')}</option>
              {hospitalOptions.map((hospitalName) => (
                <option key={hospitalName} value={hospitalName}>
                  {hospitalName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-600">
            {t('common.engineer')}
            <select
              className="pm-field"
              value={engineerFilter}
              onChange={(event) => setEngineerFilter(event.target.value)}
            >
              <option value="">{t('reports.allMasc')}</option>
              {engineerOptions.map((engineerName) => (
                <option key={engineerName} value={engineerName}>
                  {engineerName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card padded={false} title={t('reports.count', { count: rows.length, year })}>
        {rows.length === 0 ? (
          <EmptyState>{t('reports.empty')}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="pm-table">
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <SortableTh key={column.key} {...sortableProps(column.key)}>
                      {t(column.labelKey)}
                    </SortableTh>
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
                      <Badge color={PM_STATUS_COLORS[row.status]}>{t(PM_STATUS_KEYS[row.status])}</Badge>
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
