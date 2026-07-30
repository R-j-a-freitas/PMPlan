// Utilitário de sessão de desenvolvimento: aplica SQL directamente via a função
// exec_sql() (RPC trancada a service_role). Uso: node scripts/run-sql.mjs ficheiro.sql
//
// Sem dependências e sem APIs recentes de Node, de propósito — a versão anterior usava
// process.loadEnvFile (Node >= 20.12) e o cliente supabase-js (que precisa de WebSocket
// global, Node >= 22) e rebentava no Node 20.11 instalado. Mesmo padrão dos scripts
// apply-migration-0006/0009: parsing manual do .env e fetch directo ao PostgREST.
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.service-role', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Uso: node scripts/run-sql.mjs <ficheiro.sql>');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.service-role.');
  process.exit(1);
}

const sql = readFileSync(sqlFile, 'utf8');

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ sql }),
});

if (!res.ok) {
  console.error(`✗ Falha ao executar SQL (${res.status}):`, (await res.text()).slice(0, 500));
  process.exit(1);
}

console.log(`✓ SQL aplicado com sucesso (${sqlFile}).`);
