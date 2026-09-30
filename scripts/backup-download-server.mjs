#!/usr/bin/env node
// PMPlan — descarga dos backups da VPS a partir do ecrã "Saúde do sistema".
//
// PORQUÊ: os dumps do scripts/backup-supabase.sh vivem em /var/backups/pmplan, e tirá-los
// de lá exigia SSH. Este serviço deixa um admin descarregá-los pelo browser — o que também
// é a forma mais simples de ter uma cópia fora da VPS.
//
// O QUE EXPÕE (atrás do Caddy, em /api/vps-backups):
//   GET /api/vps-backups                        → lista dos ficheiros (JSON)
//   GET /api/vps-backups/file/<tier>/<nome>     → o ficheiro, como anexo
//
// AUTENTICAÇÃO: o browser envia o access token da sessão Supabase. Este serviço NÃO o
// valida sozinho — pergunta ao próprio Supabase, com esse token, quem é o utilizador
// (/auth/v1/user) e qual o seu papel (rpc user_role). Assim não precisa de guardar o JWT
// secret nem a service_role key: só conhece a URL e a anon key, que são públicas. Um
// token inválido ou de quem não é admin é recusado pela base de dados, não por código
// que alguém se possa esquecer de actualizar.
//
// Sem dependências: corre com o node do sistema, como o keep-alive.
//
// Configuração: /etc/pmplan/backup-web.env — ver deploy/backup/backup-web.env.example

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const BACKUP_ROOT = process.env.BACKUP_ROOT ?? '/var/backups/pmplan';
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8081);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias (ver backup-web.env.example)');
  process.exit(1);
}

const TIERS = ['daily', 'weekly', 'monthly'];
// Lista fechada do que o script de backup produz. Tudo o resto — incluindo qualquer coisa
// com `/` ou `..` — é recusado antes de tocar no sistema de ficheiros.
const FILE_RE = /^pmplan-(users-)?(\d{4}-\d{2}-\d{2})\.(dump|sql\.gz)$/;

function log(level, message) {
  console.log(`[${level}] ${message}`);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/** Devolve o email do admin, ou null se o token não for de um admin válido. */
async function authorise(req) {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return null;
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${match[1]}` };
  const signal = AbortSignal.timeout(10_000);

  const [userRes, roleRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers, signal }),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/user_role`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
      signal,
    }),
  ]);
  if (!userRes.ok || !roleRes.ok) return null;
  const [user, role] = await Promise.all([userRes.json(), roleRes.json()]);
  return role === 'admin' ? (user?.email ?? user?.id ?? 'desconhecido') : null;
}

/** Os semanais e mensais são hardlinks dos diários (ver backup-supabase.sh), por isso o
 *  mesmo ficheiro aparece em várias pastas. Agrupa por nome: uma linha por cópia, com a
 *  lista das retenções em que está. */
async function listBackups() {
  const byName = new Map();
  for (const tier of TIERS) {
    let names = [];
    try {
      names = await readdir(join(BACKUP_ROOT, tier));
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    for (const name of names) {
      const m = FILE_RE.exec(name);
      if (!m) continue;
      const info = await stat(join(BACKUP_ROOT, tier, name));
      const entry = byName.get(name);
      if (entry) {
        entry.tiers.push(tier);
        continue;
      }
      byName.set(name, {
        name,
        date: m[2],
        kind: m[1] ? 'users' : 'data',
        size_bytes: info.size,
        modified_at: info.mtime.toISOString(),
        tiers: [tier],
      });
    }
  }
  return [...byName.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind),
  );
}

async function sendFile(res, tier, name, who) {
  if (!TIERS.includes(tier) || !FILE_RE.test(name)) {
    sendJson(res, 400, { error: 'Ficheiro inválido.' });
    return;
  }
  const path = join(BACKUP_ROOT, tier, name);
  let info;
  try {
    info = await stat(path);
  } catch {
    sendJson(res, 404, { error: 'Ficheiro não encontrado — pode ter sido purgado pela retenção.' });
    return;
  }
  log('INFO', `descarga de ${tier}/${name} (${info.size} bytes) por ${who}`);
  res.writeHead(200, {
    'Content-Type': name.endsWith('.gz') ? 'application/gzip' : 'application/octet-stream',
    'Content-Length': info.size,
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
  });
  createReadStream(path)
    .on('error', (err) => {
      log('ERROR', `leitura de ${path}: ${err.message}`);
      res.destroy(err);
    })
    .pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET' || !url.pathname.startsWith('/api/vps-backups')) {
      sendJson(res, 404, { error: 'Não encontrado.' });
      return;
    }

    const who = await authorise(req);
    if (!who) {
      sendJson(res, 403, { error: 'Apenas administradores podem descarregar os backups da VPS.' });
      return;
    }

    if (url.pathname === '/api/vps-backups' || url.pathname === '/api/vps-backups/') {
      sendJson(res, 200, { files: await listBackups() });
      return;
    }

    const parts = url.pathname.split('/').slice(3); // ['file', tier, name]
    if (parts.length === 3 && parts[0] === 'file') {
      await sendFile(res, parts[1], decodeURIComponent(parts[2]), who);
      return;
    }

    sendJson(res, 404, { error: 'Não encontrado.' });
  } catch (err) {
    log('ERROR', err instanceof Error ? err.stack ?? err.message : String(err));
    if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno no servidor de backups.' });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => log('INFO', `a ouvir em http://${HOST}:${PORT}, a servir ${BACKUP_ROOT}`));
