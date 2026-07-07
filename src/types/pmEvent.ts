export type PMStatus =
  | 'planned'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'delayed';

export type PMEvent = {
  id: string;
  equipment_id: string;
  engineer_id: string;
  start_date: string;
  end_date: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
  completed_at: string | null;
  status: PMStatus;
  outlook_event_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PMEventInsert = Omit<
  PMEvent,
  'id' | 'created_at' | 'updated_at' | 'completed_at' | 'created_by'
>;
// updated_at não tem trigger automático no schema (secção 4) — calendarStore.updateEvent
// define-o explicitamente em cada update, por isso fica disponível aqui.
export type PMEventUpdate = Partial<PMEventInsert> & { updated_at?: string };
