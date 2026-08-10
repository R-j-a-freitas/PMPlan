/** Modalidade de equipamento gerida na BD (tabela `modalities`) — substitui a antiga
 *  constante hardcoded KNOWN_MODALITIES como fonte de verdade do dropdown. KNOWN_MODALITIES
 *  (em equipment.ts) mantém-se só como fallback/seed e default do importador. */
export type Modality = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
};

export type ModalityInsert = Omit<Modality, 'id' | 'created_at'>;
export type ModalityUpdate = Partial<ModalityInsert>;
