import type { Permissions, UserRole } from '../types';

export const PERMISSIONS: Record<UserRole, Permissions> = {
  admin: {
    canCreatePM: true,
    canEditPM: true,
    canDeletePM: true,
    canManageEquipment: true,
    canManageHospitals: true,
    canManageEngineers: true,
    canManageZones: true,
    canManageUsers: true,
    canManageHolidays: true,
    canApproveSchedule: true,
    canSendEmails: true,
    canExportReports: true,
    canViewSystemHealth: true,
  },
  planner: {
    canCreatePM: true,
    canEditPM: true,
    // Só PMs ainda não realizadas ('planned'/'delayed') — a RLS (pm_events_planner_
    // delete_draft) é quem o garante; o modal esconde o botão nos outros estados.
    canDeletePM: true,
    canManageEquipment: true,
    canManageHospitals: true,
    canManageEngineers: false,
    canManageZones: false,
    canManageUsers: false,
    canManageHolidays: true,
    // Aprovações e envio de emails a clientes são exclusivos do admin (migração 0028).
    canApproveSchedule: false,
    canSendEmails: false,
    canExportReports: true,
    canViewSystemHealth: false,
  },
  engineer: {
    canCreatePM: false,
    // Só-consulta: o engenheiro vê o calendário de todas as zonas (migração 0028) mas
    // nunca o altera — nem os seus próprios eventos.
    canEditPM: false,
    canDeletePM: false,
    canManageEquipment: false,
    canManageHospitals: false,
    canManageEngineers: false,
    canManageZones: false,
    canManageUsers: false,
    canManageHolidays: false,
    canApproveSchedule: false,
    canSendEmails: false,
    canExportReports: true,
    canViewSystemHealth: false,
  },
  readonly: {
    canCreatePM: false,
    canEditPM: false,
    canDeletePM: false,
    canManageEquipment: false,
    canManageHospitals: false,
    canManageEngineers: false,
    canManageZones: false,
    canManageUsers: false,
    canManageHolidays: false,
    canApproveSchedule: false,
    canSendEmails: false,
    canExportReports: true,
    canViewSystemHealth: false,
  },
};

export function getPermissions(role: UserRole): Permissions {
  return PERMISSIONS[role];
}
