// Edge Function: admin-delete-user
// Remove a conta de login (auth.users) de um utilizador — usado no "Remover acesso" da
// ficha de engenheiro (pages/Engineers.tsx). Apagar de auth.users cascateia para
// user_profiles (FK on delete cascade — ver 0001_init.sql), pelo que o perfil desaparece
// junto. Exige a service_role key, por isso corre só aqui; restrito a admins.
//
// Deploy: supabase functions deploy admin-delete-user

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

interface DeleteUserBody {
  userId: string;
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
    return jsonResponse({ error: 'Apenas administradores podem remover acessos.' }, 403);
  }

  let body: DeleteUserBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo do pedido inválido.' }, 400);
  }

  if (!body.userId) {
    return jsonResponse({ error: 'userId é obrigatório.' }, 400);
  }

  // Um admin não se pode auto-remover (ficaria sem sessão a meio da operação).
  if (body.userId === caller.id) {
    return jsonResponse({ error: 'Não pode remover o seu próprio acesso.' }, 400);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(body.userId);
  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 400);
  }

  return jsonResponse({ ok: true });
});
