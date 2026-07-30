#!/usr/bin/env node
// PMPlan — verificador de falhas do keep-alive (Fase 3).
//
// Responde a "o heartbeat parou?" e, se sim, envia email pelo Resend.
//
// ─── A DEPENDÊNCIA CIRCULAR, E COMO É RESOLVIDA ──────────────────────────────
// O problema: para saber se o Supabase parou é preciso perguntar ao Supabase. Se ele
// estiver em baixo, a pergunta não obtém resposta — e um verificador ingénuo interpreta
// "não recebi dados" como "não há nada a reportar" e cala-se exactamente quando devia
// gritar. O silêncio passa por saúde.
//
// Três decisões quebram o ciclo:
//
// 1. FALHAR A CONSULTA É, POR SI SÓ, UM ALARME. Não há caminho de código em que uma
//    excepção leve a "tudo bem". Os estados são três e não dois: fresco (OK), velho
//    (ALARME: os escritores morreram), inacessível (ALARME: o próprio Supabase morreu).
//    O terceiro é o mais grave e é o que a ingenuidade perde.
//
// 2. O CANAL DE ALERTA NÃO PASSA PELO SUPABASE. O email vai directamente à API do
//    Resend (api.resend.com). NÃO é usada a Edge Function send-proposal-email, que vive
//    dentro do Supabase e estaria morta precisamente no cenário que interessa reportar.
//    Nada neste script toca no Supabase a não ser a consulta que ele próprio avalia.
//
// 3. O VERIFICADOR CORRE EM DOIS SÍTIOS INDEPENDENTES — GitHub Actions e VPS, em horas
//    diferentes. Se um morrer, o outro reporta. Nenhum depende do outro.
//
// Resta um risco que nenhum código resolve: se AMBOS morrerem ao mesmo tempo, ninguém
// alerta e o silêncio volta a parecer saúde. Está documentado no README, na secção
// "Quem vigia o vigilante" — a mitigação é humana, não técnica.
//
// ─── Configuração ────────────────────────────────────────────────────────────
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_HEARTBEAT_TOKEN   como no keep-alive.mjs
//   RESEND_API_KEY            obrigatória
//   ALERT_EMAIL_TO            obrigatória — destinatário(s), separados por vírgula
//   RESEND_FROM_EMAIL         omissão: onboarding@resend.dev
//   RESEND_FROM_NAME          omissão: PMPlan
//   HEARTBEAT_MAX_AGE_HOURS   omissão: 48
//   KEEPALIVE_LOG             partilhado com o keep-alive
//
// Saída: 0 se está tudo bem; 1 se alertou (ou se não conseguiu alertar).

import { appendFileSync } from 'node:fs';

