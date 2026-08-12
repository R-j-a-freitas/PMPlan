import type { ApprovalTrack } from './clientProposal';

/** Modalidade de equipamento gerida na BD (tabela `modalities`) — substitui a antiga
 *  constante hardcoded KNOWN_MODALITIES como fonte de verdade do dropdown. KNOWN_MODALITIES
 *  (em equipment.ts) mantém-se só como fallback/seed e default do importador. */
export type Modality = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  /** Via de aprovação dos equipamentos desta modalidade (migração 0017). Marcar uma
   *  modalidade como 'brachytherapy' faz com que os seus equipamentos sejam propostos,
   *  aprovados e assinados à parte do resto do hospital — ver ApprovalTrack. */
  approval_track: ApprovalTrack;
  created_at: string;
};

export type ModalityInsert = Omit<Modality, 'id' | 'created_at'>;
export type ModalityUpdate = Partial<ModalityInsert>;
