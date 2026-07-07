import type { Permissions, UserRole } from '../types';

export const PERMISSIONS: Record<UserRole, Permissions> = {
  admin: {
    canCreatePM: true,
    canEditPM: true,
    canDeletePM: true,
    canManageEquipment: true,
    canManageEngineers: true,
    canManageZones: true,
    canManageUsers: true,
    canManageHolidays: true,
    canApproveSchedule: true,
    canSendEmails: true,
    canExportReports: true,
  },
  planner: {
    canCreatePM: true,
    canEditPM: true,
    canDeletePM: false,
    canManageEquipment: true,
    canManageEngineers: false,
    canManageZones: false,
    canManageUsers: false,
    canManageHolidays: true,
    canApproveSchedule: true,
    canSendEmails: true,
    canExportReports: true,
  },
  engineer: {
    canCreatePM: false,
    // Só-consulta: o engenheiro vê o calendário da(s) sua(s) zona(s) (engineer_zones,
    // aplicado via RLS) mas nunca o altera — nem os seus próprios eventos.
    canEditPM: false,
    canDeletePM: false,
    canManageEquipment: false,
    canManageEngineers: false,
    canManageZones: false,
    canManageUsers: false,
    canManageHolidays: false,
    canApproveSchedule: false,
    canSendEmails: false,
    canExportReports: true,
  },
  readonly: {
    canCreatePM: false,
    canEditPM: false,
    canDeletePM: false,
    canManageEquipment: false,
    canManageEngineers: false,
    canManageZones: false,
    canManageUsers: false,
    canManageHolidays: false,
    canApproveSchedule: false,
    canSendEmails: false,
    canExportReports: true,
  },
};

export function getPermissions(role: UserRole): Permissions {
  return PERMISSIONS[role];
}
