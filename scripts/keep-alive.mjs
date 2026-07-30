#!/usr/bin/env node
// PMPlan — keep-alive do projecto Supabase (Fase 2).
//
// PORQUÊ ESTE SCRIPT EXISTE: o free tier pausa o projecto ao fim de 7 dias sem
// actividade, e toda a actividade desta aplicação depende de alguém ter o browser
// aberto. Um pedido a /auth/v1/health (o que o workflow antigo fazia) é servido pelo
// GoTrue e nunca toca em Postgres — não conta. Este script força trabalho REAL de base
// de dados: uma escrita, uma leitura agregada e uma manutenção.
//
// DEPENDÊNCIAS: nenhuma, de propósito. Só `fetch` e `AbortSignal.timeout`, ambos de
// Node 18+. O script tem de correr na VPS, no runner do GitHub Actions (Fase 3) e na
// máquina de quem o testa à mão, sem `npm install` e sem ficar refém da versão de Node
// instalada em cada sítio — um keep-alive que se avaria numa actualização de runtime
// não serve o propósito de existir.
//
// A MESMA execução serve as Fases 2 e 3: o que distingue as origens é HEARTBEAT_SOURCE.
//
// AUTENTICAÇÃO — dois modos, por ordem de preferência:
//
//   1. TOKEN DEDICADO (recomendado, migração 0011): SUPABASE_HEARTBEAT_TOKEN é um JWT do
//      papel `pmplan_heartbeat`, que só pode inserir heartbeats, contar PMs e purgar. Vai
//      no Authorization; o apikey leva a chave anon, que é pública (já está no bundle do
//      frontend) e serve apenas para o gateway deixar passar o pedido.
//   2. SERVICE ROLE (legado): SUPABASE_SERVICE_ROLE_KEY ignora o RLS e dá acesso total à
//      base de dados. Funciona, mas põe uma credencial administrativa na VPS. Só como
//      recurso — o script avisa quando cai neste modo.
//
// Configuração por variáveis de ambiente (ver deploy/keepalive/keep-alive.env.example):
//   SUPABASE_URL              obrigatória
//   SUPABASE_ANON_KEY         obrigatória no modo 1 (pública, não é segredo)
//   SUPABASE_HEARTBEAT_TOKEN  modo 1 — nunca é escrito no log
//   SUPABASE_SERVICE_ROLE_KEY modo 2 — nunca é escrita no log
//   HEARTBEAT_SOURCE          'vps' (omissão) | 'github_actions' | 'manual'
//   KEEPALIVE_LOG             caminho do ficheiro de log; sem ela, só stdout
//   KEEPALIVE_TIMEOUT_MS      timeout por pedido (omissão: 15000)
//   KEEPALIVE_ATTEMPTS        tentativas por pedido (omissão: 3)
//
// Saída: 0 se os três passos correram; 1 a qualquer falha (o systemd marca o serviço
// como failed e o GitHub Actions marca o job a vermelho).

import { appendFileSync } from 'node:fs';

const URL_BASE = process.env.SUPABASE_URL;
const HEARTBEAT_TOKEN = process.env.SUPABASE_HEARTBEAT_TOKEN;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SOURCE = process.env.HEARTBEAT_SOURCE ?? 'vps';
const LOG_FILE = process.env.KEEPALIVE_LOG;
const TIMEOUT_MS = Number(process.env.KEEPALIVE_TIMEOUT_MS ?? 15000);
const ATTEMPTS = Number(process.env.KEEPALIVE_ATTEMPTS ?? 3);

// Espelha o CHECK da migração 0010. Validar aqui dá "origem inválida: VPS" em vez de um
// 400 opaco do PostgREST, e evita gastar as tentativas de rede num erro de configuração.
const SOURCES = ['vps', 'github_actions', 'manual'];

let logFileBroken = false;

/** Decide o modo de autenticação e devolve os headers, ou lança se não houver credencial. */
function resolveAuth() {
  if (HEARTBEAT_TOKEN) {
    if (!ANON_KEY) {
      throw new Error('SUPABASE_HEARTBEAT_TOKEN exige também SUPABASE_ANON_KEY (o gateway precisa do apikey).');
    }
    // apikey ≠ Authorization de propósito: o gateway autoriza pela chave anon, o PostgREST
    // faz SET ROLE pela claim `role` do token. É o mesmo padrão de um utilizador com sessão.
    return { mode: 'pmplan_heartbeat', headers: { apikey: ANON_KEY, Authorization: `Bearer ${HEARTBEAT_TOKEN}` } };
  }
  if (SERVICE_KEY) {
    return { mode: 'service_role', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } };
  }
  throw new Error(
    'Sem credencial: defina SUPABASE_HEARTBEAT_TOKEN (+ SUPABASE_ANON_KEY) ou, em legado, ' +
      'SUPABASE_SERVICE_ROLE_KEY. Ver keep-alive.env.example.',
  );
}

// Preenchido no arranque de main(), depois de validada a configuração.
let auth;

