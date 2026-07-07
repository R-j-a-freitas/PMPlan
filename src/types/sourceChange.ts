export type SourceChangeStatus = 'planned' | 'completed' | 'cancelled';

/** Troca de fonte radioactiva — específico de equipamentos de Braquiterapia. */
export type SourceChange = {
  id: string;
  equipment_id: string;
  source_type: string;
  initial_activity_gbq: number | null;
  planned_date: string;
  actual_date: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  notes: string | null;
  status: SourceChangeStatus;
  created_at: string;
};

export type SourceChangeInsert = Omit<SourceChange, 'id' | 'created_at'>;
export type SourceChangeUpdate = Partial<SourceChangeInsert>;
