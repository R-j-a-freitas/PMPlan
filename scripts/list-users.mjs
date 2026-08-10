// Diagnóstico de conta bloqueada (só leitura): confirma se UMA conta existe em
// auth.users, se está confirmada e qual o role. Uso: node scripts/list-users.mjs <email>
// Usa a API REST directamente (o cliente supabase-js exige WebSocket / Node 22+).
import { readFileSync } from 'node:fs';

// Carrega .env.service-role manualmente (process.loadEnvFile só existe no Node 20.12+).
for (const line of readFileSync('.env.service-role', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const targetEmail = (process.argv[2] ?? '').trim().toLowerCase();
if (!targetEmail) {
  console.error('Uso: node scripts/list-users.mjs <email>');
  process.exit(1);
}

const res = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=200`, { headers });
if (!res.ok) {
  console.error(`✗ Falha ao consultar (${res.status}): ${await res.text()}`);
  process.exit(1);
}
const body = await res.json();
const users = Array.isArray(body) ? body : (body.users ?? []);

const user = users.find((u) => (u.email ?? '').toLowerCase() === targetEmail);
if (!user) {
  console.log(`Conta "${targetEmail}": NÃO EXISTE em auth.users.`);
  console.log('→ Por isso o login dá "Invalid login credentials" e o email de recuperação não chega.');
  process.exit(0);
}

const pRes = await fetch(
  `${URL}/rest/v1/user_profiles?id=eq.${user.id}&select=role,must_change_password`,
  { headers },
);
const profile = pRes.ok ? (await pRes.json())[0] : undefined;

console.log(`Conta "${targetEmail}": EXISTE.`);
console.log(`  email confirmado:      ${user.email_confirmed_at ? 'sim' : 'NÃO (bloqueia login)'}`);
console.log(`  role:                  ${profile?.role ?? '(sem perfil)'}`);
console.log(`  must_change_password:  ${profile ? profile.must_change_password : '—'}`);
console.log(`  último login:          ${user.last_sign_in_at ?? 'nunca'}`);
