import { supabase } from './supabase';
import type { EmailTemplate } from '../types';
import type { ProposalLetterData } from './exporters/letterPdf';

const TABLE_HEADERS = {
  PT: { hospital: 'Hospital', serial: 'N/S', task: 'Tarefa', date: 'Data' },
  ES: { hospital: 'Hospital', serial: 'N/S', task: 'Tarea', date: 'Fecha' },
} as const;

// Tabela HTML agrupada por equipamento — usada no placeholder {{tabela}} dos templates.
// Cabeçalhos no idioma do hospital (data.country), tal como o resto do email/carta.
export function buildProposalEmailTableHtml(data: ProposalLetterData): string {
  const cell = 'border:1px solid #d1d5db;padding:6px;';
  const headers = TABLE_HEADERS[data.country];
  const rows = data.equipmentGroups
    .flatMap((group) =>
      group.dates.map(
        (date) =>
          `<tr><td style="${cell}">${data.hospitalName}</td><td style="${cell}">${group.serialNumber}</td><td style="${cell}">${group.taskLabel}</td><td style="${cell}">${date}</td></tr>`,
      ),
    )
    .join('');
  return (
    `<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;">` +
    `<thead><tr style="background:#f3f4f6;text-align:left;">` +
    `<th style="${cell}">${headers.hospital}</th><th style="${cell}">${headers.serial}</th><th style="${cell}">${headers.task}</th><th style="${cell}">${headers.date}</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>`
  );
}

// Templates são editados como texto simples (parágrafos separados por linha em branco)
// — \n\n vira novo <p>, \n vira <br>; o envio em si é sempre HTML (Resend).
function textToHtml(text: string): string {
  return text
    .split('\n\n')
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// Substitui {{ano}}, {{hospital}}, {{engenheiro}} no assunto/corpo do template, converte
// o corpo para HTML, e só depois injecta {{tabela}} (HTML) — assim a tabela nunca é
// afectada pela conversão \n → <br> do texto à volta dela.
export function renderProposalEmail(
  template: Pick<EmailTemplate, 'subject' | 'body'>,
  vars: { ano?: string; hospital?: string; engenheiro?: string },
  tableHtml?: string,
): { subject: string; htmlBody: string } {
  function replaceVars(text: string): string {
    let result = text;
    if (vars.ano !== undefined) result = result.split('{{ano}}').join(vars.ano);
    if (vars.hospital !== undefined) result = result.split('{{hospital}}').join(vars.hospital);
    if (vars.engenheiro !== undefined) result = result.split('{{engenheiro}}').join(vars.engenheiro);
    return result;
  }

  const subject = replaceVars(template.subject);
  let htmlBody = textToHtml(replaceVars(template.body));
  if (tableHtml) htmlBody = htmlBody.split('{{tabela}}').join(tableHtml);

  return { subject, htmlBody };
}

export interface EmailAttachment {
  filename: string;
  /** Conteúdo em base64. */
  content: string;
}

export interface SendProposalEmailParams {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

// Chama a Edge Function send-proposal-email (Resend) — nunca a API da Resend
// directamente: a chave é um secret de servidor, não pode estar no bundle do frontend
// (ver supabase/functions/send-proposal-email).
export async function sendProposalEmail(params: SendProposalEmailParams): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ messageId: string }>('send-proposal-email', {
    body: params,
  });
  if (error) throw error;
  return data?.messageId ?? '';
}
