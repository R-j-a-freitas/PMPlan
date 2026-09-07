import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageShell } from '../app/PageShell';
import { fetchYearEventsSnapshot, useCalendarStore } from '../stores/calendarStore';
import { useEngineerStore, useEquipmentStore, useHospitalStore, useZoneStore } from '../stores';
import {
  computeEngineerLoadRatio,
  computeZoneLoadRatio,
  countPmEventsForEquipmentInYear,
} from '../lib/conflictRules';
import { PM_STATUS_COLORS, PM_STATUS_ORDER } from '../lib/pmStatus';
import { Card, EmptyState, PageHeader, SortableTh } from '../components/ui';
import { useT, type TranslationKey } from '../i18n';
import { PM_STATUS_KEYS } from '../i18n/labels';
import { useTableSort } from '../hooks';
import type { SortAccessors } from '../hooks';
import type { EquipmentFull, PMEvent, PMStatus } from '../types';

const CURRENT_YEAR = new Date().getFullYear();

// Cores por estado da PM — partilhadas com os relatórios (ver lib/pmStatus). Usadas em
// preenchimentos com rótulo directo ao lado, por isso o contraste do texto nunca
// depende delas. Os rótulos são traduzidos (PM_STATUS_KEYS).
const STATUS_ORDER = PM_STATUS_ORDER;

/** Meses abreviados no idioma activo, para o eixo do gráfico mensal. */
const MONTH_KEYS: TranslationKey[] = [
  'month.1', 'month.2', 'month.3', 'month.4', 'month.5', 'month.6',
  'month.7', 'month.8', 'month.9', 'month.10', 'month.11', 'month.12',
];

/** Linha da lista "abaixo da quota": o equipamento, quantas PMs já tem no ano e quantas
 *  ainda faltam para cumprir o contrato. */
interface QuotaGapRow {
  eq: EquipmentFull;
  scheduled: number;
  gap: number;
}

type QuotaGapSortKey = 'equipment' | 'hospital' | 'modality' | 'scheduled' | 'gap';

const QUOTA_GAP_SORT: SortAccessors<QuotaGapRow, QuotaGapSortKey> = {
  equipment: (row) => row.eq.name,
  hospital: (row) => row.eq.hospital_short_name ?? row.eq.hospital_name,
  modality: (row) => row.eq.modality,
  scheduled: (row) => row.scheduled,
  gap: (row) => row.gap,
};

// Categórica (dataviz) para as barras de modalidade/hospital — atribuída por ordem fixa.
const CATEGORICAL = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948'];

// Duração em dias (início e fim inclusive) sem passar por new Date(isoString) — a
// aritmética corre em UTC, como no resto da app (ver lib/dateFormat).
function inclusiveDays(startIso: string, endIso: string): number {
  const [ys, ms, ds] = startIso.split('-').map(Number);
  const [ye, me, de] = endIso.split('-').map(Number);
  if (
    ys === undefined || ms === undefined || ds === undefined ||
    ye === undefined || me === undefined || de === undefined
  ) {
    return 1;
  }
  const start = Date.UTC(ys, ms - 1, ds);
  const end = Date.UTC(ye, me - 1, de);
  return Math.round((end - start) / 86_400_000) + 1;
}

const isActive = (event: PMEvent) => event.status !== 'cancelled';

function loadColor(ratio: number): string {
  if (ratio < 0.6) return '#0ca30c';
  if (ratio < 0.85) return '#eda100';
  return '#d03b3b';
}

// ─── Componentes de apresentação ─────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}

