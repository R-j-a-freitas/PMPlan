// Correcção pontual dos feriados de Espanha (2026). Uso: node scripts/actualizar-feriados-es-2026.mjs [--dry-run]
//
// 1. hospitals.locality (ES) passa de nome da Comunidade Autónoma ("Andalucía") para o
//    código ISO 3166-2 ("ES-AN"). A importação dos hospitais em falta gravou o nome, e
//    todo o matching com holidays.locality (conflitos, calendário, página de feriados)
//    compara por igualdade com o código — os feriados regionais nunca apareciam nem
//    bloqueavam PMs nesses hospitais.
// 2. Feriados regionais ES de 2026 substituídos pela lista oficial do BOE (Resolución de
//    17/10/2025, BOE-A-2025-21667). A Nager.Date falhava as passagens para segunda-feira
//    (2/11 e 7/12, com 1/11 e 6/12 a um domingo), o San José em 5 comunidades, e trazia
//    feriados que não existem em 2026 (17/05 na Galiza, 31/05 em Castilla-La Mancha).
// 3. Regras de feriados locais ES (holiday_rules, country='ES', locality = hospitals.city)
//    para cada cidade com hospital, e a expansão para 2026. Fontes: calendário das
//    capitais de província 2026, DOGC 17/12/2025 (Catalunha), DOE (Extremadura),
//    Generalitat Valenciana e anúncios municipais. As fiestas locales espanholas são
//    fixadas ano a ano: as regras "fixas" desta lista reflectem a data de 2026 e devem
//    ser revistas (botão Editar na página Feriados) quando sair o calendário de 2027.
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.service-role', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.service-role.');
  process.exit(1);
}
const DRY_RUN = process.argv.includes('--dry-run');
const YEAR = 2026;
const EASTER_2026 = new Date(Date.UTC(2026, 3, 5));

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── 1. Comunidade Autónoma: nome → código ISO ──────────────────────────────────
const REGION_CODE_BY_NAME = {
  'Andalucía': 'ES-AN',
  'Aragón': 'ES-AR',
  'Principado de Asturias': 'ES-AS',
  'Illes Balears': 'ES-IB',
  'Canarias': 'ES-CN',
  'Cantabria': 'ES-CB',
  'Castilla-La Mancha': 'ES-CM',
  'Castilla y León': 'ES-CL',
  'Cataluña': 'ES-CT',
  'Extremadura': 'ES-EX',
  'Galicia': 'ES-GA',
  'Comunidad de Madrid': 'ES-MD',
  'Región de Murcia': 'ES-MC',
  'Comunidad Foral de Navarra': 'ES-NC',
  'País Vasco': 'ES-PV',
  'La Rioja': 'ES-RI',
  'Comunitat Valenciana': 'ES-VC',
};

// ─── 2. Feriados de Comunidade Autónoma 2026 (BOE-A-2025-21667) ─────────────────
// Só os que não são nacionais para toda a Espanha (esses continuam a vir da Nager.Date).
const JS = ['04-02', 'Jueves Santo'];
const LP = ['04-06', 'Lunes de Pascua'];
const SJOSE = ['03-19', 'San José'];
const NOV2 = ['11-02', 'Lunes siguiente a Todos los Santos'];
const DEC7 = ['12-07', 'Lunes siguiente al Día de la Constitución'];
const SJUAN = ['06-24', 'San Juan'];
const REGIONAL_2026 = {
  'ES-AN': [['02-28', 'Día de Andalucía'], JS, NOV2, DEC7],
  'ES-AR': [JS, ['04-23', 'San Jorge / Día de Aragón'], NOV2, DEC7],
  'ES-AS': [JS, ['09-08', 'Día de Asturias'], NOV2, DEC7],
  'ES-IB': [['03-02', 'Lunes siguiente al Día de les Illes Balears'], JS, LP, ['12-26', 'San Esteban']],
  'ES-CN': [JS, ['05-30', 'Día de Canarias'], NOV2],
  'ES-CB': [JS, ['07-28', 'Día de las Instituciones de Cantabria'], ['09-15', 'La Bien Aparecida'], DEC7],
  'ES-CM': [JS, LP, ['06-04', 'Corpus Christi'], NOV2],
  'ES-CL': [JS, ['04-23', 'Fiesta de Castilla y León'], NOV2, DEC7],
  'ES-CT': [LP, SJUAN, ['09-11', 'Fiesta Nacional de Cataluña'], ['12-26', 'San Esteban']],
  'ES-EX': [JS, ['09-08', 'Día de Extremadura'], NOV2, DEC7],
  'ES-GA': [SJOSE, JS, SJUAN, ['07-25', 'Santiago Apóstol / Día Nacional de Galicia']],
  'ES-MD': [JS, ['05-02', 'Fiesta de la Comunidad de Madrid'], NOV2, DEC7],
  'ES-MC': [SJOSE, JS, ['06-09', 'Día de la Región de Murcia'], DEC7],
  'ES-NC': [SJOSE, JS, LP, NOV2],
  'ES-PV': [SJOSE, JS, LP, ['07-25', 'Santiago Apóstol']],
  'ES-RI': [JS, LP, ['06-09', 'Día de La Rioja'], DEC7],
  'ES-VC': [SJOSE, LP, SJUAN, ['10-09', 'Día de la Comunitat Valenciana']],
};

