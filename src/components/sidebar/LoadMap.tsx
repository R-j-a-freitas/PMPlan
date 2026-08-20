import { useEffect, useMemo, useState } from 'react';
import {
  computeEngineerLoadRatio,
  computeZoneLoadRatio,
  ZONE_LOAD_WARNING_THRESHOLD,
} from '../../lib/conflictRules';
import { useCalendarStore, useEngineerStore, useEquipmentStore, useZoneStore } from '../../stores';
import { SIDEBAR_INDENT_PX, SidebarSection } from './SidebarSection';

const LOAD_LOW_THRESHOLD = 0.6;

interface MetricsInfo {
  formula: string;
  lines: { term: string; text: string }[];
  notes: string[];
}

const ZONE_METRICS_INFO: MetricsInfo = {
  formula: 'Carga = procura ÷ capacidade, em dias-PM',
  lines: [
    {
      term: 'Capacidade',
      text: 'nº de engenheiros da zona × dias de trabalho do ano (1 dia-PM por engenheiro por dia).',
    },
    {
      term: 'Procura',
      text: 'duração (início e fim inclusive) das PMs activas com início nesse ano, cujo equipamento está nesta zona.',
    },
    {
      term: 'Dias de trabalho',
      text: 'segunda a sexta, mais os sábados/domingos em que há PMs marcadas — um fim-de-semana trabalhado conta como dia normal.',
    },
  ],
  notes: [
    'Uma zona-mãe inclui sempre as zonas filhas, tanto nos engenheiros como nas PMs — por isso a percentagem da mãe não é a soma das filhas.',
    'Um engenheiro que cubra várias zonas conta por inteiro em cada uma delas.',
    'Feriados não são descontados aos dias de trabalho.',
  ],
};

const ENGINEER_METRICS_INFO: MetricsInfo = {
  formula: 'Carga = procura ÷ capacidade, em dias-PM',
  lines: [
    { term: 'Capacidade', text: 'dias de trabalho do ano (1 dia-PM por dia).' },
    {
      term: 'Procura',
      text: 'duração (início e fim inclusive) das PMs activas atribuídas a este engenheiro, com início nesse ano.',
    },
    {
      term: 'Dias de trabalho',
      text: 'segunda a sexta, mais os sábados/domingos em que ele tem PMs marcadas — um fim-de-semana trabalhado conta como dia normal.',
    },
  ],
  notes: ['Feriados e férias não são descontados aos dias de trabalho.'],
};

function loadColorClassName(ratio: number): string {
  if (ratio < LOAD_LOW_THRESHOLD) return 'bg-green-500';
  if (ratio < ZONE_LOAD_WARNING_THRESHOLD) return 'bg-amber-500';
  return 'bg-red-500';
}

