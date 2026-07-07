import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.service-role');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const [, , name, email, role, engineerId] = process.argv;
if (!name || !email || !role) {
  console.error('Uso: node scripts/create-user.mjs "<name>" <email> <role> [engineerId]');
  process.exit(1);
}

function generateTempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Buffer.from(bytes).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
}

const tempPassword = generateTempPassword();

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password: tempPassword,
  email_confirm: true,
  user_metadata: { name },
});

if (createError) {
  console.error('✗', createError.message);
  process.exit(1);
}

const { error: profileError } = await admin
  .from('user_profiles')
  .update({ name, role, engineer_id: engineerId || null, must_change_password: true })
  .eq('id', created.user.id);

if (profileError) {
  console.error('✗ (utilizador criado em auth, mas falhou o perfil):', profileError.message);
  process.exit(1);
}

console.log(`✓ ${name} <${email}> criado como "${role}". Password temporária: ${tempPassword}`);