// ─── 3. Fiestas locales por cidade (locality = hospitals.city, tal como está gravado) ──
// fixed(mm, dd, nome) ou easter(offset, nome) — offset em dias a partir do Domingo de
// Páscoa (5/4/2026). Nomes únicos por cidade: holiday_rules é unique(country, locality, name).
const fixed = (month, day, name) => ({ rule_type: 'fixed_date', fixed_month: month, fixed_day: day, easter_offset_days: null, name });
const easter = (offset, name) => ({ rule_type: 'easter_relative', fixed_month: null, fixed_day: null, easter_offset_days: offset, name });

const LOCAL_RULES = {
  Granada: [fixed(1, 2, 'Toma de Granada'), easter(60, 'Corpus Christi')],
  Cadiz: [easter(-48, 'Lunes de Carnaval'), fixed(10, 7, 'Virgen del Rosario')],
  Jaen: [fixed(6, 11, 'Virgen de la Capilla'), fixed(11, 25, 'Santa Catalina')],
  Malaga: [fixed(8, 19, 'Toma de Málaga'), fixed(9, 8, 'Virgen de la Victoria')],
  Sevilla: [easter(17, 'Miércoles de Feria'), easter(60, 'Corpus Christi')],
  Huelva: [fixed(8, 3, 'Fiesta Colombina'), fixed(9, 8, 'Virgen de la Cinta')],
  Algeciras: [fixed(6, 24, 'Feria Real (San Juan)'), fixed(7, 16, 'Virgen del Carmen')],
  Jerez: [fixed(5, 11, 'Feria del Caballo'), fixed(9, 24, 'Fiestas de Otoño')],
  Cordoba: [fixed(9, 8, 'Virgen de la Fuensanta'), fixed(10, 24, 'San Rafael')],
  Zaragoza: [fixed(1, 29, 'San Valero'), fixed(3, 5, 'Cincomarzada')],
  Huesca: [fixed(1, 22, 'San Vicente'), fixed(8, 10, 'San Lorenzo')],
  'Las Palmas de Gran Canaria': [
    easter(-47, 'Martes de Carnaval'),
    fixed(6, 24, 'San Juan (fundación de la ciudad)'),
    fixed(9, 8, 'Virgen del Pino (fiesta insular)'),
  ],
  'Santa Cruz de Tenerife': [
    fixed(2, 2, 'Virgen de la Candelaria (fiesta insular)'),
    easter(-47, 'Martes de Carnaval'),
    fixed(5, 4, 'Lunes siguiente a la Fiesta de la Cruz'),
  ],
  Santander: [easter(50, 'Virgen del Mar'), fixed(7, 25, 'Santiago Apóstol')],
  Salamanca: [fixed(6, 12, 'San Juan de Sahagún'), fixed(9, 8, 'Virgen de la Vega')],
  Talavera: [fixed(5, 15, 'San Isidro'), fixed(9, 8, 'Fiesta local de septiembre')],
  Toledo: [fixed(1, 23, 'San Ildefonso'), fixed(11, 26, 'Aniversario Ciudad Patrimonio de la Humanidad')],
  'Alcazar de San Juan': [fixed(9, 8, 'Feria y Fiestas'), fixed(12, 28, 'Fiesta local de diciembre')],
  Cuenca: [fixed(6, 1, 'Virgen de la Luz'), fixed(9, 21, 'San Mateo')],
  Albacete: [fixed(6, 24, 'San Juan'), fixed(9, 8, 'Virgen de Los Llanos')],
  Guadalajara: [fixed(9, 8, 'Virgen de la Antigua'), fixed(9, 18, 'Viernes de Ferias')],
  'Ciudad Real': [easter(50, 'Virgen de Alarcos'), fixed(8, 22, 'Octava de la Virgen')],
  Reus: [fixed(6, 29, 'Sant Pere'), fixed(9, 25, 'Mare de Déu de Misericòrdia')],
  Terrassa: [easter(-3, 'Dijous Sant'), fixed(7, 6, 'Festa Major')],
  Barcelona: [easter(50, 'Pascua Granada'), fixed(9, 24, 'La Mercè')],
  Manresa: [fixed(2, 21, 'Festa de la Llum'), fixed(8, 31, 'Festa Major')],
  Tarragona: [fixed(8, 19, 'Sant Magí'), fixed(9, 23, 'Santa Tecla')],
  "L'Hospitalet de Llobregat": [easter(50, 'Pascua Granada'), fixed(9, 24, 'La Mercè')],
  Madrid: [fixed(5, 15, 'San Isidro'), fixed(11, 9, 'La Almudena')],
  Pamplona: [fixed(11, 30, 'San Saturnino (lunes siguiente)'), fixed(12, 3, 'Día de Navarra')],
  Gandia: [easter(8, 'Lunes de San Vicente'), fixed(10, 5, 'Sant Francesc de Borja')],
  Alzira: [easter(8, 'San Vicente Ferrer'), fixed(7, 23, 'San Bernardo')],
  Benidorm: [fixed(11, 9, 'Fiestas Patronales (lunes)'), fixed(11, 10, 'Fiestas Patronales (martes)')],
  Valencia: [fixed(1, 22, 'San Vicente Mártir'), easter(8, 'San Vicente Ferrer')],
  Torrevieja: [easter(8, 'Lunes de San Vicente'), fixed(7, 16, 'Virgen del Carmen')],
  'Castellón': [easter(-27, 'Lunes de Magdalena'), fixed(6, 29, 'San Pedro')],
  Elche: [easter(8, 'Lunes de San Vicente'), fixed(12, 29, 'Venida de la Virgen')],
  Vigo: [fixed(3, 28, 'Festa da Reconquista'), fixed(8, 17, 'San Roque (día seguinte)')],
  'Torrejón de Ardoz': [fixed(6, 22, 'Fiestas Populares (lunes)'), fixed(6, 23, 'Fiestas Populares (martes)')],
  Merida: [fixed(5, 21, 'Fiesta local de mayo'), fixed(12, 10, 'Santa Eulalia')],
  Badajoz: [easter(-47, 'Martes de Carnaval'), fixed(6, 24, 'San Juan')],
  'Cáceres': [fixed(4, 23, 'San Jorge'), fixed(5, 29, 'Feria de San Fernando')],
  Plasencia: [fixed(6, 11, 'Feria de San Bernabé (jueves)'), fixed(6, 12, 'Feria de San Bernabé (viernes)')],
  'Palma de Mallorca': [fixed(1, 20, 'San Sebastián')],
  'Logroño': [fixed(6, 11, 'San Bernabé'), fixed(9, 21, 'San Mateo')],
  Vitoria: [fixed(4, 28, 'San Prudencio'), fixed(8, 5, 'Virgen Blanca')],
  Barakaldo: [fixed(7, 16, 'Virgen del Carmen'), fixed(7, 31, 'San Ignacio de Loyola')],
  Oviedo: [easter(51, 'Martes de Campo'), fixed(9, 21, 'San Mateo')],
  Murcia: [easter(2, 'Bando de la Huerta'), fixed(9, 15, 'Romería de la Fuensanta')],
};

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function ruleDate(rule, year) {
  if (rule.rule_type === 'fixed_date') {
    return `${year}-${String(rule.fixed_month).padStart(2, '0')}-${String(rule.fixed_day).padStart(2, '0')}`;
  }
  return isoDate(new Date(EASTER_2026.getTime() + rule.easter_offset_days * 86_400_000));
}

