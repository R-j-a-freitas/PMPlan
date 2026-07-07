// Tipagem manual do schema Supabase (secção 4). Quando o projecto Supabase estiver
// ligado, substituir por: `supabase gen types typescript --project-id <id>`.
//
// `Relationships: []` em cada tabela/view é exigido pela constraint GenericTable/GenericView
// do postgrest-js (sem ele, o client cai silenciosamente em `never` em todos os inserts/selects).
import type {
  ClientProposal,
  ClientProposalEvent,
  ClientProposalInsert,
  ClientProposalUpdate,
  ConflictLog,
  ConflictLogInsert,
  EmailLogEntry,
  EmailTemplate,
  Engineer,
  EngineerInsert,
  EngineerUpdate,
  EngineerZone,
  Equipment,
  EquipmentFull,
  EquipmentInsert,
  EquipmentUpdate,
  Holiday,
  HolidayInsert,
  HolidayRule,
  HolidayRuleInsert,
  HolidayRuleUpdate,
  Hospital,
  HospitalInsert,
  HospitalUpdate,
  HospitalWithZone,
  PMEvent,
  PMEventInsert,
  PMEventUpdate,
  SourceChange,
  SourceChangeInsert,
  SourceChangeUpdate,
  UserProfile,
  Zone,
  ZoneInsert,
  ZoneUpdate,
} from './index';

export type Database = {
  public: {
    Tables: {
      zones: { Row: Zone; Insert: ZoneInsert; Update: ZoneUpdate; Relationships: [] };
      hospitals: {
        Row: Hospital;
        Insert: HospitalInsert;
        Update: HospitalUpdate;
        Relationships: [];
      };
      engineers: {
        Row: Engineer;
        Insert: EngineerInsert;
        Update: EngineerUpdate;
        Relationships: [];
      };
      engineer_zones: {
        Row: EngineerZone;
        Insert: EngineerZone;
        Update: Partial<EngineerZone>;
        Relationships: [];
      };
      equipment: {
        Row: Equipment;
        Insert: EquipmentInsert;
        Update: EquipmentUpdate;
        Relationships: [];
      };
      pm_events: {
        Row: PMEvent;
        Insert: PMEventInsert;
        Update: PMEventUpdate;
        Relationships: [];
      };
      source_changes: {
        Row: SourceChange;
        Insert: SourceChangeInsert;
        Update: SourceChangeUpdate;
        Relationships: [];
      };
      holidays: {
        Row: Holiday;
        Insert: HolidayInsert;
        Update: Partial<HolidayInsert>;
        Relationships: [];
      };
      holiday_rules: {
        Row: HolidayRule;
        Insert: HolidayRuleInsert;
        Update: HolidayRuleUpdate;
        Relationships: [];
      };
      conflict_log: {
        Row: ConflictLog;
        Insert: ConflictLogInsert;
        Update: Partial<ConflictLogInsert>;
        Relationships: [];
      };
      user_profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, 'created_at'>;
        Update: Partial<Omit<UserProfile, 'id' | 'created_at'>>;
        Relationships: [];
      };
      client_proposals: {
        Row: ClientProposal;
        Insert: Partial<ClientProposalInsert> & Pick<ClientProposalInsert, 'hospital_id' | 'year'>;
        Update: ClientProposalUpdate;
        Relationships: [];
      };
      client_proposal_events: {
        Row: ClientProposalEvent;
        Insert: ClientProposalEvent;
        Update: Partial<ClientProposalEvent>;
        Relationships: [];
      };
      email_templates: {
        Row: EmailTemplate;
        Insert: Partial<EmailTemplate>;
        Update: Partial<EmailTemplate>;
        Relationships: [];
      };
      email_log: {
        Row: EmailLogEntry;
        Insert: Omit<EmailLogEntry, 'id' | 'sent_at'>;
        Update: Partial<Omit<EmailLogEntry, 'id'>>;
        Relationships: [];
      };
    };
    Views: {
      hospitals_with_zone: { Row: HospitalWithZone; Relationships: [] };
      equipment_full: { Row: EquipmentFull; Relationships: [] };
    };
    Functions: {
      // Actualiza engineers.primary_zone_id + engineer_zones na mesma transacção (secção 4, regra 2).
      set_engineer_zones: {
        Args: { p_engineer_id: string; p_zone_ids: string[]; p_primary_zone_id: string | null };
        Returns: undefined;
      };
    };
  };
};
