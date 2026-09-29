// Importa as PMs de 2026 preparadas em DOCS/XLS/pmplan-pm-2026.xlsx (folha "A criar")
// para pm_events, e as trocas de fonte da braquiterapia para source_changes.
//
//   node scripts/importar-pm-2026.mjs            ensaio — lê a BD, mostra o que faria, não grava
//   node scripts/importar-pm-2026.mjs --gravar   grava
//
// PORQUÊ uma única instrução SQL: são duas tabelas e ~740 linhas. Pelo PostgREST seriam
// dois pedidos, e uma falha no segundo deixava PMs sem troca de fonte. Via exec_sql é uma
// transacção: ou entra tudo, ou nada.
//
// Antes de gravar escreve em BACKUPS/ o estado actual de pm_events e source_changes e um
// SQL que apaga exactamente as linhas desta importação (os ids são gerados aqui).
//
// A importação não passa pela validação de regras do ecrã — os conflitos aceites estão
// documentados em DOCS/XLS/pmplan-pendentes-2026.xlsx.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';

const FICHEIRO = 'DOCS/XLS/pmplan-pm-2026.xlsx';
const HOJE = new Date().toISOString().slice(0, 10);
const TIPO_FONTE = 'Ir-192'; // o mesmo default do SourceChangeModal
const GRAVAR = process.argv.includes('--gravar');

// Decisões do utilizador (29/09/2026) sobre o que o Master traz a mais ou em conflito.
const JUNTAR = [
  // Uma intervenção partida em dois dias soltos no Master — fica uma só PM.
  { serie: '109131', datas: ['2026-09-14', '2026-09-16'] }, // Badajoz, mantém as 4 PM/ano
  { serie: '8111', datas: ['2026-10-27', '2026-10-30'] },   // Virgen de las Nieves
];
const RETIRAR = [
  { serie: 'FT02186', data: '2026-01-05' }, // IPO Lisboa: 5 no Master, contrato de 4
];
const MOVER = [
  // Granada, Regra 8: o Synergy da Inmaculada Concepción está a decorrer (28–30/09);
  // o Infinity de San Cecilio passa para a primeira janela livre do engenheiro.
  { serie: '153743', data: '2026-09-30', inicio: '2026-10-13', fim: '2026-10-15' },
];

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
const HEADERS = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

async function ler(caminho) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${caminho} → ${res.status}: ${await res.text()}`);
  return res.json();
}

function aplicarDecisoes(linhas) {
  const serie = (l) => String(l['Nº de Série']);
  let resultado = linhas.map((l) => ({ ...l }));

  for (const { serie: s, data } of RETIRAR) {
    const antes = resultado.length;
    resultado = resultado.filter((l) => !(serie(l) === s && l['Data Início'] === data));
    if (resultado.length !== antes - 1) throw new Error(`Retirar ${s} ${data}: não encontrada`);
  }

  for (const { serie: s, datas } of JUNTAR) {
    const partes = resultado.filter((l) => serie(l) === s && datas.includes(l['Data Início']));
    if (partes.length !== datas.length) throw new Error(`Juntar ${s}: esperava ${datas.length} PMs`);
    const [primeira, ...resto] = partes.sort((a, b) => a['Data Início'].localeCompare(b['Data Início']));
    const junta = {
      ...primeira,
      'Data Fim': resto.at(-1)['Data Fim'],
      'Linha Master': partes.map((p) => p['Linha Master']).join(', '),
    };
    resultado = resultado.filter((l) => !partes.includes(l)).concat(junta);
  }

  for (const { serie: s, data, inicio, fim } of MOVER) {
    const alvo = resultado.find((l) => serie(l) === s && l['Data Início'] === data);
    if (!alvo) throw new Error(`Mover ${s} ${data}: não encontrada`);
    resultado = resultado.map((l) => (l === alvo ? { ...l, 'Data Início': inicio, 'Data Fim': fim } : l));
  }

  return resultado;
}

function construir(linhas, paisPorEquipamento) {
  const pms = [];
  const trocas = [];
  for (const l of linhas) {
    const inicio = l['Data Início'];
    const fim = l['Data Fim'];
    const concluida = fim < HOJE;
    const pais = paisPorEquipamento.get(l.equipment_id);
    if (!pais) throw new Error(`Equipamento sem hospital/país: ${l.Equipamento}`);
    const id = randomUUID();
    pms.push({
      id,
      equipment_id: l.equipment_id,
      engineer_id: l.engineer_id,
      start_date: inicio,
      end_date: fim,
      actual_start_date: concluida ? inicio : null,
      actual_end_date: concluida ? fim : null,
      completed_at: concluida ? `${fim}T18:00:00Z` : null,
      status: concluida ? 'completed' : 'planned',
      notes: l.Notas || null,
      calendar_label: l['Calendário'] || null,
      client_description: (pais === 'PT' ? l['Cliente (PT)'] : l['Cliente (ES)']) || null,
    });
    if (/\bSCRX\b/.test(l['Calendário'])) {
      trocas.push({
        id: randomUUID(),
        equipment_id: l.equipment_id,
        source_type: TIPO_FONTE,
        planned_date: inicio,
        actual_date: concluida ? inicio : null,
        status: concluida ? 'completed' : 'planned',
        notes: l['Calendário'],
      });
    }
  }
  return { pms, trocas };
}

const literal = (valor) => `'${JSON.stringify(valor).replaceAll("'", "''")}'::jsonb`;