// ─── Execução ────────────────────────────────────────────────────────────────────
const hospitals = await rest('hospitals?select=id,name,locality,city&country=eq.ES');

const localityUpdates = hospitals
  .filter((hospital) => hospital.locality && REGION_CODE_BY_NAME[hospital.locality])
  .map((hospital) => ({ id: hospital.id, from: hospital.locality, to: REGION_CODE_BY_NAME[hospital.locality] }));
const unknownLocalities = hospitals.filter(
  (hospital) => hospital.locality && !hospital.locality.startsWith('ES-') && !REGION_CODE_BY_NAME[hospital.locality],
);
if (unknownLocalities.length > 0) {
  console.error('✗ Comunidades Autónomas sem código conhecido:', unknownLocalities.map((h) => `${h.name}: ${h.locality}`));
  process.exit(1);
}

const hospitalCities = new Set(hospitals.map((hospital) => hospital.city).filter(Boolean));
const citiesWithoutRules = [...hospitalCities].filter((city) => !LOCAL_RULES[city]);
const rulesWithoutHospital = Object.keys(LOCAL_RULES).filter((city) => !hospitalCities.has(city));
if (citiesWithoutRules.length > 0 || rulesWithoutHospital.length > 0) {
  console.error('✗ Cidades desalinhadas:', { citiesWithoutRules, rulesWithoutHospital });
  process.exit(1);
}

