export type ConflictType =
  | 'engineer_overlap' // Engenheiro com dois eventos em simultâneo
  | 'holiday_block' // PM colocada em feriado
  | 'zone_overload' // Zona com mais PM do que capacidade disponível
  | 'engineer_unavailable' // Engenheiro indisponível no Outlook
  // Regra 5: PM em fim-de-semana sem contrato que o permita. NOTA: o CHECK da tabela
  // conflict_log não inclui este valor — actualizar a BD antes de alguma vez persistir
  // conflitos deste tipo via recordConflict (hoje sem chamadores).
  | 'weekend_block';

export type ConflictResult = {
  hasConflict: boolean;
  type?: ConflictType;
  message?: string;
  /** Próxima data disponível sugerida automaticamente. */
  suggestedDate?: Date;
};

/** Linha persistida da tabela conflict_log. */
export type ConflictLog = {
  id: string;
  event_id: string | null;
  conflict_type: ConflictType;
  description: string | null;
  resolved: boolean;
  created_at: string;
};

export type ConflictLogInsert = Omit<ConflictLog, 'id' | 'created_at'>;