// Um CTE com insert corre sempre, mesmo sem ser referenciado — é o que junta as duas
// tabelas numa instrução. Os "not exists" tornam a instrução segura de repetir: uma PM (equipamento + início) ou
// troca de fonte (equipamento + data) que já esteja na BD não é criada outra vez.
function sqlImportacao(pms, trocas) {
  return `
with novas_pm as (
  insert into pm_events (id, equipment_id, engineer_id, start_date, end_date,
    actual_start_date, actual_end_date, completed_at, status, notes, calendar_label, client_description)
  select r.id, r.equipment_id, r.engineer_id, r.start_date, r.end_date,
    r.actual_start_date, r.actual_end_date, r.completed_at, r.status, r.notes, r.calendar_label, r.client_description
  from jsonb_to_recordset(${literal(pms)}) as r(
    id uuid, equipment_id uuid, engineer_id uuid, start_date date, end_date date,
    actual_start_date date, actual_end_date date, completed_at timestamptz, status text,
    notes text, calendar_label text, client_description text)
  where not exists (select 1 from pm_events p
                    where p.equipment_id = r.equipment_id and p.start_date = r.start_date)
)
insert into source_changes (id, equipment_id, source_type, planned_date, actual_date, status, notes)
select r.id, r.equipment_id, r.source_type, r.planned_date, r.actual_date, r.status, r.notes
from jsonb_to_recordset(${literal(trocas)}) as r(
  id uuid, equipment_id uuid, source_type text, planned_date date, actual_date date,
  status text, notes text)
where not exists (select 1 from source_changes s
                  where s.equipment_id = r.equipment_id and s.planned_date = r.planned_date);`;
}

function resumir(pms, trocas, existentes) {
  const conta = (lista, chave) =>
    lista.reduce((acc, x) => ({ ...acc, [x[chave]]: (acc[x[chave]] ?? 0) + 1 }), {});
  const chave = new Set(existentes.map((p) => `${p.equipment_id}|${p.start_date}`));
  const repetidas = pms.filter((p) => chave.has(`${p.equipment_id}|${p.start_date}`)).length;
  console.log(`Hoje: ${HOJE}`);
  console.log(`PMs a criar:            ${pms.length}`, conta(pms, 'status'));
  console.log(`Trocas de fonte:        ${trocas.length}`, conta(trocas, 'status'));
  console.log(`Já na BD (saltadas):    ${repetidas}`);
  console.log(`PMs na BD hoje:         ${existentes.length}`);
  console.log(`PMs na BD depois:       ${existentes.length + pms.length - repetidas}`);
}

const wb = XLSX.read(readFileSync(FICHEIRO));
const linhas = aplicarDecisoes(XLSX.utils.sheet_to_json(wb.Sheets['A criar'], { defval: '' }));

const equipamentos = await ler('equipment?select=id,hospitals(country)&limit=5000');
const paisPorEquipamento = new Map(equipamentos.map((e) => [e.id, e.hospitals?.country]));
const existentes = await ler('pm_events?select=*&limit=10000');
const trocasExistentes = await ler('source_changes?select=*&limit=10000');

const { pms, trocas } = construir(linhas, paisPorEquipamento);
resumir(pms, trocas, existentes);

if (!GRAVAR) {
  console.log('\nEnsaio — nada foi gravado. Para gravar: node scripts/importar-pm-2026.mjs --gravar');
  process.exit(0);
}

const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
const pasta = `BACKUPS/importacao-pm-2026-${carimbo}`;
mkdirSync(pasta, { recursive: true });
writeFileSync(`${pasta}/pm_events-antes.json`, JSON.stringify(existentes, null, 2));
writeFileSync(`${pasta}/source_changes-antes.json`, JSON.stringify(trocasExistentes, null, 2));
const emLista = (lista) => lista.map((x) => `'${x.id}'`).join(',\n  ');
writeFileSync(`${pasta}/desfazer.sql`,
  `-- Apaga as linhas criadas pela importação de ${carimbo}.\n` +
  `-- Uso: node scripts/run-sql.mjs ${pasta}/desfazer.sql\n` +
  `delete from source_changes where id in (\n  ${emLista(trocas)}\n);\n` +
  `delete from pm_events where id in (\n  ${emLista(pms)}\n);\n`);
console.log(`\nCópia e SQL de desfazer em ${pasta}/`);

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: { ...HEADERS, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql: sqlImportacao(pms, trocas) }),
});
if (!res.ok) {
  console.error(`✗ Importação falhou (${res.status}) — nada foi gravado:`, (await res.text()).slice(0, 800));
  process.exit(1);
}

const depoisPm = await ler('pm_events?select=id&limit=10000');
const depoisTrocas = await ler('source_changes?select=id&limit=10000');
console.log(`✓ Gravado. pm_events: ${existentes.length} → ${depoisPm.length}; ` +
  `source_changes: ${trocasExistentes.length} → ${depoisTrocas.length}`);
