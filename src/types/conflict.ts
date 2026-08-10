export type ConflictType =
  | 'engineer_overlap' // Engenheiro com dois eventos em simultâneo
  | 'holiday_block' // PM colocada em feriado
  | 'zone_overload' // Zona com mais PM do que capacidade disponível
  | 'engineer_unavailable' // Engenheiro indisponível no Outlook
  // Regra 5: PM em fim-de-semana sem contrato que o permita. NOTA: o CHECK da tabela
  // conflict_log não inclui este valor — actualizar a BD antes de alguma vez persistir
  // conflitos deste tipo via recordConflict (hoje sem chamadores).
  | 'weekend_block'
  // Regra 6: nº de PMs já planeadas no ano excede o contratado (equipment.pm_per_year).
  // NOTA: mesmo caso do weekend_block acima — CHECK da tabela conflict_log não inclui
  // este valor, actualizar a BD antes de persistir via recordConflict (hoje sem chamadores).
  | 'pm_quota_exceeded'
  // Regra 7: o mesmo hospital (cliente) não pode ter PMs em mais de um equipamento na
  // MESMA SEMANA ISO (não só no mesmo dia — a semana inteira é exclusiva por cliente).
  // NOTA: CHECK da conflict_log não inclui este valor (ver weekend_block).
  | 'hospital_same_week'
  // Regra 8: a mesma cidade não pode ter mais de uma PM no mesmo dia (ex: só uma PM em
  // Lisboa por dia; Lisboa + Norte em simultâneo é permitido). NOTA: CHECK da
  // conflict_log não inclui este valor (ver weekend_block).
  | 'city_same_day';

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
