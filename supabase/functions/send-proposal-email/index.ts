// Edge Function: send-proposal-email
// Envia email via Resend API (retries + validação) — a chave da Resend nunca pode estar
// no bundle do frontend, por isso esta função existe (mesmo motivo do admin-create-user:
// só corre aqui, com secrets do servidor). Chamada via supabase.functions.invoke() a
// partir de pages/Approvals.tsx, restrita a quem tem canSendEmails (admin/planner —
// verificado abaixo via user_profiles.role, nunca confiando no que o frontend manda).
//
// Deploy: supabase functions deploy send-proposal-email
// Secrets (supabase secrets set ...): RESEND_API_KEY (obrigatório), RESEND_FROM_EMAIL,
// RESEND_FROM_NAME, EMAIL_REPLY_TO_DEFAULT (opcionais, com fallback abaixo).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem como secrets por defeito.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Chamada via supabase.functions.invoke() a partir do browser (origem diferente do
// próprio Supabase) — o cliente manda sempre um preflight OPTIONS com os headers
// authorization/apikey/content-type; sem isto o browser bloqueia a resposta e o erro
// aparece só como "Failed to send a request to the Edge Function" (nada chega aqui).
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

const EmailInputSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(200),
  html: z.string().min(1),
  // Conteúdo em base64 (ex: PDF/ICS gerados no frontend).
  attachments: z.array(z.object({ filename: z.string(), content: z.string() })).optional(),
});

function ensureHtmlDocument(html: string): string {
  const trimmed = html.trim();
  if (/<html[\s>]/i.test(trimmed)) return trimmed;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body>${trimmed}</body></html>`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(ms: number): number {
  return Math.floor(ms * (0.8 + Math.random() * 0.4));
}

function isRetryable(status?: number): boolean {
  if (!status) return true;
  return status === 429 || status >= 500;
}

type SendResult =
  | { success: true; messageId: string }
  | { success: false; error: string; providerStatus?: number; details?: unknown };

async function sendEmailViaResend(input: z.infer<typeof EmailInputSchema>): Promise<SendResult> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
  const RESEND_FROM_NAME = Deno.env.get('RESEND_FROM_NAME') || 'PMPlan';
  const DEFAULT_REPLY_TO = Deno.env.get('EMAIL_REPLY_TO_DEFAULT');

  if (!RESEND_API_KEY) {
    return { success: false, error: 'Missing RESEND_API_KEY' };
  }

  const body: Record<string, unknown> = {
    from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
    to: input.to,
    subject: input.subject,
    html: ensureHtmlDocument(input.html),
  };
  if (input.cc?.length) body.cc = input.cc;
  if (DEFAULT_REPLY_TO) body.reply_to = [DEFAULT_REPLY_TO];
  if (input.attachments?.length) body.attachments = input.attachments;

  const retries = [500, 1000, 2000];
  let lastError: SendResult = { success: false, error: 'Unknown error' };

  for (let attempt = 0; attempt <= retries.length; attempt++) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { id?: string };
        return { success: true, messageId: data.id || `resend-${Date.now()}` };
      }
      const text = await resp.text();
      let providerMessage = `Resend error ${resp.status}`;
      try {
        const json = JSON.parse(text);
        providerMessage = json?.message || json?.error?.message || providerMessage;
      } catch {
        providerMessage = text.slice(0, 500) || providerMessage;
      }
      lastError = { success: false, error: providerMessage, providerStatus: resp.status, details: text.slice(0, 1000) };
      if (!isRetryable(resp.status) || attempt === retries.length) return lastError;
      await sleep(withJitter(retries[attempt]));
    } catch (err) {
      lastError = { success: false, error: err instanceof Error ? err.message : 'Network error calling Resend' };
      if (attempt === retries.length) return lastError;
      await sleep(withJitter(retries[attempt]));
    }
  }
  return lastError;
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

  const { data: callerProfile } = await adminClient.from('user_profiles').select('role').eq('id', caller.id).single();

  // canSendEmails (lib/permissions.ts) só é true para admin/planner — replicado aqui
  // porque o frontend nunca pode ser a única barreira para uma operação privilegiada.
  if (callerProfile?.role !== 'admin' && callerProfile?.role !== 'planner') {
    return jsonResponse({ error: 'Sem permissão para enviar emails.' }, 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo do pedido inválido.' }, 400);
  }

  const parsed = EmailInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse({ error: 'Dados inválidos.', details: parsed.error.flatten() }, 400);
  }

  const result = await sendEmailViaResend(parsed.data);
  if (!result.success) {
    return jsonResponse({ error: result.error, details: result.details }, result.providerStatus ?? 502);
  }

  return jsonResponse({ messageId: result.messageId });
});
