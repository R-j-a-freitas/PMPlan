import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  computeEngineerLoadRatio,
  computeZoneLoadRatio,
  ZONE_LOAD_WARNING_THRESHOLD,
} from '../../lib/conflictRules';
import { useCalendarStore, useEngineerStore, useEquipmentStore, useZoneStore } from '../../stores';

const LOAD_LOW_THRESHOLD = 0.6;

const ZONE_METRICS_INFO =
  'Carga = dias-PM pedidos ÷ dias-PM de capacidade.\n' +
  'Capacidade = nº de engenheiros da zona (zona-mãe inclui as zonas filhas) × dias úteis do ano.\n' +
  'Procura = duração (início e fim inclusive) das PMs activas com início nesse ano, cujo equipamento está nesta zona (ou numa filha).';

const ENGINEER_METRICS_INFO =
  'Carga = dias-PM pedidos ÷ dias-PM de capacidade.\n' +
  'Capacidade = dias úteis do ano (1 dia-PM por dia útil).\n' +
  'Procura = duração (início e fim inclusive) das PMs activas atribuídas a este engenheiro, com início nesse ano.';

function loadColorClassName(ratio: number): string {
  if (ratio < LOAD_LOW_THRESHOLD) return 'bg-green-500';
  if (ratio < ZONE_LOAD_WARNING_THRESHOLD) return 'bg-amber-500';
  return 'bg-red-500';
}

// Ícone "i" com tooltip nativo (mesma convenção já usada nos feriados do calendário —
// `title` em vez de um componente de popover novo) a explicar as métricas usadas.
function InfoIcon({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold leading-none text-gray-500"
    >
      i
    </span>
  );
}

interface LoadSectionProps {
  title: string;
  infoText: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function LoadSection({ title, infoText, collapsed, onToggle, children }: LoadSectionProps) {
  return (
    <div className="border-b border-gray-200 p-2">
      <div className="mb-1 flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? `Expandir ${title}` : `Colapsar ${title}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <h3 className="text-xs font-semibold uppercase text-gray-500">{title}</h3>
        <InfoIcon text={infoText} />
      </div>
      {!collapsed && <div className="flex flex-col gap-1">{children}</div>}
    </div>
  );
}

// Mapa de carga verde/amarelo/vermelho (secção 10) — calculado no Zustand/selectors, não
// no FullCalendar (sem Resource View Premium). Cálculo anual sobre o ano de planeamento
// activo (Topbar) — não mensal. Duas leituras, por zona (zona-mãe agrega as filhas, ver
// conflictRules.computeZoneLoadRatio) e por engenheiro, ambas colapsadas por omissão.
export function LoadMap() {
  const planningYear = useCalendarStore((state) => state.planningYear);
  const yearEvents = useCalendarStore((state) => state.yearEvents);
  const fetchYearEvents = useCalendarStore((state) => state.fetchYearEvents);
  const zones = useZoneStore((state) => state.zones);
  const equipment = useEquipmentStore((state) => state.equipment);
  const engineers = useEngineerStore((state) => state.engineers);

  const [zoneCollapsed, setZoneCollapsed] = useState(true);
  const [engineerCollapsed, setEngineerCollapsed] = useState(true);

  // `calendarStore.events` só tem o que a vista activa do calendário tem carregado (Mês/
  // Semana ficam com uma fatia pequena do ano) — as métricas de carga precisam sempre do
  // ano completo, por isso usam `yearEvents`, pedido à parte aqui.
  useEffect(() => {
    fetchYearEvents(planningYear);
  }, [planningYear, fetchYearEvents]);

  const zoneLoads = useMemo(
    () =>
      zones.map((zone) => {
        // computeZoneLoadRatio já agrega as zonas filhas (zona-mãe nunca fica a 0% só por
        // não ter nada atribuído directamente a ela) — não pré-filtrar aqui.
        const { ratio } = computeZoneLoadRatio(zone.id, planningYear, yearEvents, engineers, equipment, zones);
        return { id: zone.id, name: zone.name, ratio };
      }),
    [zones, yearEvents, equipment, engineers, planningYear],
  );

  const engineerLoads = useMemo(
    () =>
      engineers.map((engineer) => {
        const { ratio } = computeEngineerLoadRatio(engineer.id, planningYear, yearEvents);
        return { id: engineer.id, name: engineer.name, ratio };
      }),
    [engineers, yearEvents, planningYear],
  );

  return (
    <>
      <LoadSection
        title={`Carga de zona (${planningYear})`}
        infoText={ZONE_METRICS_INFO}
        collapsed={zoneCollapsed}
        onToggle={() => setZoneCollapsed((value) => !value)}
      >
        {zoneLoads.map(({ id, name, ratio }) => (
          <div key={id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${loadColorClassName(ratio)}`} />
            <span className="truncate">{name}</span>
            <span className="ml-auto text-xs text-gray-500">{Math.round(ratio * 100)}%</span>
          </div>
        ))}
      </LoadSection>

      <LoadSection
        title={`Carga por engenheiro (${planningYear})`}
        infoText={ENGINEER_METRICS_INFO}
        collapsed={engineerCollapsed}
        onToggle={() => setEngineerCollapsed((value) => !value)}
      >
        {engineerLoads.map(({ id, name, ratio }) => (
          <div key={id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${loadColorClassName(ratio)}`} />
            <span className="truncate">{name}</span>
            <span className="ml-auto text-xs text-gray-500">{Math.round(ratio * 100)}%</span>
          </div>
        ))}
      </LoadSection>
    </>
  );
}
