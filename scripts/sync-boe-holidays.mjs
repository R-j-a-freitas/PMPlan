#!/usr/bin/env node
// PMPlan — importação automática dos feriados regionais de Espanha a partir do BOE.
//
// Corre semanalmente na VPS (deploy/holidays/). Para o ano corrente e o seguinte:
//   1. se o ano já foi importado do BOE, não faz nada;
//   2. procura no sumário diário do BOE a resolução "relación de fiestas laborales para el
//      año X" (sai entre Setembro e Dezembro do ano anterior);
//   3. lê a tabela, valida-a e grava os feriados regionais via import_boe_regional_holidays
//      (migração 0025), que valida outra vez do lado da BD;
//   4. envia email: na importação, com o lembrete de rever as fiestas locales das cidades
//      com hospital (essas não têm fonte única e revêem-se à mão na página Feriados); na
//      falha, com o erro.
//
// Uma falha nunca grava meia lista: o leitor e a função da BD recusam tabelas com forma
// inesperada, e o que já estava gravado fica como estava.
//
// ─── Configuração (/etc/pmplan/boe-holidays.env) ─────────────────────────────
//   SUPABASE_URL, SUPABASE_ANON_KEY
//   SUPABASE_HOLIDAY_SYNC_TOKEN   JWT do papel pmplan_holiday_sync (mint-heartbeat-token.mjs
//                                 com TOKEN_ROLE=pmplan_holiday_sync)
//   RESEND_API_KEY, ALERT_EMAIL_TO, RESEND_FROM_EMAIL, RESEND_FROM_NAME   como no heartbeat-check
//   HOLIDAY_SYNC_LOG              ficheiro de log (opcional)
//
// Argumentos: --year 2027 (só esse ano, mesmo que já importado) · --dry-run (lê e mostra,
// não grava nem envia email).
//
// Saída: 0 se correu bem (incluindo "ainda não saiu"); 1 se falhou.

import { appendFileSync } from 'node:fs';
import {
  fetchResolutionHtml,
  findFiestasResolution,
  parseRegionalHolidays,
  validateRegionalHolidays,
} from './lib/boeHolidays.mjs';

const URL_BASE = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SYNC_TOKEN = process.env.SUPABASE_HOLIDAY_SYNC_TOKEN;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_TO = (process.env.ALERT_EMAIL_TO ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const FROM_NAME = process.env.RESEND_FROM_NAME ?? 'PMPlan';
const LOG_FILE = process.env.HOLIDAY_SYNC_LOG;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const yearArgIndex = args.indexOf('--year');
const FORCED_YEAR = yearArgIndex >= 0 ? Number(args[yearArgIndex + 1]) : null;

// A partir desta data, se a resolução do ano seguinte ainda não saiu, avisa-se — alguém
// tem de ir ver se o BOE mudou o título ou se a publicação atrasou.
const LATE_MONTH = 11; // Dezembro (0-based)
const LATE_DAY = 15;

let logFileBroken = false;
function log(level, message) {
  const line = `${new Date().toISOString()} [${level}] boe-holidays: ${message}`;
  console.log(line);
  if (!LOG_FILE || logFileBroken) return;
  try {
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    logFileBroken = true;
  }
}

function authHeaders() {
  if (SYNC_TOKEN && ANON_KEY) return { apikey: ANON_KEY, Authorization: `Bearer ${SYNC_TOKEN}` };
  if (SERVICE_KEY) {
    log('WARN', 'a usar SUPABASE_SERVICE_ROLE_KEY — só para testes; na VPS use SUPABASE_HOLIDAY_SYNC_TOKEN');
    return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  }
  return null;
}

async function rpc(headers, name, body) {
  const response = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status} — ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function sendEmail(subject, lines) {
  if (DRY_RUN) return;
  if (!RESEND_API_KEY || ALERT_TO.length === 0) {
    log('WARN', 'sem RESEND_API_KEY ou ALERT_EMAIL_TO — email NÃO enviado');
    return;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to: ALERT_TO, subject, text: lines.join('\n') }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      log('ERROR', `Resend recusou o email: HTTP ${response.status} — ${(await response.text()).slice(0, 200)}`);
      return;
    }
    log('INFO', `email enviado para ${ALERT_TO.join(', ')}`);
  } catch (err) {
    log('ERROR', `falha ao enviar email: ${err.message}`);
  }
}

const RODAPE = ['', 'Detalhes e operação: DOCS/FERIADOS.md (secção "Importação automática do BOE").'];

