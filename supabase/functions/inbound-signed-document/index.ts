// Edge Function: inbound-signed-document
// Recebe o webhook `email.received` da Resend quando um cliente responde à carta de
// assinatura com o PDF assinado em anexo, guarda o anexo no Storage e regista-o em
// signed_documents já associado ao hospital certo.
//
// Deploy: supabase functions deploy inbound-signed-document --no-verify-jwt
//   O --no-verify-jwt é obrigatório: quem chama é a Resend, que não tem (nem pode ter) um
//   JWT do Supabase. A autenticação faz-se pela assinatura do webhook, verificada abaixo —
//   sem RESEND_WEBHOOK_SECRET definido a função recusa tudo, para nunca ficar um endpoint
//   público a aceitar payloads forjados.
//
// Secrets (supabase secrets set ...):
//   RESEND_API_KEY          obrigatório — para ir buscar o email e os anexos
//   RESEND_WEBHOOK_SECRET   obrigatório — segredo do webhook (whsec_...), dado pela Resend
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  já existem por defeito
//
// Configuração na Resend: Webhooks → novo endpoint para o evento `email.received`,
// apontado a https://<projecto>.supabase.co/functions/v1/inbound-signed-document

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';

const BUCKET = 'signed-documents';

// Caixas que recebem os documentos assinados, separadas por vírgulas ou espaços. O que a
// carta leva em CC e Reply-To (SIGNED_DOCUMENTS_MAILBOX em src/lib/proposalEmail.ts) tem
// de estar nesta lista, senão as respostas dos clientes não são arquivadas.
//
// É uma lista e não um endereço só por causa das mudanças de domínio: as cartas enviadas
// antes da mudança levam a caixa antiga no Reply-To, e as respostas continuam a ir para lá
// durante semanas. Mantendo cá a antiga, essas respostas continuam a ser arquivadas — e a
// guarda isFromOurselves continua a reconhecer as nossas próprias cartas antigas. Sem isso
// a perda seria silenciosa: um email que não passa o filtro devolve 200, não erro.
//
// Aceita vírgula, ponto-e-vírgula ou espaço como separador de propósito: `secrets set
// X=a,b` no PowerShell chega cá como "a b" (a vírgula é o operador de array dele), e um
// separador mal interpretado partia o filtro inteiro sem dar erro nenhum.
const DOCUMENTS_MAILBOXES = (Deno.env.get('SIGNED_DOCUMENTS_MAILBOX') ?? 'documentos@pmplan.net')
  .split(/[\s,;]+/)
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);



// Cliente no escopo do módulo: é apenas URL + chave, não guarda estado por pedido, e
// assim as funções abaixo usam-no directamente em vez de o receber como parâmetro (o tipo
// genérico do SupabaseClient não sobrevive a ser passado à mão — as linhas das queries
// acabam como `never`).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Só se arquivam anexos que sejam plausivelmente o documento assinado. Sem isto, cada
// resposta traria também a assinatura gráfica do cliente, logótipos e o .ics devolvido.
const ACCEPTED_CONTENT_TYPES = ['application/pdf'];
const ACCEPTED_EXTENSIONS = ['.pdf'];
// Limite defensivo: o Storage aguenta mais, mas um anexo desta ordem não é uma carta
// assinada e não vale a pena arrastá-lo para dentro da função.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Verificação da assinatura (formato Svix, usado pela Resend) ──────────────
// Implementada à mão com Web Crypto em vez de puxar a biblioteca svix: são 20 linhas,
// e um endpoint que aceita qualquer POST é a diferença entre arquivar documentos reais e
// arquivar o que um terceiro quiser lá pôr.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isValidSignature(req: Request, rawBody: string): Promise<boolean> {
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Rejeita reenvios antigos (replay): a tolerância habitual do Svix são 5 minutos.
  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  // O segredo vem como "whsec_<base64>"; é a parte base64 que é a chave HMAC.
  const secretBase64 = RESEND_WEBHOOK_SECRET.replace(/^whsec_/, '');
  const keyBytes = Uint8Array.from(atob(secretBase64), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = `${svixId}.${svixTimestamp}.${rawBody}`;
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // O header pode trazer várias assinaturas separadas por espaço ("v1,<sig> v1,<sig>")
  // durante uma rotação de segredo — basta uma bater certo.
  return svixSignature
    .split(' ')
    .map((part) => part.split(',')[1] ?? '')
    .some((candidate) => timingSafeEqual(candidate, expected));
}