const URL_BASE = process.env.SUPABASE_URL;
const HEARTBEAT_TOKEN = process.env.SUPABASE_HEARTBEAT_TOKEN;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_TO = (process.env.ALERT_EMAIL_TO ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const FROM_NAME = process.env.RESEND_FROM_NAME ?? 'PMPlan';
const MAX_AGE_HOURS = Number(process.env.HEARTBEAT_MAX_AGE_HOURS ?? 48);
const LOG_FILE = process.env.KEEPALIVE_LOG;

let logFileBroken = false;
function log(level, message) {
  const line = `${new Date().toISOString()} [${level}] check: ${message}`;
  console.log(line);
  if (!LOG_FILE || logFileBroken) return;
  try {
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    logFileBroken = true;
  }
}

function authHeaders() {
  if (HEARTBEAT_TOKEN && ANON_KEY) return { apikey: ANON_KEY, Authorization: `Bearer ${HEARTBEAT_TOKEN}` };
  if (SERVICE_KEY) return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  return null;
}

/** Envia o alerta pelo Resend. Devolve true se o email saiu. */
async function sendAlert(subject, lines) {
  if (!RESEND_API_KEY || ALERT_TO.length === 0) {
    log('ERROR', 'sem RESEND_API_KEY ou ALERT_EMAIL_TO — alerta NÃO enviado');
    return false;
  }
  const text = lines.join('\n');
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: ALERT_TO,
        subject,
        text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      log('ERROR', `Resend recusou o alerta: HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
      return false;
    }
    log('INFO', `alerta enviado para ${ALERT_TO.join(', ')}`);
    return true;
  } catch (err) {
    log('ERROR', `falha ao enviar alerta: ${err.message}`);
    return false;
  }
}

const RODAPE = [
  '',
  'O que fazer:',
  '  1. Abrir https://supabase.com/dashboard e confirmar se o projecto está pausado.',
  '     Se estiver, carregar em "Restore project" — nenhum script o consegue reanimar de fora.',
  '  2. Na VPS: systemctl list-timers pmplan-keepalive.timer',
  '                journalctl -u pmplan-keepalive.service -n 50',
  '  3. No GitHub: separador Actions → workflow "Supabase keep-alive".',
  '     Atenção: o GitHub desactiva schedules em repositórios sem commits há 60 dias.',
  '',
  'Detalhes em DOCS/KEEP_ALIVE_VPS.md.',
];

async function main() {
  const headers = authHeaders();
  if (!URL_BASE || !headers) {
    // Configuração incompleta não é "sem novidades": é o verificador cego.
    log('ERROR', 'configuração incompleta (SUPABASE_URL e credencial são obrigatórias)');
    await sendAlert(
      '[PMPlan] Verificador de heartbeat mal configurado',
      ['O verificador não conseguiu arrancar por falta de configuração.', ...RODAPE],
    );
    process.exit(1);
  }

  let rows;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/rpc/heartbeat_status`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
    rows = await r.json();
  } catch (err) {
    // ESTE é o ramo que a ingenuidade perde. Não conseguir perguntar é a pior notícia
    // possível, não a ausência de notícias.
    log('CRITICAL', `Supabase inacessível: ${err.message}`);
    await sendAlert('[PMPlan] CRÍTICO: Supabase inacessível', [
      'O verificador não conseguiu contactar a base de dados.',
      '',
      `Erro: ${err.message}`,
      `Alvo: ${URL_BASE}`,
      '',
      'Isto significa uma de duas coisas: o projecto foi pausado, ou está em baixo.',
      'Em qualquer dos casos a aplicação está inutilizável neste momento.',
      ...RODAPE,
    ]);
    process.exit(1);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    log('CRITICAL', 'nenhum heartbeat registado');
    await sendAlert('[PMPlan] CRÍTICO: nenhum heartbeat registado', [
      'A base de dados respondeu, mas a tabela system_heartbeat está vazia.',
      'Nenhuma origem alguma vez escreveu — o keep-alive não está instalado ou nunca correu.',
      ...RODAPE,
    ]);
    process.exit(1);
  }

  for (const row of rows) log('INFO', `${row.source}: ${row.age_hours}h (último ${row.last_ping})`);

  const maisRecente = Math.min(...rows.map((row) => Number(row.age_hours)));
  const paradas = rows.filter((row) => Number(row.age_hours) > MAX_AGE_HOURS);

  // Caso 1 — NENHUMA origem escreveu dentro do prazo. O projecto caminha para a pausa.
  if (maisRecente > MAX_AGE_HOURS) {
    log('CRITICAL', `heartbeat mais recente tem ${maisRecente}h (limite ${MAX_AGE_HOURS}h)`);
    await sendAlert('[PMPlan] CRÍTICO: heartbeat parado', [
      `Nenhuma origem escreve há ${maisRecente} horas (limite: ${MAX_AGE_HOURS}h).`,
      'O Supabase responde, mas ninguém o está a manter activo.',
      'O projecto é pausado ao fim de 7 dias sem actividade.',
      '',
      'Estado por origem:',
      ...rows.map((row) => `  ${row.source}: ${row.age_hours}h (último ${row.last_ping})`),
      ...RODAPE,
    ]);
    process.exit(1);
  }

  // Caso 2 — uma origem parou mas outra mascara-a. Sem a coluna `source` isto seria
  // invisível: o agregado continuaria fresco e ninguém saberia que a redundância acabou.
  if (paradas.length > 0) {
    const nomes = paradas.map((row) => row.source).join(', ');
    log('WARN', `origem(ns) parada(s): ${nomes}`);
    await sendAlert(`[PMPlan] Aviso: origem de heartbeat parada (${nomes})`, [
      `A(s) origem(ns) ${nomes} não escreve(m) há mais de ${MAX_AGE_HOURS} horas.`,
      '',
      'O projecto NÃO corre risco imediato — outra origem continua a mantê-lo activo.',
      'Mas a redundância deixou de existir: se a que resta falhar, ninguém avisa.',
      '',
      'Estado por origem:',
      ...rows.map((row) => `  ${row.source}: ${row.age_hours}h (último ${row.last_ping})`),
      ...RODAPE,
    ]);
    process.exit(1);
  }

  log('INFO', `OK — heartbeat mais recente tem ${maisRecente}h (limite ${MAX_AGE_HOURS}h)`);
}

main().catch(async (err) => {
  log('ERROR', `falha inesperada: ${err.message}`);
  await sendAlert('[PMPlan] Verificador de heartbeat falhou', [
    `O verificador terminou com um erro inesperado: ${err.message}`,
    ...RODAPE,
  ]);
  process.exit(1);
});