function StatCard({ label, value, hint, accent }: StatCardProps) {
  return (
    <div className="pm-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: accent ?? '#0b0b0b' }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

// Os painéis deste ecrã usam o cartão partilhado (components/ui/Card) — o que aqui era
// um SectionCard próprio passou a ser só o nome local para ele.
const SectionCard = Card;

// Barra horizontal com rótulo à esquerda, valor directo à direita — o preenchimento
// escala face ao maior valor da série (max).
function BarRow({ label, value, max, color, suffix }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 py-0.5 text-sm">
      <span className="w-28 shrink-0 truncate text-gray-600" title={label}>
        {label}
      </span>
      <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100">
        <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-gray-500">
        {value}
        {suffix}
      </span>
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <EmptyState size="compact">{children}</EmptyState>;
}

// ─── Página ──────────────────────────────────────────────────────────────────

// Painel de indicadores — leitura agregada do plano de PMs de um ano (KPIs, distribuição
// por estado/mês/modalidade/hospital, carga por engenheiro/zona e cumprimento de quota).
// Ano por omissão = ano de planeamento activo (Topbar); busca os eventos com o snapshot
// puro (fetchYearEventsSnapshot) para não sobrepor os yearEvents do calendário/LoadMap.
export function Overview() {
  const t = useT();
  const monthLabels = useMemo(() => MONTH_KEYS.map((key) => t(key)), [t]);
  const planningYear = useCalendarStore((state) => state.planningYear);
  const [year, setYear] = useState(planningYear);
  const [events, setEvents] = useState<PMEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const equipment = useEquipmentStore((state) => state.equipment);
  const fetchEquipment = useEquipmentStore((state) => state.fetchEquipment);
  const engineers = useEngineerStore((state) => state.engineers);
  const fetchEngineers = useEngineerStore((state) => state.fetchEngineers);
  const hospitals = useHospitalStore((state) => state.hospitals);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const zones = useZoneStore((state) => state.zones);
  const fetchZones = useZoneStore((state) => state.fetchZones);

  useEffect(() => {
    fetchEquipment();
    fetchEngineers();
    fetchHospitals();
    fetchZones();
  }, [fetchEquipment, fetchEngineers, fetchHospitals, fetchZones]);

  // Segue o ano de planeamento da Topbar quando este muda (mantém o painel alinhado com o
  // resto da app), sem impedir a escolha local de outro ano no selector abaixo.
  useEffect(() => {
    setYear(planningYear);
  }, [planningYear]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchYearEventsSnapshot(year)
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const activeEquipment = useMemo(() => equipment.filter((eq) => eq.active), [equipment]);

  const kpis = useMemo(() => {
    const active = events.filter(isActive);
    const total = active.length;
    const pmDays = active.reduce((sum, event) => sum + inclusiveDays(event.start_date, event.end_date), 0);
    const completed = events.filter((event) => event.status === 'completed').length;
    const unassigned = active.filter((event) => !event.engineer_id).length;

    const equipmentWithinQuota = activeEquipment.filter(
      (eq) => countPmEventsForEquipmentInYear(eq.id, year, events) >= eq.pm_per_year,
    ).length;
    const quotaCoverage = activeEquipment.length > 0 ? equipmentWithinQuota / activeEquipment.length : 0;

    return {
      total,
      pmDays,
      completionRate: total > 0 ? completed / total : 0,
      unassigned,
      quotaCoverage,
      equipmentWithinQuota,
    };
  }, [events, activeEquipment, year]);

  const statusCounts = useMemo(() => {
    const counts = new Map<PMStatus, number>();
    for (const event of events) counts.set(event.status, (counts.get(event.status) ?? 0) + 1);
    return STATUS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 })).filter((row) => row.count > 0);
  }, [events]);
  const statusTotal = useMemo(() => statusCounts.reduce((sum, row) => sum + row.count, 0), [statusCounts]);

  const byModality = useMemo(() => {
    const eqById = new Map(equipment.map((eq) => [eq.id, eq]));
    const counts = new Map<string, number>();
    for (const event of events) {
      if (!isActive(event)) continue;
      const modality = eqById.get(event.equipment_id)?.modality ?? '—';
      counts.set(modality, (counts.get(modality) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [events, equipment]);

  // Ordem fixa das modalidades (por total decrescente) + cor categórica estável — partilhada
  // entre o empilhamento mensal e as barras de modalidade para as duas leituras casarem.
  const modalityOrder = useMemo(() => byModality.map((row) => row.name), [byModality]);
  const modalityColor = useMemo(() => {
    const index = new Map(modalityOrder.map((name, i) => [name, i]));
    return (name: string) => CATEGORICAL[(index.get(name) ?? 0) % CATEGORICAL.length] ?? '#2a78d6';
  }, [modalityOrder]);

  // PMs por mês repartidas por modalidade (uma barra empilhada por mês).
  const monthlyByModality = useMemo(() => {
    const eqById = new Map(equipment.map((eq) => [eq.id, eq]));
    const months = Array.from({ length: 12 }, () => new Map<string, number>());
    for (const event of events) {
      if (!isActive(event)) continue;
      const monthIndex = Number(event.start_date.slice(5, 7)) - 1;
      const bucket = months[monthIndex];
      if (!bucket) continue;
      const modality = eqById.get(event.equipment_id)?.modality ?? '—';
      bucket.set(modality, (bucket.get(modality) ?? 0) + 1);
    }
    return months;
  }, [events, equipment]);
  const monthlyTotals = useMemo(
    () => monthlyByModality.map((bucket) => [...bucket.values()].reduce((sum, n) => sum + n, 0)),
    [monthlyByModality],
  );
  const monthlyMax = useMemo(() => Math.max(1, ...monthlyTotals), [monthlyTotals]);

  const byHospital = useMemo(() => {
    const eqById = new Map(equipment.map((eq) => [eq.id, eq]));
    const counts = new Map<string, number>();
    for (const event of events) {
      if (!isActive(event)) continue;
      const name = eqById.get(event.equipment_id)?.hospital_short_name ?? eqById.get(event.equipment_id)?.hospital_name ?? '—';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [events, equipment]);

  const engineerLoads = useMemo(
    () =>
      engineers
        .filter((engineer) => engineer.active)
        .map((engineer) => ({
          id: engineer.id,
          name: engineer.name,
          ...computeEngineerLoadRatio(engineer.id, year, events),
        }))
        .sort((a, b) => b.ratio - a.ratio),
    [engineers, events, year],
  );

  const zoneLoads = useMemo(
    () =>
      zones
        .map((zone) => ({
          id: zone.id,
          name: zone.name,
          ...computeZoneLoadRatio(zone.id, year, events, engineers, equipment, zones),
        }))
        .filter((row) => row.capacityDays > 0 || row.demandDays > 0)
        .sort((a, b) => b.ratio - a.ratio),
    [zones, events, engineers, equipment, year],
  );

  // Equipamentos com PMs agendadas abaixo do contratado (pm_per_year) — a lista de acção
  // do planeamento: o que ainda falta agendar neste ano.
  const quotaGaps = useMemo<QuotaGapRow[]>(
    () =>
      activeEquipment
        .map((eq) => {
          const scheduled = countPmEventsForEquipmentInYear(eq.id, year, events);
          return { eq, scheduled, gap: eq.pm_per_year - scheduled };
        })
        .filter((row) => row.gap > 0),
    [activeEquipment, events, year],
  );

  // Maior falha primeiro — é a lista de acção do planeamento, e o que falta mais é o
  // que primeiro tem de ser agendado.
  const { rows: sortedQuotaGaps, sortableProps: quotaGapSortableProps } = useTableSort(
    quotaGaps,
    QUOTA_GAP_SORT,
    'gap',
    'desc',
  );

  const yearOptions = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];
  if (!yearOptions.includes(year)) yearOptions.push(year);
  yearOptions.sort((a, b) => a - b);

  return (
    <PageShell>
      <PageHeader
        title={t('overview.title')}
        description={t('overview.description')}
        actions={
          <label className="flex items-center gap-2 text-sm text-gray-600">
            {t('common.year')}
            <select className="pm-field" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div>
        {loading ? (
          <EmptyState>{t('overview.loading')}</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard
                label={t('overview.kpi.planned')}
                value={kpis.total}
                hint={t('overview.kpi.plannedHint', { count: kpis.pmDays })}
              />
              <StatCard
                label={t('overview.kpi.completion')}
                value={`${Math.round(kpis.completionRate * 100)}%`}
                hint={t('overview.kpi.completionHint', { count: kpis.total })}
                accent="#0ca30c"
              />
              <StatCard
                label={t('overview.kpi.unassigned')}
                value={kpis.unassigned}
                hint={t('overview.kpi.unassignedHint')}
                accent={kpis.unassigned > 0 ? '#ec835a' : undefined}
              />
              <StatCard
                label={t('overview.kpi.quota')}
                value={`${Math.round(kpis.quotaCoverage * 100)}%`}
                hint={t('overview.kpi.quotaHint', {
                  within: kpis.equipmentWithinQuota,
                  total: activeEquipment.length,
                })}
                accent={kpis.quotaCoverage < 1 ? '#eda100' : '#0ca30c'}
              />
              <StatCard
                label={t('overview.kpi.activeEquipment')}
                value={activeEquipment.length}
                hint={t('overview.kpi.activeEquipmentHint', { count: equipment.length })}
              />
              <StatCard
                label={t('overview.kpi.activeEngineers')}
                value={engineers.filter((engineer) => engineer.active).length}
                hint={t('overview.kpi.activeEngineersHint', { count: hospitals.length })}
              />
            </div>

            {/* Estado + Mês */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionCard
                title={t('overview.byStatus')}
                subtitle={t('overview.byStatusSubtitle', { count: statusTotal })}
              >
                {statusTotal === 0 ? (
                  <EmptyHint>{t('overview.noPmsThisYear')}</EmptyHint>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                      {statusCounts.map((row) => (
                        <div
                          key={row.status}
                          className="h-full"
                          style={{ width: `${(row.count / statusTotal) * 100}%`, backgroundColor: PM_STATUS_COLORS[row.status] }}
                          title={`${t(PM_STATUS_KEYS[row.status])}: ${row.count}`}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex flex-col gap-1">
                      {statusCounts.map((row) => (
                        <div key={row.status} className="flex items-center gap-2 text-sm">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PM_STATUS_COLORS[row.status] }} />
                          <span className="text-gray-600">{t(PM_STATUS_KEYS[row.status])}</span>
                          <span className="ml-auto tabular-nums text-gray-500">
                            {row.count}
                            <span className="ml-1 text-xs text-gray-400">({Math.round((row.count / statusTotal) * 100)}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>

              <SectionCard title={t('overview.byMonth')} subtitle={t('overview.byMonthSubtitle')}>
                {monthlyTotals.every((total) => total === 0) ? (
                  <EmptyHint>{t('overview.noPmsThisYear')}</EmptyHint>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex h-40 items-end gap-1.5">
                      {monthlyByModality.map((bucket, index) => {
                        const total = monthlyTotals[index] ?? 0;
                        return (
                          <div key={index} className="flex h-full flex-1 flex-col items-center">
                            <div className="flex w-full flex-1 flex-col justify-end gap-1">
                              <span className="text-center text-[10px] tabular-nums text-gray-400">
                                {total > 0 ? total : ''}
                              </span>
                              <div
                                className="flex w-full flex-col-reverse overflow-hidden rounded-t"
                                style={{ height: `${(total / monthlyMax) * 100}%`, minHeight: total > 0 ? 3 : 0 }}
                              >
                                {modalityOrder.map((modality) => {
                                  const count = bucket.get(modality) ?? 0;
                                  if (count === 0) return null;
                                  return (
                                    <div
                                      key={modality}
                                      style={{
                                        height: `${(count / total) * 100}%`,
                                        backgroundColor: modalityColor(modality),
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
                                      }}
                                      title={`${monthLabels[index]} · ${modality}: ${count}`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                            <span className="mt-1 text-[10px] text-gray-400">{monthLabels[index]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {modalityOrder.map((modality) => (
                        <div key={modality} className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: modalityColor(modality) }} />
                          {modality}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Modalidade + Hospital */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionCard title={t('overview.byModality')}>
                {byModality.length === 0 ? (
                  <EmptyHint>{t('overview.noData')}</EmptyHint>
                ) : (
                  <div className="flex flex-col">
                    {byModality.map((row) => (
                      <BarRow
                        key={row.name}
                        label={row.name}
                        value={row.count}
                        max={byModality[0]?.count ?? 1}
                        color={modalityColor(row.name)}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title={t('overview.topHospitals')} subtitle={t('overview.topHospitalsSubtitle')}>
                {byHospital.length === 0 ? (
                  <EmptyHint>{t('overview.noData')}</EmptyHint>
                ) : (
                  <div className="flex flex-col">
                    {byHospital.map((row) => (
                      <BarRow key={row.name} label={row.name} value={row.count} max={byHospital[0]?.count ?? 1} color="#2a78d6" />
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Carga engenheiro + zona */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionCard title={t('overview.engineerLoad')} subtitle={t('overview.engineerLoadSubtitle')}>
                {engineerLoads.length === 0 ? (
                  <EmptyHint>{t('overview.noActiveEngineers')}</EmptyHint>
                ) : (
                  <div className="flex max-h-64 flex-col overflow-y-auto">
                    {engineerLoads.map((row) => (
                      <BarRow
                        key={row.id}
                        label={row.name}
                        value={Math.round(row.ratio * 100)}
                        max={Math.max(100, ...engineerLoads.map((load) => Math.round(load.ratio * 100)))}
                        color={loadColor(row.ratio)}
                        suffix="%"
                      />
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title={t('overview.zoneLoad')} subtitle={t('overview.zoneLoadSubtitle')}>
                {zoneLoads.length === 0 ? (
                  <EmptyHint>{t('overview.noZoneLoad')}</EmptyHint>
                ) : (
                  <div className="flex max-h-64 flex-col overflow-y-auto">
                    {zoneLoads.map((row) => (
                      <BarRow
                        key={row.id}
                        label={row.name}
                        value={Math.round(row.ratio * 100)}
                        max={Math.max(100, ...zoneLoads.map((load) => Math.round(load.ratio * 100)))}
                        color={loadColor(row.ratio)}
                        suffix="%"
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Quota gaps */}
            <SectionCard
              padded={quotaGaps.length === 0}
              title={t('overview.quotaGaps')}
              subtitle={t('overview.quotaGapsSubtitle')}
            >
              {quotaGaps.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#0ca30c' }} />
                  {t('overview.quotaComplete')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="pm-table">
                    <thead>
                      <tr>
                        <SortableTh {...quotaGapSortableProps('equipment')}>{t('common.equipment')}</SortableTh>
                        <SortableTh {...quotaGapSortableProps('hospital')}>{t('common.hospital')}</SortableTh>
                        <SortableTh {...quotaGapSortableProps('modality')}>{t('common.modality')}</SortableTh>
                        <SortableTh align="right" {...quotaGapSortableProps('scheduled')}>
                          {t('overview.col.scheduled')}
                        </SortableTh>
                        <SortableTh align="right" {...quotaGapSortableProps('gap')}>
                          {t('overview.col.missing')}
                        </SortableTh>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedQuotaGaps.map(({ eq, scheduled, gap }) => (
                        <tr key={eq.id}>
                          <td className="py-1.5 pr-2 text-gray-800">{eq.name}</td>
                          <td className="py-1.5 pr-2 text-gray-600">{eq.hospital_short_name ?? eq.hospital_name}</td>
                          <td className="py-1.5 pr-2 text-gray-600">{eq.modality}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">
                            {scheduled}/{eq.pm_per_year}
                          </td>
                          <td className="py-1.5 pr-2 text-right">
                            <span
                              className="inline-flex min-w-[1.5rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                              style={{ backgroundColor: gap >= eq.pm_per_year ? '#d03b3b' : '#eda100' }}
                            >
                              {gap}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </PageShell>
  );
}
