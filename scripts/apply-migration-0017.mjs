// Aplica a migration 0017 (via de aprovação independente para a Braquiterapia) à BD.
// Uso: node scripts/apply-migration-0017.mjs
//
// Mesmo padrão dos apply-migration-0006/0009: parsing manual do .env e fetch directo ao
// PostgREST, porque o cliente supabase-js precisa de WebSocket global (Node >= 22) e o
// Node instalado é mais antigo.
//
// A migração é idempotente (add column if not exists / drop+add constraint / create or
// replace function / insert ... on conflict do nothing), por isso correr duas vezes não
// faz mal.
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.service-role', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.service-role.');
  process.exit(1);
}

const sql = readFileSync('supabase/migrations/0017_brachytherapy_approvals.sql', 'utf8');

const res = await fetch(`${URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql }),
});

if (!res.ok) {
  console.error(`✗ Falha (${res.status}): ${await res.text()}`);
  process.exit(1);
}

console.log('✓ Migration 0017 aplicada — vias de aprovação (standard/brachytherapy),');
console.log('  prefixo BT- no código de referência e os 6 templates brachy_* (PT/ES).');
