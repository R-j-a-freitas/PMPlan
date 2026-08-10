// Edge Function: admin-create-user
// Cria uma conta com palavra-passe temporária (must_change_password=true) e atribui
// role/engineer_id. Só pode correr aqui (precisa de SUPABASE_SERVICE_ROLE_KEY, que
// nunca pode estar no bundle do frontend — ver lib/supabase.ts e a discussão de
// segurança sobre a service_role key). Chamada via supabase.functions.invoke() a
// partir de pages/Users.tsx e pages/Engineers.tsx ("Criar acesso"), restrita a quem já
// é 'admin' (verificado abaixo).
//
// Idempotente: se já existir uma conta com o email (ex: re-tentativa após uma falha
// parcial), reutiliza-a e apenas corrige o perfil, em vez de rebentar com "já registado".
//
// Deploy: supabase functions deploy admin-create-user
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem como secrets por defeito
// em qualquer projecto Supabase — não é preciso configurar nada extra.)

import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Chamada via supabase.functions.invoke() a partir do browser — sem tratar o preflight
// OPTIONS o browser bloqueia a resposta (ver send-proposal-email, mesmo problema).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function generateTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 16);
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (found) return found;
    if (data.users.length < perPage) break;
  }
  return null;
}

interface CreateUserBody {
  email: string;
  name?: string | null;
  role: 'admin' | 'planner' | 'engineer' | 'readonly';
  engineerId?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Sem autenticação.' }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Identifica quem está a chamar a partir do JWT do pedido (não confiar em nada
  // enviado no corpo) e confirma que é admin antes de qualquer operação privilegiada.
  const {
    data: { user: caller },
    error: callerError,
  } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''));
  if (callerError || !caller) {
    return jsonResponse({ error: 'Sessão inválida.' }, 401);
  }

  const { data: callerProfile } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', caller.id)
    .single();

  if (callerProfile?.role !== 'admin') {
    return jsonResponse({ error: 'Apenas administradores podem criar utilizadores.' }, 403);
  }

  let body: CreateUserBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo do pedido inválido.' }, 400);
  }

  if (!body.email || !body.role) {
    return jsonResponse({ error: 'email e role são obrigatórios.' }, 400);
  }

  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: body.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: body.name ?? null },
  });

  // Idempotência: se a criação falhar por a conta já existir, reutiliza-a. Só devolvemos
  // erro se realmente não houver conta com este email.
  let userId: string;
  let createdNow = false;
  if (createError || !created?.user) {
    const existing = await findUserByEmail(adminClient, body.email);
    if (!existing) {
      return jsonResponse({ error: createError?.message ?? 'Falha ao criar utilizador.' }, 400);
    }
    userId = existing.id;
  } else {
    userId = created.user.id;
    createdNow = true;
  }

  // O trigger handle_new_user já criou a linha em user_profiles (role 'readonly' por
  // omissão). Actualiza-a com o role/engineer_id pedidos.
  const profileUpdate: Record<string, unknown> = {
    name: body.name ?? null,
    engineer_id: body.engineerId ?? null,
  };

  if (createdNow) {
    // Conta nova: aplica o role pedido e força a troca da password temporária.
    profileUpdate.role = body.role;
    profileUpdate.must_change_password = true;
  } else {
    // Conta já existente: não despromover uma conta já configurada (admin/planner) só
    // por partilhar email — aplica o role pedido apenas se ainda estiver por configurar
    // ('readonly', o default). Não mexe na password nem no must_change_password: se
    // precisar de entrar, usa "Esqueci-me da palavra-passe".
    const { data: existingProfile } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if ((existingProfile?.role ?? 'readonly') === 'readonly') {
      profileUpdate.role = body.role;
    }
  }

  const { error: profileError } = await adminClient.from('user_profiles').update(profileUpdate).eq('id', userId);

  if (profileError) {
    return jsonResponse({ error: profileError.message }, 400);
  }

  return jsonResponse({
    email: body.email,
    tempPassword: createdNow ? tempPassword : null,
    existed: !createdNow,
  });
});