// ─── Resend: buscar o email completo e os anexos ─────────────────────────────
async function resendGet<T>(path: string): Promise<T | null> {
  const resp = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!resp.ok) {
    console.error(`Resend GET ${path} falhou: ${resp.status} ${(await resp.text()).slice(0, 300)}`);
    return null;
  }
  return (await resp.json()) as T;
}

interface ReceivedEmail {
  id: string;
  from?: string;
  to?: string[];
  cc?: string[];
  /** Endereços para os quais o email foi efectivamente encaminhado (catch-all). */
  received_for?: string[];
  subject?: string;
  text?: string | null;
  html?: string;
  message_id?: string;
  headers?: Record<string, string>;
}

interface ReceivedAttachment {
  id: string;
  filename: string;
  content_type?: string;
  size?: number;
  download_url?: string;
}

// ─── Identificação do hospital ───────────────────────────────────────────────
interface MatchResult {
  hospitalId: string | null;
  proposalId: string | null;
  method: 'reference_code' | 'subject_hospital' | 'sender_email' | 'unmatched';
  /** Hospitais possíveis quando não deu para escolher um (ex.: o remetente é contacto de
   *  vários) — sugestão para a associação manual (migração 0024). */
  candidateHospitalIds: string[];
}

function extractEmailAddress(value: string | undefined): string | null {
  if (!value) return null;
  const angled = value.match(/<([^>]+)>/);
  const address = (angled ? angled[1] : value).trim().toLowerCase();
  return address.includes('@') ? address : null;
}

function extractFromName(value: string | undefined): string | null {
  if (!value) return null;
  const name = value.split('<')[0]?.trim().replace(/^"|"$/g, '');
  return name && name.includes('@') === false && name.length > 0 ? name : null;
}

