// Aplica a versão corrigida de prevent_privilege_escalation() à BD (contexto service-role
// passa a ser permitido). Uso: node scripts/apply-trigger-fix.mjs
// Chama o RPC exec_sql via REST (o cliente supabase-js exige WebSocket / Node 22+).
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.service-role', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sql = `
create or replace function prevent_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and user_role() is distinct from 'admin' then
    if new.role is distinct from old.role then
      raise exception 'Sem permissão para alterar o role.';
    end if;
    if new.engineer_id is distinct from old.engineer_id then
      raise exception 'Sem permissão para alterar a associação a engenheiro.';
    end if;
  end if;
  return new;
end;
$$;
`;

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

console.log('✓ Função prevent_privilege_escalation() actualizada — service-role deixa de ser bloqueado.');
