// Utilitário de sessão de desenvolvimento: aplica SQL directamente via a função
// exec_sql() (RPC trancada a service_role). Uso: node scripts/run-sql.mjs ficheiro.sql
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.service-role');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Uso: node scripts/run-sql.mjs <ficheiro.sql>');
  process.exit(1);
}

const sql = readFileSync(sqlFile, 'utf8');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error } = await admin.rpc('exec_sql', { sql });

if (error) {
  console.error('✗ Falha ao executar SQL:', error.message);
  process.exit(1);
}

console.log(`✓ SQL aplicado com sucesso (${sqlFile}).`);