// Normaliza para comparar nomes de hospital dentro do assunto: sem acentos, sem
// pontuação, espaços colapsados. "Hosp. de Braga" e "HOSPITAL DE BRAGA" deixam de ser
// coisas diferentes.
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Cascata deliberada, da certeza ao palpite — e nunca inventa: se nada bater, devolve
// 'unmatched' e o documento fica na fila para associação manual.
async function identifyHospital(email: ReceivedEmail): Promise<MatchResult> {
  const subject = email.subject ?? '';

  // 1. Código de referência no assunto — o mecanismo desenhado para isto. O prefixo diz de
  //    que via de aprovação é a carta ('PM-' geral, 'BT-' braquiterapia, migração 0017);
  //    o que identifica a proposta são os 8 hex, únicos entre as duas. Com duas propostas
  //    por hospital, é isto que arquiva o documento na proposta certa e não só no hospital.
  const codeMatch = subject.match(/\b(?:PM|BT)-[0-9A-F]{8}\b/i);
  if (codeMatch) {
    const { data } = await admin
      .from('client_proposals')
      .select('id, hospital_id')
      .eq('reference_code', codeMatch[0].toUpperCase())
      .maybeSingle();
    const proposal = data as { id: string; hospital_id: string } | null;
    if (proposal) {
      return {
        hospitalId: proposal.hospital_id,
        proposalId: proposal.id,
        method: 'reference_code',
        candidateHospitalIds: [],
      };
    }
  }

  // 2. Nome do hospital dentro do assunto. O assunto da carta inclui {{hospital}}, por
  //    isso na resposta ("Re: ...") ele vem quase sempre — vale como rede de segurança
  //    se alguém tiver editado o template e retirado o código.
  const normalizedSubject = normalize(subject);
  const { data: hospitalRows } = await admin.from('hospitals').select('id, name, short_name, contacts');
  const hospitals = (hospitalRows ?? []) as {
    id: string;
    name: string;
    short_name: string | null;
    contacts: { email?: string }[] | null;
  }[];

  // Do nome mais longo para o mais curto: se dois hospitais partilharem prefixo, ganha
  // o mais específico em vez do primeiro que calhar.
  const candidates = hospitals
    .flatMap((hospital) =>
      [hospital.name, hospital.short_name]
        .filter((value): value is string => !!value && value.trim().length >= 4)
        .map((value) => ({ id: hospital.id, needle: normalize(value) })),
    )
    .sort((a, b) => b.needle.length - a.needle.length);
  const nameHit = candidates.find((candidate) => normalizedSubject.includes(candidate.needle));
  if (nameHit) {
    return { hospitalId: nameHit.id, proposalId: null, method: 'subject_hospital', candidateHospitalIds: [] };
  }

  // 3. Email do remetente contra os contactos dos hospitais. É o menos fiável, e só
  //    associa quando aponta para UM hospital. Um grupo hospitalar com uma caixa
  //    partilhada (ou a mesma pessoa em dois hospitais) dá vários — antes ficava o
  //    primeiro que calhasse e o documento ia parar ao hospital errado sem sinal nenhum.
  //    Agora fica órfão, com os candidatos guardados para a associação manual.
  const fromAddress = extractEmailAddress(email.from);
  if (fromAddress) {
    const senderHospitalIds = await hospitalsForSender(fromAddress, hospitals);
    if (senderHospitalIds.length === 1) {
      return {
        hospitalId: senderHospitalIds[0],
        proposalId: null,
        method: 'sender_email',
        candidateHospitalIds: [],
      };
    }
    if (senderHospitalIds.length > 1) {
      return { hospitalId: null, proposalId: null, method: 'unmatched', candidateHospitalIds: senderHospitalIds };
    }
  }

  return { hospitalId: null, proposalId: null, method: 'unmatched', candidateHospitalIds: [] };
}

// Hospitais de que o remetente é contacto. A fonte é hospital_contacts (migração 0021),
// onde os contactos vivem agora; o jsonb antigo hospitals.contacts entra também enquanto
// não for apagado, para não perder hospitais que ainda só lá tenham o contacto.
// Contactos desactivados contam: desactivar alguém tira-o dos ENVIOS, mas se ele responder
// com uma carta assinada, continua a ser do hospital dele.
async function hospitalsForSender(
  fromAddress: string,
  hospitals: { id: string; contacts: { email?: string }[] | null }[],
): Promise<string[]> {
  // ilike para ignorar maiúsculas; os `_` e `%` escapados porque no LIKE são wildcards, e
  // "joao_silva@..." apanharia também "joaoXsilva@...".
  const pattern = fromAddress.replace(/[\\%_]/g, (char) => `\\${char}`);
  const { data, error } = await admin.from('hospital_contacts').select('hospital_id').ilike('email', pattern);
  if (error) console.error(`hospital_contacts: ${error.message}`);
  const fromTable = ((data ?? []) as { hospital_id: string }[]).map((row) => row.hospital_id);
  const fromLegacy = hospitals
    .filter((hospital) =>
      (hospital.contacts ?? []).some((contact) => contact.email?.trim().toLowerCase() === fromAddress),
    )
    .map((hospital) => hospital.id);
  return [...new Set([...fromTable, ...fromLegacy])];
}

// O inbound da Resend é catch-all: com o MX no domínio, este webhook recebe TODOS os
// emails para qualquer endereço do domínio — respostas ao noreply, spam, notificações.
// Sem este filtro, qualquer PDF que chegasse ao domínio ia parar ao arquivo de documentos
// assinados de clientes.
//
// Aceita-se por duas vias, e basta uma:
//   a) o email foi dirigido à caixa de documentos (to/cc/received_for) — o caso normal,
//      porque a carta leva-a em CC e em Reply-To;
//   b) o assunto traz um código de proposta que fomos nós que emitimos ('PM-' na via geral,
//      'BT-' na de braquiterapia) — cobre o cliente que responde só ao noreply@ mas mantém
//      o assunto.
// Um email que não tenha nem uma nem outra não tem nada que ver connosco.
function isForDocumentsMailbox(email: ReceivedEmail): boolean {
  const recipients = [...(email.to ?? []), ...(email.cc ?? []), ...(email.received_for ?? [])]
    .map((value) => extractEmailAddress(value))
    .filter((value): value is string => !!value);
  if (recipients.some((recipient) => DOCUMENTS_MAILBOXES.includes(recipient))) return true;
  return /\b(?:PM|BT)-[0-9A-F]{8}\b/i.test(email.subject ?? '');
}

