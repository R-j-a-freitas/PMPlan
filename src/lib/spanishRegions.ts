// Comunidades Autónomas de Espanha com o código ISO 3166-2 que a Nager.Date usa no
// campo "counties" dos feriados regionais — usar estes códigos como hospitals.locality
// para os hospitais espanhóis garante que o matching com holidays.locality funciona
// directamente, sem tradução nenhuma.
export const SPANISH_REGIONS: { code: string; name: string }[] = [
  { code: 'ES-AN', name: 'Andaluzia' },
  { code: 'ES-AR', name: 'Aragão' },
  { code: 'ES-AS', name: 'Astúrias' },
  { code: 'ES-CB', name: 'Cantábria' },
  { code: 'ES-CL', name: 'Castela e Leão' },
  { code: 'ES-CM', name: 'Castela-Mancha' },
  { code: 'ES-CN', name: 'Canárias' },
  { code: 'ES-CT', name: 'Catalunha' },
  { code: 'ES-EX', name: 'Estremadura' },
  { code: 'ES-GA', name: 'Galiza' },
  { code: 'ES-IB', name: 'Ilhas Baleares' },
  { code: 'ES-MC', name: 'Múrcia' },
  { code: 'ES-MD', name: 'Madrid' },
  { code: 'ES-NC', name: 'Navarra' },
  { code: 'ES-PV', name: 'País Basco' },
  { code: 'ES-RI', name: 'La Rioja' },
  { code: 'ES-VC', name: 'Comunidade Valenciana' },
];

export function spanishRegionName(code: string): string {
  return SPANISH_REGIONS.find((region) => region.code === code)?.name ?? code;
}

// Nomes oficiais em espanhol/línguas co-oficiais, como vêm nas folhas de cálculo de
// clientes — a importação de 2026 gravou "Andalucía" em vez de "ES-AN" e, com isso,
// nenhum feriado regional casava com esses hospitais.
const SPANISH_OFFICIAL_NAMES: Record<string, string> = {
  'ES-AN': 'Andalucía',
  'ES-AR': 'Aragón',
  'ES-AS': 'Principado de Asturias',
  'ES-CB': 'Cantabria',
  'ES-CL': 'Castilla y León',
  'ES-CM': 'Castilla-La Mancha',
  'ES-CN': 'Canarias',
  'ES-CT': 'Cataluña',
  'ES-EX': 'Extremadura',
  'ES-GA': 'Galicia',
  'ES-IB': 'Illes Balears',
  'ES-MC': 'Región de Murcia',
  'ES-MD': 'Comunidad de Madrid',
  'ES-NC': 'Comunidad Foral de Navarra',
  'ES-PV': 'País Vasco',
  'ES-RI': 'La Rioja',
  'ES-VC': 'Comunitat Valenciana',
};

function normalizeRegionText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

const REGION_CODE_BY_TEXT = new Map<string, string>(
  SPANISH_REGIONS.flatMap((region) => [
    [normalizeRegionText(region.code), region.code],
    [normalizeRegionText(region.name), region.code],
    [normalizeRegionText(SPANISH_OFFICIAL_NAMES[region.code] ?? region.name), region.code],
  ]),
);

/** Código ISO ("ES-AN") a partir do próprio código ou do nome da Comunidade Autónoma em
 *  português ou espanhol. Devolve o texto original quando não reconhece — quem chama
 *  decide se isso é erro. */
export function toSpanishRegionCode(value: string): string {
  return REGION_CODE_BY_TEXT.get(normalizeRegionText(value)) ?? value;
}
