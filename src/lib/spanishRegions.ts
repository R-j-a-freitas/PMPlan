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
