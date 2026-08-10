/** Como é que o documento foi associado ao hospital. Fica registado porque a confiança
 *  não é a mesma: 'reference_code' é inequívoco (veio o código da proposta no assunto),
 *  'sender_email' é um palpite informado que vale a pena alguém confirmar. */
export type SignedDocumentMatchMethod =
  | 'reference_code'
  | 'subject_hospital'
  | 'sender_email'
  | 'manual'
  | 'unmatched';

/** Documento assinado devolvido por um cliente, arquivado a partir da resposta ao email da
 *  carta de assinatura (ver Edge Function inbound-signed-document).
 *  hospital_id é null enquanto não se souber a quem pertence — o ficheiro é guardado à
 *  mesma e fica na fila "por associar". */
export type SignedDocument = {
  id: string;
  hospital_id: string | null;
  proposal_id: string | null;
  storage_path: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  inbound_email_id: string;
  inbound_message_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  match_method: SignedDocumentMatchMethod;
  matched_at: string | null;
  matched_by: string | null;
  notes: string | null;
  created_at: string;
};

export type SignedDocumentUpdate = Partial<
  Pick<SignedDocument, 'hospital_id' | 'proposal_id' | 'match_method' | 'matched_at' | 'matched_by' | 'notes'>
>;