const regionalRows = Object.entries(REGIONAL_2026).flatMap(([locality, entries]) =>
  entries.map(([monthDay, name]) => ({
    zone_id: null,
    locality,
    country: 'ES',
    date: `${YEAR}-${monthDay}`,
    name,
    type: 'regional',
    year: YEAR,
    source: 'boe',
  })),
);

const ruleRows = Object.entries(LOCAL_RULES).flatMap(([locality, rules]) =>
  rules.map(({ name, ...rule }) => ({ country: 'ES', locality, name, ...rule, active: true })),
);
const localRows = ruleRows.map((rule) => ({
  zone_id: null,
  locality: rule.locality,
  country: 'ES',
  date: ruleDate(rule, YEAR),
  name: rule.name,
  type: 'local',
  year: YEAR,
  source: 'holiday-rule',
}));

console.log(`Hospitais ES a corrigir: ${localityUpdates.length}`);
console.log(`Feriados regionais ES ${YEAR} (BOE): ${regionalRows.length}`);
console.log(`Regras locais ES: ${ruleRows.length} em ${Object.keys(LOCAL_RULES).length} cidades`);
if (DRY_RUN) {
  for (const row of localRows) console.log(`  ${row.locality} | ${row.date} | ${row.name}`);
  process.exit(0);
}

for (const update of localityUpdates) {
  await rest(`hospitals?id=eq.${update.id}`, { method: 'PATCH', body: { locality: update.to } });
}
console.log('✓ hospitals.locality convertido para códigos ISO.');

// Regionais ES de 2026 (Nager.Date + as duas manuais da Galiza) → lista BOE.
await rest(`holidays?country=eq.ES&year=eq.${YEAR}&locality=like.ES-*`, { method: 'DELETE' });
await rest('holidays', { method: 'POST', body: regionalRows, prefer: 'return=minimal' });
console.log('✓ Feriados regionais ES de 2026 substituídos pela lista do BOE.');

// Os dois feriados de Vigo introduzidos à mão passam a vir de regra, como as restantes cidades.
await rest(`holidays?country=eq.ES&year=eq.${YEAR}&locality=eq.Vigo`, { method: 'DELETE' });
await rest('holiday_rules?on_conflict=country,locality,name,valid_from', {
  method: 'POST',
  body: ruleRows,
  prefer: 'resolution=merge-duplicates,return=minimal',
});
await rest('holidays?on_conflict=country,zone_id,locality,date,name', {
  method: 'POST',
  body: localRows,
  prefer: 'resolution=merge-duplicates,return=minimal',
});
console.log('✓ Regras locais ES criadas e aplicadas a 2026.');