// Emails enviados por nós próprios nunca são arquivados. O documento assinado vem sempre
// do cliente; o que sai daqui é a carta EM BRANCO. Sem esta guarda, qualquer cópia da
// nossa própria carta que reentre no domínio (esteve em CC durante um teste, um bounce
// que devolve a mensagem original, um reencaminhamento interno) arquivava um PDF por
// assinar ao lado do assinado — e os dois têm o mesmo nome de ficheiro, o que torna a
// confusão fácil de não notar.
function isFromOurselves(email: ReceivedEmail): boolean {
  const fromAddress = extractEmailAddress(email.from);
  if (!fromAddress) return false;
  const ourDomains = DOCUMENTS_MAILBOXES.map((mailbox) => mailbox.split('@')[1]).filter(Boolean);
  return ourDomains.some((domain) => fromAddress.endsWith(`@${domain}`));
}

function isAcceptedAttachment(attachment: ReceivedAttachment): boolean {
  const contentType = (attachment.content_type ?? '').toLowerCase();
  const filename = (attachment.filename ?? '').toLowerCase();
  if (ACCEPTED_CONTENT_TYPES.some((accepted) => contentType.startsWith(accepted))) return true;
  return ACCEPTED_EXTENSIONS.some((extension) => filename.endsWith(extension));
}

