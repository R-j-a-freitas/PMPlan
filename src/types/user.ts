export type UserRole = 'admin' | 'planner' | 'engineer' | 'readonly';

export type UserProfile = {
  id: string;
  name: string | null;
  /** Cópia de auth.users.email (não acessível ao cliente directamente, nem para admins). */
  email: string | null;
  role: UserRole;
  engineer_id: string | null;
  microsoft_id: string | null;
  /** true para contas criadas por um admin com palavra-passe temporária — força a
   *  troca no primeiro login (RequireAuth redirige para /set-password). */
  must_change_password: boolean;
  created_at: string;
};

export type Permissions = {
  canCreatePM: boolean;
  canEditPM: boolean;
  canDeletePM: boolean;
  canManageEquipment: boolean;
  canManageEngineers: boolean;
  /** Criar/editar zonas e hospitais (e atribuir engenheiros a zonas) — exclusivo do admin. */
  canManageZones: boolean;
  /** Criar contas e alterar roles de outros utilizadores — exclusivo do admin. */
  canManageUsers: boolean;
  /** Criar/eliminar feriados manuais (regionais/locais de zona) — admin e planner. */
  canManageHolidays: boolean;
  canApproveSchedule: boolean;
  canSendEmails: boolean;
  canExportReports: boolean;
};
