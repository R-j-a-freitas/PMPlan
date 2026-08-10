// Repõe a palavra-passe de UMA conta para uma temporária de uso único e força a troca
// no primeiro login (must_change_password=true). Uso: node scripts/reset-password.mjs <email>
// Usa a Admin API REST directamente (o cliente supabase-js exige WebSocket / Node 22+).
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

for (const line of readFileSync('.env.service-role', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const targetEmail = (process.argv[2] ?? '').trim().toLowerCase();
if (!targetEmail) {
  console.error('Uso: node scripts/reset-password.mjs <email>');
  process.exit(1);
}

// Encontra a conta pelo email.
const res = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=200`, { headers });
if (!res.ok) {
  console.error(`✗ Falha ao consultar (${res.status}): ${await res.text()}`);
  process.exit(1);
}
const body = await res.json();
const users = Array.isArray(body) ? body : (body.users ?? []);
const user = users.find((u) => (u.email ?? '').toLowerCase() === targetEmail);
if (!user) {
  console.error(`✗ Conta "${targetEmail}" não existe.`);
  process.exit(1);
}

const tempPassword = randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);

// 1) Define a nova palavra-passe na conta de auth.
const upd = await fetch(`${URL}/auth/v1/admin/users/${user.id}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ password: tempPassword }),
});
if (!upd.ok) {
  console.error(`✗ Falha ao repor a palavra-passe (${upd.status}): ${await upd.text()}`);
  process.exit(1);
}

// 2) Força a troca no primeiro login.
const prof = await fetch(`${URL}/rest/v1/user_profiles?id=eq.${user.id}`, {
  method: 'PATCH',
  headers: { ...headers, Prefer: 'return=minimal' },
  body: JSON.stringify({ must_change_password: true }),
});
if (!prof.ok) {
  console.error(`⚠ Palavra-passe reposta, mas falhou marcar must_change_password (${prof.status}): ${await prof.text()}`);
}

console.log(`✓ Palavra-passe de "${targetEmail}" reposta.`);
console.log(`  Palavra-passe temporária: ${tempPassword}`);
console.log('  Entra com esta palavra-passe — a app pede logo para definires uma nova.');