// Nome seguro para o Storage: sem separadores de caminho nem caracteres que obriguem a
// escapar em URLs mais à frente.
function safeFilename(filename: string): string {
  return (
    filename
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-120) || 'documento.pdf'
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);

  if (!RESEND_WEBHOOK_SECRET || !RESEND_API_KEY) {
    console.error('RESEND_WEBHOOK_SECRET ou RESEND_API_KEY em falta — pedido recusado.');
    return jsonResponse({ error: 'Função mal configurada.' }, 500);
  }

  const rawBody = await req.text();
  if (!(await isValidSignature(req, rawBody))) {
    return jsonResponse({ error: 'Assinatura inválida.' }, 401);
  }

  let payload: { type?: string; data?: { email_id?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Corpo inválido.' }, 400);
  }

  // Outros eventos do mesmo endpoint são ignorados com 200: devolver erro faria a Resend
  // reentregar em ciclo um evento que nunca vamos querer.
  if (payload.type !== 'email.received') return jsonResponse({ ignored: payload.type ?? 'sem tipo' });

  const emailId = payload.data?.email_id;
  if (!emailId) return jsonResponse({ error: 'Payload sem email_id.' }, 400);

  const email = await resendGet<ReceivedEmail>(`/emails/receiving/${emailId}`);
  if (!email) return jsonResponse({ error: 'Não foi possível obter o email na Resend.' }, 502);

  // 200 e não erro nos casos abaixo: não são falhas, é correio que não se arquiva —
  // devolver erro faria a Resend reentregá-lo em ciclo.
  if (isFromOurselves(email)) {
    console.log(`Email ${emailId} enviado por nós (${email.from}); ignorado.`);
    return jsonResponse({ stored: 0, reason: 'enviado por nós' });
  }

  if (!isForDocumentsMailbox(email)) {
    console.log(`Email ${emailId} não dirigido a ${DOCUMENTS_MAILBOXES.join(', ')} nem com código de proposta; ignorado.`);
    return jsonResponse({ stored: 0, reason: 'não dirigido à caixa de documentos' });
  }

  const attachmentList = await resendGet<{ data?: ReceivedAttachment[] }>(
    `/emails/receiving/${emailId}/attachments`,
  );
  const attachments = (Array.isArray(attachmentList) ? attachmentList : attachmentList?.data) ?? [];
  const accepted = attachments.filter(isAcceptedAttachment);

  if (accepted.length === 0) {
    // Uma resposta sem PDF é normal ("recebido, obrigado") — não é erro, não se reentrega.
    console.log(`Email ${emailId} sem anexos PDF; ignorado.`);
    return jsonResponse({ stored: 0, reason: 'sem anexos PDF' });
  }

  const match = await identifyHospital(email);
  const fromEmail = extractEmailAddress(email.from);
  const fromName = extractFromName(email.from);

  const stored: string[] = [];
  const failed: { filename: string; error: string }[] = [];

  for (const attachment of accepted) {
    try {
      if (attachment.size && attachment.size > MAX_ATTACHMENT_BYTES) {
        failed.push({ filename: attachment.filename, error: `Anexo demasiado grande (${attachment.size} bytes).` });
        continue;
      }

      // O download_url do webhook pode já ter expirado (válido 1h) se a entrega falhou e
      // foi reentregue mais tarde — nesse caso pede-se um novo.
      let downloadUrl = attachment.download_url;
      if (!downloadUrl) {
        const fresh = await resendGet<ReceivedAttachment>(
          `/emails/receiving/${emailId}/attachments/${attachment.id}`,
        );
        downloadUrl = fresh?.download_url;
      }
      if (!downloadUrl) {
        failed.push({ filename: attachment.filename, error: 'Sem download_url.' });
        continue;
      }

      const fileResp = await fetch(downloadUrl);
      if (!fileResp.ok) {
        failed.push({ filename: attachment.filename, error: `Download falhou (${fileResp.status}).` });
        continue;
      }
      const bytes = new Uint8Array(await fileResp.arrayBuffer());

      // O id do email no caminho garante unicidade entre respostas diferentes que tragam
      // anexos com o mesmo nome ("Plano_Manutencao.pdf" é o caso típico).
      const storagePath = `${emailId}/${safeFilename(attachment.filename)}`;

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, bytes, {
          contentType: attachment.content_type || 'application/pdf',
          upsert: true,
        });
      if (uploadError) {
        failed.push({ filename: attachment.filename, error: `Storage: ${uploadError.message}` });
        continue;
      }

      // onConflict no par (inbound_email_id, filename): uma reentrega do mesmo webhook
      // actualiza a linha em vez de duplicar o documento.
      const { error: insertError } = await admin.from('signed_documents').upsert(
        {
          hospital_id: match.hospitalId,
          proposal_id: match.proposalId,
          storage_path: storagePath,
          filename: attachment.filename,
          content_type: attachment.content_type ?? 'application/pdf',
          size_bytes: bytes.byteLength,
          inbound_email_id: emailId,
          inbound_message_id: email.message_id ?? null,
          from_email: fromEmail,
          from_name: fromName,
          subject: email.subject ?? null,
          match_method: match.method,
          matched_at: match.hospitalId ? new Date().toISOString() : null,
          candidate_hospital_ids: match.candidateHospitalIds,
        },
        { onConflict: 'inbound_email_id,filename' },
      );
      if (insertError) {
        failed.push({ filename: attachment.filename, error: `BD: ${insertError.message}` });
        continue;
      }

      stored.push(attachment.filename);
    } catch (err) {
      failed.push({ filename: attachment.filename, error: err instanceof Error ? err.message : 'Erro desconhecido' });
    }
  }

  if (failed.length > 0) console.error(`Email ${emailId}: falhas`, failed);

  // 200 mesmo com falhas parciais desde que algo tenha sido guardado — devolver erro faria
  // a Resend reentregar tudo e reprocessar o que já está arquivado. Um 500 só quando nada
  // passou, que é o caso em que vale mesmo a pena tentar de novo.
  if (stored.length === 0 && failed.length > 0) {
    return jsonResponse({ stored: 0, failed }, 500);
  }
  return jsonResponse({ stored: stored.length, failed, match: match.method });
});