function log(level, message) {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  console.log(line);
  if (!LOG_FILE || logFileBroken) return;
  try {
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch (err) {
    // Não deixar o heartbeat falhar por causa do log: o objectivo do script é gerar
    // actividade na base de dados, e um /var/log cheio ou mal permissionado não é razão
    // para o projecto ser pausado. Avisa uma vez e continua sem ficheiro.
    logFileBroken = true;
    console.error(`${new Date().toISOString()} [WARN] log em ficheiro desactivado (${err.message})`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pedido com timeout e repetição. Devolve a Response; lança em caso de falha final. */
async function request(label, path, init = {}) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${URL_BASE}${path}`, {
        ...init,
        headers: {
          ...auth.headers,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) return response;

      const body = (await response.text()).slice(0, 300);
      // 4xx é erro de configuração (chave errada, tabela inexistente, CHECK violado):
      // repetir só atrasa o diagnóstico e nunca muda o resultado. Falha já.
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`${label}: HTTP ${response.status} — ${body} (não se repete: erro de configuração)`);
      }
      lastError = new Error(`${label}: HTTP ${response.status} — ${body}`);
    } catch (err) {
      if (err.message?.includes('não se repete')) throw err;
      lastError = err;
    }

    if (attempt < ATTEMPTS) {
      // Recuo progressivo: um projecto acabado de despausar, ou uma VPS a arrancar com a
      // rede ainda a subir, respondem mal nos primeiros segundos e bem logo a seguir.
      const wait = attempt * 5000;
      log('WARN', `${label}: tentativa ${attempt}/${ATTEMPTS} falhou (${lastError.message}); repete em ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error(`${label}: falhou após ${ATTEMPTS} tentativas — ${lastError.message}`);
}

async function main() {
  if (!URL_BASE) {
    throw new Error('SUPABASE_URL é obrigatória (ver keep-alive.env.example).');
  }
  if (!SOURCES.includes(SOURCE)) {
    throw new Error(`HEARTBEAT_SOURCE inválida: '${SOURCE}'. Valores aceites: ${SOURCES.join(', ')}.`);
  }
  auth = resolveAuth();

  log('INFO', `keep-alive a arrancar (source=${SOURCE}, papel=${auth.mode}, alvo=${URL_BASE})`);
  if (auth.mode === 'service_role') {
    // Visível no log e no journal todos os dias: o incómodo é intencional, para que o modo
    // legado não se instale em silêncio como permanente.
    log('WARN', 'a usar a service_role key (acesso total à BD). Preferir SUPABASE_HEARTBEAT_TOKEN — ver DOCS/KEEP_ALIVE_VPS.md.');
  }
  const startedAt = Date.now();

  // ── a. ESCRITA ──────────────────────────────────────────────────────────────
  // O passo que mais conta como actividade: obriga a um INSERT com WAL, não apenas a
  // uma leitura que poderia ser servida de cache.
  //
  // Sem `Prefer: return=representation`: devolver a linha inserida exigiria privilégio de
  // SELECT, e o papel pmplan_heartbeat não o tem de propósito (não pode ler o histórico
  // que escreve). O PostgREST responde 201 com corpo vazio.
  await request('INSERT system_heartbeat', '/rest/v1/system_heartbeat', {
    method: 'POST',
    body: JSON.stringify({ source: SOURCE }),
  });
  log('INFO', 'a. heartbeat inserido');

  // ── b. LEITURA ──────────────────────────────────────────────────────────────
  // Contagem sobre pm_events — a tabela central do domínio, não a de heartbeats. Se o
  // keep-alive só tocasse na sua própria tabela, uma corrupção ou perda de permissões
  // nas tabelas que realmente interessam passava despercebida indefinidamente.
  //
  // Via RPC e não por leitura directa da tabela: o count por PostgREST exigiria
  // `grant select on pm_events`, dando ao papel a leitura de todo o plano de PMs. A função
  // heartbeat_domain_check() (0011) é security definer e devolve só um inteiro.
  const counted = await request('RPC heartbeat_domain_check', '/rest/v1/rpc/heartbeat_domain_check', {
    method: 'POST',
    body: '{}',
  });
  log('INFO', `b. pm_events contadas: ${await counted.text()}`);

  // ── c. PURGA ────────────────────────────────────────────────────────────────
  // Mantém os 90 registos mais recentes (função da migração 0010, restrita ao
  // service_role). Passo separado e não trigger: uma falha na purga não pode arrastar
  // consigo o heartbeat, que é o que impede a pausa.
  const purged = await request('RPC purge_system_heartbeat', '/rest/v1/rpc/purge_system_heartbeat', {
    method: 'POST',
    body: '{}',
  });
  log('INFO', `c. purga concluída (${await purged.text()} registo(s) removido(s))`);

  log('INFO', `keep-alive OK em ${Date.now() - startedAt}ms`);
}

main().catch((err) => {
  // A mensagem pode conter o corpo da resposta do PostgREST, nunca a chave — os headers
  // não são incluídos nos erros de propósito.
  log('ERROR', err.message);
  process.exit(1);
});
