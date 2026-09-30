// Leitura da resolução anual do BOE com a "relación de fiestas laborales" — procura no
// sumário diário (API de dados abertos) e extrai da tabela os feriados de cada Comunidade
// Autónoma. Sem dependências, para correr na VPS com o Node do sistema, como o keep-alive.
//
// A tabela tem uma linha por data e uma coluna por comunidade, com três marcas:
//   *    fiesta nacional no sustituible
//   **   fiesta nacional que a comunidade não substituiu (aplica-se lá)
//   ***  fiesta de la Comunidad Autónoma
// Para o PMPlan interessa o que se aplica em cada comunidade e NÃO é nacional para toda a
// Espanha (esses continuam a vir da Nager.Date): uma data marcada nas 17 comunidades é
// nacional; qualquer outra marca é um feriado regional dessa comunidade.

const BOE_BASE = 'https://www.boe.es';

// Cabeçalhos das colunas tal como o BOE os escreve → código ISO usado em holidays.locality.
// Ceuta e Melilla ficam de fora: não há hospitais lá, e não têm código de Comunidade.
const REGION_BY_HEADER = [
  [/^andaluc/i, 'ES-AN'],
  [/^arag/i, 'ES-AR'],
  [/^asturias/i, 'ES-AS'],
  [/balears|baleares/i, 'ES-IB'],
  [/^canarias/i, 'ES-CN'],
  [/^cantabria/i, 'ES-CB'],
  [/^castilla-la mancha/i, 'ES-CM'],
  [/^castilla y le/i, 'ES-CL'],
  [/^catalu/i, 'ES-CT'],
  [/^extremadura/i, 'ES-EX'],
  [/^galicia/i, 'ES-GA'],
  [/madrid/i, 'ES-MD'],
  [/murcia/i, 'ES-MC'],
  [/navarra/i, 'ES-NC'],
  [/pa[ií]s vasco/i, 'ES-PV'],
  [/rioja/i, 'ES-RI'],
  [/valenciana/i, 'ES-VC'],
];
export const REGION_CODES = REGION_BY_HEADER.map(([, code]) => code);

const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-z])(acute|tilde|uml);/gi, (_, letter, accent) => {
      const map = { acute: '́', tilde: '̃', uml: '̈' };
      return `${letter}${map[accent.toLowerCase()]}`.normalize('NFC');
    });
}

function cellText(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Percorre o JSON do sumário à procura de itens com título — a estrutura mistura objectos
 *  e arrays conforme haja um ou vários itens, por isso não se confia na forma. */
function* sumarioItems(node) {
  if (Array.isArray(node)) {
    for (const child of node) yield* sumarioItems(child);
  } else if (node && typeof node === 'object') {
    if (typeof node.titulo === 'string' && typeof node.identificador === 'string') yield node;
    for (const value of Object.values(node)) yield* sumarioItems(value);
  }
}

async function fetchSumario(yyyymmdd) {
  const response = await fetch(`${BOE_BASE}/datosabiertos/api/boe/sumario/${yyyymmdd}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  // 404 = dia sem BOE (domingos, feriados). Não é erro.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`sumário BOE ${yyyymmdd}: HTTP ${response.status}`);
  return response.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Procura, dia a dia, a resolução com os feriados de `targetYear`. Sai todos os anos
 *  entre Setembro e Dezembro do ano anterior (a de 2026 saiu a 28/10/2025). Devolve
 *  { id, title, date } ou null se ainda não saiu. */
export async function findFiestasResolution(targetYear, { today = new Date(), delayMs = 150 } = {}) {
  const pattern = new RegExp(`fiestas laborales para el a[ñn]o ${targetYear}\\b`, 'i');
  const start = new Date(Date.UTC(targetYear - 1, 8, 1));
  const end = new Date(Math.min(today.getTime(), Date.UTC(targetYear, 0, 31)));
  for (let day = start; day <= end; day = new Date(day.getTime() + 86_400_000)) {
    const yyyymmdd = day.toISOString().slice(0, 10).replaceAll('-', '');
    const sumario = await fetchSumario(yyyymmdd);
    if (sumario) {
      for (const item of sumarioItems(sumario)) {
        if (pattern.test(item.titulo)) return { id: item.identificador, title: item.titulo, date: yyyymmdd };
      }
    }
    await sleep(delayMs);
  }
  return null;
}

export async function fetchResolutionHtml(boeId) {
  const response = await fetch(`${BOE_BASE}/diario_boe/txt.php?id=${encodeURIComponent(boeId)}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${boeId}: HTTP ${response.status}`);
  return response.text();
}

/** Extrai da tabela os feriados regionais: [{ locality, date, name }]. Lança erro se a
 *  tabela não tiver a forma esperada — melhor falhar alto do que gravar meia lista. */
export function parseRegionalHolidays(html, targetYear) {
  const tableStart = html.indexOf('<table');
  const tableEnd = html.lastIndexOf('</table>');
  if (tableStart < 0 || tableEnd < 0) throw new Error('resolução sem tabela');
  const rows = [...html.slice(tableStart, tableEnd).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) => cellText(cell[1])),
  );

  // Linha de cabeçalho das comunidades: a que tem "Andalucía" na primeira célula.
  const headerIndex = rows.findIndex((cells) => /^andaluc/i.test(cells[0] ?? ''));
  if (headerIndex < 0) throw new Error('cabeçalho das Comunidades Autónomas não encontrado');
  const columnCodes = rows[headerIndex].map((header) => REGION_BY_HEADER.find(([re]) => re.test(header))?.[1] ?? null);
  const missing = REGION_CODES.filter((code) => !columnCodes.includes(code));
  if (missing.length > 0) throw new Error(`colunas em falta no BOE: ${missing.join(', ')}`);

  const holidays = [];
  let month = null;
  for (const cells of rows.slice(headerIndex + 1)) {
    const label = cells[0] ?? '';
    const monthName = label.toLowerCase();
    if (MONTHS[monthName]) {
      month = MONTHS[monthName];
      continue;
    }
    const match = label.match(/^(\d{1,2})\s+(.+?)\.?$/);
    if (!match) continue;
    if (!month) throw new Error(`data "${label}" antes de qualquer mês`);
    const day = Number(match[1]);
    const name = match[2].trim();
    // As marcas vêm nas células a seguir ao rótulo, pela ordem das colunas do cabeçalho.
    const marks = cells.slice(1);
    const markedCodes = columnCodes.filter((code, index) => code && /\*/.test(marks[index] ?? ''));
    if (markedCodes.length === REGION_CODES.length) continue; // nacional em toda a Espanha
    const date = `${targetYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    for (const locality of markedCodes) holidays.push({ locality, date, name });
  }
  return holidays;
}

/** Cada comunidade tem 12 a 14 feriados no total; tirando os 8–9 nacionais comuns, sobram
 *  entre 2 e 6 regionais. Fora disso, a tabela foi mal lida. */
export function validateRegionalHolidays(holidays, targetYear) {
  const problems = [];
  for (const code of REGION_CODES) {
    const count = holidays.filter((holiday) => holiday.locality === code).length;
    if (count < 2 || count > 6) problems.push(`${code}: ${count} feriados regionais`);
  }
  for (const holiday of holidays) {
    const date = new Date(`${holiday.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== targetYear || holiday.date.slice(5) !== date.toISOString().slice(5, 10)) {
      problems.push(`data inválida: ${holiday.locality} ${holiday.date}`);
    }
    if (!holiday.name) problems.push(`sem nome: ${holiday.locality} ${holiday.date}`);
  }
  return problems;
}
