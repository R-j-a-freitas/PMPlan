import type { Country } from './zone';

export type ProposalStage =
  | 'draft'
  | 'pending_engineer'
  | 'engineer_approved'
  | 'pending_client'
  | 'client_approved'
  | 'letter_sent'
  | 'signed'
  | 'rejected';

/** Via de aprovação de uma proposta (migração 0017). Os equipamentos de Braquiterapia
 *  seguem um processo independente do resto do hospital — engenheiros, interlocutores e
 *  tempos próprios — por isso as PMs de um hospital dividem-se por vias, e cada via corre
 *  a máquina de estados completa (validação do engenheiro → aprovação do cliente → carta
 *  → assinatura) sem esperar pela outra. */
export type ApprovalTrack = 'standard' | 'brachytherapy';

/** Proposta de calendarização por hospital/ano/via — a unidade de aprovação/envio (não a
 *  PM individual): o admin aprova/envia o conjunto todo de uma via de uma vez. */
export type ClientProposal = {
  id: string;
  hospital_id: string;
  year: number;
  /** Qual dos processos independentes do hospital. Ver ApprovalTrack. */
  approval_track: ApprovalTrack;
  stage: ProposalStage;
  /** Código que vai no assunto da carta de assinatura e pelo qual a resposta do cliente
   *  com o documento assinado é reconhecida e arquivada na proposta certa (ver Edge
   *  Function inbound-signed-document). Gerado pela BD na criação, com prefixo por via:
   *  "[PM-XXXXXXXX]" na via geral, "[BT-XXXXXXXX]" na de braquiterapia. */
  reference_code: string;
  engineer_approved_at: string | null;
  engineer_approved_by: string | null;
  client_approved_at: string | null;
  client_approved_by: string | null;
  letter_sent_at: string | null;
  letter_sent_to: string[] | null;
  signed_at: string | null;
  signed_by: string | null;
  rejected_reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientProposalInsert = Omit<ClientProposal, 'id' | 'created_at' | 'updated_at'>;
export type ClientProposalUpdate = Partial<ClientProposalInsert> & { updated_at?: string };

export type ClientProposalEvent = {
  proposal_id: string;
  pm_event_id: string;
};

/** As três etapas com email de cada via de aprovação. A via de braquiterapia tem os seus
 *  próprios templates (prefixo `brachy_`) em vez de reaproveitar os da via geral: o texto
 *  não é o mesmo, e partilhá-los faria com que editar um mudasse o outro sem se dar por
 *  isso. `templateKeyFor()` (lib/approvalTrack) escolhe a chave a partir da via. */
export type EmailTemplateStep = 'engineer_approval' | 'client_proposal' | 'signature_letter';

export type EmailTemplateKey =
  | EmailTemplateStep
  | 'brachy_engineer_approval'
  | 'brachy_client_proposal'
  | 'brachy_signature_letter';

/** Uma linha por (key, country) — country espelha hospitals.country: o idioma do
 *  template é sempre o do país do hospital, nunca um conceito de "locale" à parte. */
export type EmailTemplate = {
  id: string;
  key: EmailTemplateKey;
  country: Country;
  subject: string;
  body: string;
  updated_by: string | null;
  updated_at: string;
};

export type EmailTemplateUpdate = { subject: string; body: string; updated_by?: string | null };

export type EmailLogEntry = {
  id: string;
  proposal_id: string | null;
  template_key: string | null;
  recipient_emails: string[];
  subject: string;
  sent_by: string | null;
  sent_at: string;
  graph_message_id: string | null;
};