async function syncYear(headers, year, today) {
  if (!FORCED_YEAR && !DRY_RUN && (await rpc(headers, 'boe_holidays_imported', { p_year: year }))) {
    log('INFO', `${year}: já importado do BOE — nada a fazer`);
    return;
  }

  log('INFO', `${year}: a procurar a resolução no BOE…`);
  const resolution = await findFiestasResolution(year, { today });
  if (!resolution) {
    log('INFO', `${year}: resolução ainda não publicada`);
    if (DRY_RUN) return;
    await rpc(headers, 'log_holiday_sync', {
      p_year: year,
      p_status: 'not_published',
      p_boe_id: null,
      p_message: null,
    });
    const late = today >= new Date(Date.UTC(year - 1, LATE_MONTH, LATE_DAY));
    if (late) {
      await sendEmail(`[PMPlan] Feriados de Espanha ${year}: resolução do BOE não encontrada`, [
        `Ainda não foi encontrada no BOE a "relación de fiestas laborales para el año ${year}".`,
        'Costuma sair no fim de Outubro. Ou a publicação atrasou, ou o título mudou e a',
        'procura automática deixou de a reconhecer — confirmar em https://www.boe.es.',
        '',
        `Até lá, os feriados regionais de ${year} na app vêm da Nager.Date, que não é fiável.`,
        ...RODAPE,
      ]);
    }
    return;
  }

  log('INFO', `${year}: encontrada ${resolution.id} (BOE de ${resolution.date})`);
  try {
    const holidays = parseRegionalHolidays(await fetchResolutionHtml(resolution.id), year);
    const problems = validateRegionalHolidays(holidays, year);
    if (problems.length > 0) throw new Error(`validação falhou: ${problems.join('; ')}`);

    if (DRY_RUN) {
      for (const holiday of holidays) log('INFO', `  ${holiday.locality} ${holiday.date} ${holiday.name}`);
      log('INFO', `${year}: ${holidays.length} feriados regionais lidos (dry-run, nada gravado)`);
      return;
    }

    const result = await rpc(headers, 'import_boe_regional_holidays', {
      p_year: year,
      p_boe_id: resolution.id,
      p_holidays: holidays,
    });
    log('INFO', `${year}: ${result.status} (${result.rows} feriados regionais)`);
    if (result.status !== 'imported') return;

    await sendEmail(`[PMPlan] Feriados de Espanha ${year} importados do BOE`, [
      `Foram importados ${result.rows} feriados regionais de ${year} das 17 Comunidades Autónomas,`,
      `a partir de ${resolution.id}:`,
      `https://www.boe.es/diario_boe/txt.php?id=${resolution.id}`,
      '',
      'A REVER À MÃO — fiestas locales:',
      'Cada câmara fixa as suas duas fiestas locales todos os anos, e não há fonte única para',
      `as importar. Confirme as datas de ${year} na página Feriados → "Regras dos Feriados`,
      'Locais de Espanha" → Editar, para as cidades com hospital:',
      '',
      `  ${result.cities.join(', ')}`,
      '',
      'As capitais de província costumam sair num calendário único publicado em Novembro/',
      'Dezembro; as restantes cidades nos boletins provinciais (BOP) ou autonómicos.',
      ...RODAPE,
    ]);
  } catch (err) {
    if (!DRY_RUN) {
      await rpc(headers, 'log_holiday_sync', {
        p_year: year,
        p_status: 'failed',
        p_boe_id: resolution.id,
        p_message: err.message,
      }).catch((logErr) => log('ERROR', `não foi possível registar a falha: ${logErr.message}`));
    }
    throw err;
  }
}

async function main() {
  const headers = authHeaders();
  if (!URL_BASE || !headers) {
    log('ERROR', 'configuração incompleta (SUPABASE_URL e credencial são obrigatórias)');
    await sendEmail('[PMPlan] Importação de feriados do BOE mal configurada', [
      'O script não arrancou por falta de configuração.',
      ...RODAPE,
    ]);
    process.exitCode = 1;
    return;
  }

  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const years = FORCED_YEAR ? [FORCED_YEAR] : [currentYear, currentYear + 1];
  if (FORCED_YEAR !== null && !Number.isInteger(FORCED_YEAR)) {
    log('ERROR', '--year precisa de um ano (ex: --year 2027)');
    process.exitCode = 1;
    return;
  }

  for (const year of years) {
    try {
      await syncYear(headers, year, today);
    } catch (err) {
      log('ERROR', `${year}: ${err.message}`);
      await sendEmail(`[PMPlan] Falha a importar os feriados de Espanha ${year} do BOE`, [
        `A importação automática dos feriados regionais de ${year} falhou:`,
        '',
        `  ${err.message}`,
        '',
        'Nada foi gravado — os feriados que já estavam na app ficaram como estavam.',
        'Causa mais provável: o BOE mudou o formato da tabela. Ver o log e, se preciso,',
        'actualizar scripts/lib/boeHolidays.mjs (tem testes: node --test scripts/lib/boeHolidays.test.mjs).',
        ...RODAPE,
      ]);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  log('ERROR', `falha inesperada: ${err.message}`);
  process.exitCode = 1;
});