// Ícone "i" a explicar as métricas de carga. Abre ao passar o rato e fixa-se ao clique
// (o `title` nativo que estava aqui antes não dava para ler com calma — desaparecia
// sozinho e não formatava a explicação, que tem várias linhas e ressalvas).
function InfoIcon({ label, info }: { label: string; info: MetricsInfo }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const open = pinned || hovered;

  // Fixo com o clique, fecha com Escape — sem isto ficaria preso se o rato saísse por
  // fora do popover (que está fora do fluxo, em absolute).
  useEffect(() => {
    if (!pinned) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPinned(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pinned]);

  return (
    <span className="relative flex shrink-0">
      <button
        type="button"
        onClick={() => setPinned((value) => !value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-expanded={open}
        aria-label={`Como é calculada a ${label}`}
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold leading-none text-gray-500 hover:bg-gray-300 hover:text-gray-700"
      >
        i
      </button>
      {open && (
        // z-20 fica acima das linhas da sidebar; a largura fixa evita que o popover
        // encolha com a coluna estreita da sidebar.
        <div
          role="tooltip"
          className="absolute right-0 top-5 z-20 w-72 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-float"
        >
          <p className="mb-2 text-xs font-semibold text-gray-900">{info.formula}</p>
          <dl className="flex flex-col gap-1.5">
            {info.lines.map(({ term, text }) => (
              <div key={term}>
                <dt className="text-[11px] font-semibold text-gray-700">{term}</dt>
                <dd className="text-[11px] leading-snug text-gray-600">{text}</dd>
              </div>
            ))}
          </dl>
          <ul className="mt-2 flex list-disc flex-col gap-1 border-t border-gray-100 pl-4 pt-2">
            {info.notes.map((note) => (
              <li key={note} className="text-[11px] leading-snug text-gray-500">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}

// Mapa de carga verde/amarelo/vermelho (secção 10) — calculado no Zustand/selectors, não
// no FullCalendar (sem Resource View Premium). Cálculo anual sobre o ano de planeamento
// activo (Topbar) — não mensal. Duas leituras, por zona (zona-mãe agrega as filhas, ver
// conflictRules.computeZoneLoadRatio) e por engenheiro, ambas colapsadas por omissão.
export function LoadMap() {
  const planningYear = useCalendarStore((state) => state.planningYear);
  // `calendarStore.events` só tem o que a vista activa do calendário tem carregado (Mês/
  // Semana ficam com uma fatia pequena do ano) — as métricas de carga precisam sempre do
  // ano completo, por isso usam `yearEvents`. O fetch vive no Dashboard (única página
  // que monta a Sidebar/LoadMap) — buscar também aqui duplicava a query por cada
  // mudança de planningYear.
  const yearEvents = useCalendarStore((state) => state.yearEvents);
  const zones = useZoneStore((state) => state.zones);
  const equipment = useEquipmentStore((state) => state.equipment);
  const engineers = useEngineerStore((state) => state.engineers);

  // Achatada pela hierarquia (cada zona-mãe seguida das suas filhas, indentadas) em vez
  // da ordem crua do store: a percentagem da mãe agrega as filhas, e lado a lado numa
  // lista plana não se via de onde é que a carga dela vinha.
  const zoneLoads = useMemo(() => {
    const rows: { id: string; name: string; ratio: number; depth: number }[] = [];
    const seen = new Set<string>();

    function pushZone(zone: (typeof zones)[number], depth: number) {
      if (seen.has(zone.id)) return; // guarda contra um ciclo pai↔filho nos dados do cliente
      seen.add(zone.id);
      // computeZoneLoadRatio já agrega as zonas filhas (zona-mãe nunca fica a 0% só por
      // não ter nada atribuído directamente a ela) — não pré-filtrar aqui.
      const { ratio } = computeZoneLoadRatio(zone.id, planningYear, yearEvents, engineers, equipment, zones);
      rows.push({ id: zone.id, name: zone.name, ratio, depth });
      for (const child of zones.filter((candidate) => candidate.parent_zone_id === zone.id)) {
        pushZone(child, depth + 1);
      }
    }

    for (const zone of zones.filter((candidate) => !candidate.parent_zone_id)) pushZone(zone, 0);
    // Zona cuja mãe não está na lista não pode desaparecer do mapa de carga — entra à raiz.
    for (const zone of zones) pushZone(zone, 0);

    return rows;
  }, [zones, yearEvents, equipment, engineers, planningYear]);

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
      <SidebarSection
        title={`Carga de zona (${planningYear})`}
        titleAccessory={<InfoIcon label="carga de zona" info={ZONE_METRICS_INFO} />}
        defaultCollapsed
      >
        <div className="flex flex-col">
          {zoneLoads.map(({ id, name, ratio, depth }) => (
            <div key={id} className="pm-sidebar-row" style={{ marginLeft: depth * SIDEBAR_INDENT_PX }}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${loadColorClassName(ratio)}`} />
              <span className={`truncate ${depth === 0 ? 'font-medium' : 'text-gray-600'}`}>{name}</span>
              <span className="ml-auto text-[11px] tabular-nums text-gray-500">{Math.round(ratio * 100)}%</span>
            </div>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection
        title={`Carga por engenheiro (${planningYear})`}
        titleAccessory={<InfoIcon label="carga por engenheiro" info={ENGINEER_METRICS_INFO} />}
        defaultCollapsed
      >
        <div className="flex flex-col">
          {engineerLoads.map(({ id, name, ratio }) => (
            <div key={id} className="pm-sidebar-row">
              <span className={`h-2 w-2 shrink-0 rounded-full ${loadColorClassName(ratio)}`} />
              <span className="truncate">{name}</span>
              <span className="ml-auto text-[11px] tabular-nums text-gray-500">{Math.round(ratio * 100)}%</span>
            </div>
          ))}
        </div>
      </SidebarSection>
    </>
  );
}
