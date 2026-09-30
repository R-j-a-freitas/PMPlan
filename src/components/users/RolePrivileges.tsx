import { Badge, Card } from '../ui';
import { PERMISSIONS } from '../../lib/permissions';
import { useT, type TranslationKey } from '../../i18n';
import type { Permissions, UserRole } from '../../types';

type Level = 'edit' | 'view' | 'yes' | 'none';

const ROLES: { role: UserRole; labelKey: TranslationKey }[] = [
  { role: 'admin', labelKey: 'role.admin' },
  { role: 'planner', labelKey: 'role.planner' },
  { role: 'engineer', labelKey: 'role.engineer' },
  { role: 'readonly', labelKey: 'role.readonly' },
];

// Cada linha é DERIVADA de PERMISSIONS (lib/permissions.ts), a mesma tabela que decide o
// que a app mostra — assim este quadro não pode dizer uma coisa enquanto a app faz outra.
// Quem muda uma permissão lá vê a mudança aqui sem tocar neste ficheiro.
const ROWS: { labelKey: TranslationKey; level: (p: Permissions) => Level }[] = [
  { labelKey: 'users.priv.area.calendar', level: (p) => (p.canEditPM ? 'edit' : 'view') },
  { labelKey: 'users.priv.area.equipment', level: (p) => (p.canManageEquipment ? 'edit' : 'view') },
  { labelKey: 'users.priv.area.hospitals', level: (p) => (p.canManageHospitals ? 'edit' : 'view') },
  { labelKey: 'users.priv.area.holidays', level: (p) => (p.canManageHolidays ? 'edit' : 'view') },
  { labelKey: 'users.priv.area.engineers', level: (p) => (p.canManageEngineers ? 'edit' : 'view') },
  { labelKey: 'users.priv.area.zones', level: (p) => (p.canManageZones ? 'edit' : 'view') },
  { labelKey: 'users.priv.area.reports', level: (p) => (p.canExportReports ? 'yes' : 'none') },
  { labelKey: 'users.priv.area.approvals', level: (p) => (p.canApproveSchedule ? 'edit' : 'none') },
  { labelKey: 'users.priv.area.users', level: (p) => (p.canManageUsers ? 'edit' : 'none') },
  { labelKey: 'users.priv.area.system', level: (p) => (p.canViewSystemHealth ? 'yes' : 'none') },
];

const LEVEL_KEYS: Record<Level, TranslationKey> = {
  edit: 'users.priv.level.edit',
  view: 'users.priv.level.view',
  yes: 'users.priv.level.yes',
  none: 'users.priv.level.none',
};

function LevelCell({ level }: { level: Level }) {
  const t = useT();
  if (level === 'none') return <span className="text-gray-300">—</span>;
  return (
    <Badge variant="neutral" tone={level === 'view' ? 'neutral' : 'success'}>
      {t(LEVEL_KEYS[level])}
    </Badge>
  );
}

/** Quadro dos privilégios de cada função, para quem atribui papéis na página de
 *  Utilizadores saber o que está a dar. */
export function RolePrivileges() {
  const t = useT();
  return (
    <Card padded={false} title={t('users.priv.title')} subtitle={t('users.priv.subtitle')}>
      <div className="overflow-x-auto">
        <table className="pm-table">
          <thead>
            <tr>
              <th className="font-medium">{t('users.priv.col.area')}</th>
              {ROLES.map(({ role, labelKey }) => (
                <th key={role} className="font-medium">
                  {t(labelKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.labelKey}>
                <td className="py-1.5 pr-2 text-gray-700">{t(row.labelKey)}</td>
                {ROLES.map(({ role }) => (
                  <td key={role} className="py-1.5 pr-2">
                    <LevelCell level={row.level(PERMISSIONS[role])} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="list-disc space-y-1 px-8 py-3 text-xs text-gray-500">
        <li>{t('users.priv.note.plannerDelete')}</li>
        <li>{t('users.priv.note.allZones')}</li>
        <li>{t('users.priv.note.enforced')}</li>
      </ul>
    </Card>
  );
}
