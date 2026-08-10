// Aplica a migration 0009 (tabela email_recipients — destinatários em CC configuráveis
// na app) à BD. Uso: node scripts/apply-migration-0009.mjs
// Chama o RPC exec_sql via REST (o cliente supabase-js exige WebSocket / Node 22+).
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.service-role', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sql = readFileSync('supabase/migrations/0009_email_recipients.sql', 'utf8');

const res = await fetch(`${URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ sql }),
});

if (!res.ok) {
  console.error(`✗ Falha (${res.status}): ${await res.text()}`);
  process.exit(1);
}

console.log('✓ Migration 0009 aplicada — email_recipients criada e Teresa Matos migrada (active=true).');
