// Tipagem manual do schema Supabase (secção 4). Quando o projecto Supabase estiver
// ligado, substituir por: `supabase gen types typescript --project-id <id>`.
//
// `Relationships: []` em cada tabela/view é exigido pela constraint GenericTable/GenericView
// do postgrest-js (sem ele, o client cai silenciosamente em `never` em todos os inserts/selects).
import type {
  BackupExport,
  ClientProposal,
  ClientProposalEvent,
  ClientProposalInsert,
  ClientProposalUpdate,
  ConflictLog,
  ConflictLogInsert,
  EmailLogEntry,
  EmailRecipient,
  EmailRecipientInsert,
  EmailRecipientUpdate,
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
  HolidaySyncRun,
  Hospital,
  HospitalContact,
  HospitalContactInsert,
  HospitalContactUpdate,
  HospitalInsert,
  HospitalUpdate,
  HospitalWithZone,
  Modality,
  ModalityInsert,
  ModalityUpdate,
  PMEvent,
  PMEventInsert,
  PMEventUpdate,
  SignedDocument,
  SignedDocumentUpdate,
  SourceChange,
  SourceChangeInsert,
  SourceChangeUpdate,
  SystemBackup,
  SystemCheckResult,
  SystemHeartbeat,
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
      hospital_contacts: {
        Row: HospitalContact;
        Insert: HospitalContactInsert;
        Update: HospitalContactUpdate;
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
      modalities: {
        Row: Modality;
        Insert: Partial<ModalityInsert> & Pick<ModalityInsert, 'name'>;
        Update: ModalityUpdate;
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
      // Continuidade da BD (migrações 0010 e 0013). A aplicação SÓ LÊ destas duas: quem
      // escreve é a VPS e o GitHub Actions, com credenciais próprias — ou, para as acções
      // manuais do ecrã de saúde, as funções da migração 0018 (ver Functions abaixo), que
      // correm como o dono da tabela. Os tipos de Insert e Update são `never` para que uma
      // tentativa de escrita directa a partir do frontend seja um erro de compilação, e
      // não um 403 descoberto em produção.
      system_heartbeat: {
        Row: SystemHeartbeat;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      system_backups: {
        Row: SystemBackup;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Escrita só pelo script do BOE na VPS, através das funções da migração 0025.
      holiday_sync_runs: {
        Row: HolidaySyncRun;
        Insert: never;
        Update: never;
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
      email_recipients: {
        Row: EmailRecipient;
        Insert: Partial<EmailRecipientInsert> & Pick<EmailRecipientInsert, 'email'>;
        Update: EmailRecipientUpdate;
        Relationships: [];
      };
      // Insert nunca é usado pelo frontend: as linhas são criadas pela Edge Function
      // inbound-signed-document com a service_role (não há policy de insert — migração 0015).
      signed_documents: {
        Row: SignedDocument;
        Insert: never;
        Update: SignedDocumentUpdate;
        Relationships: [];
      };
      // Definições globais em chave/valor (migração 0016). `value` é jsonb — o store
      // trata-o como unknown e cada chave é lida com o tipo que lhe corresponde.
      app_settings: {
        Row: { key: string; value: unknown; description: string | null; updated_at: string; updated_by: string | null };
        Insert: { key: string; value: unknown; description?: string | null };
        Update: { value?: unknown; updated_at?: string; updated_by?: string | null };
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
      // Renomeia uma modalidade e propaga o novo nome a equipment.modality na mesma
      // transacção (migração 0008).
      rename_modality: {
        Args: { p_old_name: string; p_new_name: string };
        Returns: undefined;
      };
      // Acções manuais do ecrã de saúde (migração 0018). As três são security definer e
      // recusam quem não for admin — a permissão não vive só no frontend.
      run_system_check: {
        Args: Record<string, never>;
        Returns: SystemCheckResult;
      };
      // Devolve os dados de `public` (mais as contas) num único jsonb. O formato é
      // deliberadamente aberto: o conteúdo depende das tabelas que existirem no momento,
      // e fixá-lo aqui obrigaria a mexer neste ficheiro sempre que nascesse uma tabela.
      admin_backup_export: {
        Args: Record<string, never>;
        Returns: BackupExport;
      };
      record_manual_backup: {
        Args: { p_size_bytes: number; p_object_count?: number | null; p_note?: string | null };
        Returns: string;
      };
    };
  };
};
