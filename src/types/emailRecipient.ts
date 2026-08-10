/** Destinatário em CC gerido na BD (tabela `email_recipients`) — substitui a antiga
 *  constante hardcoded TERESA_EMAIL. Vai em CC em todos os envios de propostas/cartas
 *  enquanto `active` for true; desligar alguém do loop de emails é só pôr active=false
 *  na app, sem apagar o registo nem tocar no código. */
export type EmailRecipient = {
  id: string;
  name: string | null;
  email: string;
  active: boolean;
  sort_order: number;
  created_at: string;
};

export type EmailRecipientInsert = Omit<EmailRecipient, 'id' | 'created_at'>;
export type EmailRecipientUpdate = Partial<EmailRecipientInsert>;
