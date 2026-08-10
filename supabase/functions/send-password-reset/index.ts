// Edge Function: send-password-reset
// Recuperação de palavra-passe SEM o email nativo do Supabase: gera uma palavra-passe
// temporária, aplica-a à conta (must_change_password=true) e envia-a por email via
// Resend — o mesmo canal fiável das propostas (send-proposal-email), em vez do SMTP
// nativo do Supabase, que é limitado e é bloqueado por filtros corporativos.
//
// Chamada a partir da página de Login (utilizador SEM sessão) via
// supabase.functions.invoke('send-password-reset', { body: { email } }). Corre com a
// SERVICE_ROLE_KEY (nunca no bundle do frontend); a identidade de quem chama é ignorada.
//
// Deploy: supabase functions deploy send-password-reset
// Secrets: RESEND_API_KEY (obrigatório), RESEND_FROM_EMAIL, RESEND_FROM_NAME (opcionais).
// APP_URL (opcional) → link "Iniciar sessão" no email. SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY já existem por defeito.

import { createClient, type User } from 'jsr:@supabase/supabase-js@2';

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

function generateTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 16);
}

async function findUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (found) return found;
    if (data.users.length < perPage) break; // última página
  }
  return null;
}

async function sendPasswordEmailViaResend(to: string, tempPassword: string): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
  const RESEND_FROM_NAME = Deno.env.get('RESEND_FROM_NAME') || 'PMPlan';
  const APP_URL = Deno.env.get('APP_URL');

  if (!RESEND_API_KEY) return { ok: false, error: 'Missing RESEND_API_KEY' };

  const loginLink = APP_URL ? `<p><a href="${APP_URL}">Iniciar sessão</a></p>` : '';
  const html =
    `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body style="font-family:Arial,sans-serif;">` +
    `<p>Olá,</p>` +
    `<p>Foi pedida a recuperação da palavra-passe da sua conta <strong>PMPlan</strong>.</p>` +
    `<p>A sua palavra-passe temporária é:</p>` +
    `<p style="font-size:18px;font-weight:bold;letter-spacing:1px;">${tempPassword}</p>` +
    `<p>Ao iniciar sessão ser-lhe-á pedido para definir uma nova palavra-passe.</p>` +
    loginLink +
    `<p style="color:#6b7280;font-size:12px;">Se não foi você a pedir esta recuperação, informe o administrador — ` +
    `a palavra-passe anterior deixou de ser válida.</p>` +
    `</body></html>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
      to: [to],
      subject: 'PMPlan — nova palavra-passe',
      html,
    }),
  });
  if (!resp.ok) return { ok: false, error: `Resend ${resp.status}: ${(await resp.text()).slice(0, 300)}` };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo do pedido inválido.' }, 400);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email) {
    return jsonResponse({ error: 'email é obrigatório.' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let user: User | null;
  try {
    user = await findUserByEmail(admin, email);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Falha ao consultar a conta.' }, 500);
  }

  // Resposta neutra quando a conta não existe — não revela se o email está registado
  // (evita enumeração de contas). Nada é alterado nem enviado.
  if (!user) {
    return jsonResponse({ ok: true });
  }

  const tempPassword = generateTempPassword();

  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, { password: tempPassword });
  if (pwError) {
    return jsonResponse({ error: pwError.message }, 400);
  }

  // Força a troca no primeiro login (mesmo padrão de admin-create-user).
  const { error: profileError } = await admin
    .from('user_profiles')
    .update({ must_change_password: true })
    .eq('id', user.id);
  if (profileError) {
    return jsonResponse({ error: profileError.message }, 400);
  }

  const sent = await sendPasswordEmailViaResend(email, tempPassword);
  if (!sent.ok) {
    // A palavra-passe já foi mudada; avisa para o admin poder repor manualmente.
    return jsonResponse({ error: sent.error ?? 'Falha ao enviar o email.' }, 502);
  }

  return jsonResponse({ ok: true });
});
