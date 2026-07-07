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

/** Proposta de calendarização por hospital/ano — a unidade de aprovação/envio (não a PM
 *  individual): o admin aprova/envia o conjunto todo de um hospital de uma vez. */
export type ClientProposal = {
  id: string;
  hospital_id: string;
  year: number;
  stage: ProposalStage;
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

export type EmailTemplateKey = 'engineer_approval' | 'client_proposal' | 'signature_letter';

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
