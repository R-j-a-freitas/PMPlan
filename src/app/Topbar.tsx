import { NavLink } from 'react-router-dom';
import { useAuthStore, useCalendarStore } from '../stores';
import { Button, LanguageSwitcher } from '../components/ui';
import { useT, type TranslationKey } from '../i18n';

const NAV_LINKS: { to: string; labelKey: TranslationKey; end?: boolean }[] = [
  { to: '/', labelKey: 'nav.calendar', end: true },
  { to: '/painel', labelKey: 'nav.overview' },
  { to: '/equipment', labelKey: 'nav.equipment' },
  { to: '/engineers', labelKey: 'nav.engineers' },
  { to: '/clients', labelKey: 'nav.clients' },
  { to: '/contacts', labelKey: 'nav.contacts' },
  { to: '/holidays', labelKey: 'nav.holidays' },
  { to: '/reports', labelKey: 'nav.reports' },
  { to: '/settings', labelKey: 'nav.settings' },
];

const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  admin: 'role.admin',
  planner: 'role.planner',
  engineer: 'role.engineer',
  readonly: 'role.readonly',
};

// Iniciais para o avatar do perfil — duas letras chegam para identificar quem está
// autenticado sem gastar a largura de um nome completo na barra.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

// TOPBAR: Logo | navegação | Ano de planeamento | Idioma | Perfil (secção 10).
// Notificações/filtros globais ficam para as Fases 3/4 (secção 14) — ainda sem
// requisitos definidos.
export function Topbar() {
  const t = useT();
  const profile = useAuthStore((state) => state.profile);
  const canManageUsers = useAuthStore((state) => state.permissions.canManageUsers);
  const canApprove = useAuthStore(
    (state) => state.permissions.canApproveSchedule || state.permissions.canSendEmails,
  );
  const canViewSystemHealth = useAuthStore((state) => state.permissions.canViewSystemHealth);
  const signOut = useAuthStore((state) => state.signOut);
  const planningYear = useCalendarStore((state) => state.planningYear);
  const setPlanningYear = useCalendarStore((state) => state.setPlanningYear);

  let navLinks = NAV_LINKS;
  if (canApprove) navLinks = [...navLinks, { to: '/approvals', labelKey: 'nav.approvals' }];
  if (canManageUsers) navLinks = [...navLinks, { to: '/users', labelKey: 'nav.users' }];
  if (canViewSystemHealth) navLinks = [...navLinks, { to: '/system', labelKey: 'nav.system' }];

  const profileName = profile?.name ?? t('topbar.user');
  // Um role fora dos quatro conhecidos (BD adulterada) mostra-se cru, em vez de partir.
  const roleKey = profile ? ROLE_LABEL_KEYS[profile.role] : undefined;
  const roleLabel = roleKey ? t(roleKey) : (profile?.role ?? '');

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-4 shadow-sm">
      <img src="/pmplan-logo.png" alt="PMPlan" className="h-9 w-auto shrink-0" />

      <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            {t(link.labelKey)}
          </NavLink>
        ))}
      </nav>

      {/* Ano de planeamento — um só controlo agrupado, em vez de três elementos soltos:
          é um selector de valor, e tem de se ler como tal. */}
      <div
        className="flex shrink-0 items-center rounded-md border border-gray-300 bg-white shadow-sm"
        title={t('topbar.planningYear')}
      >
        <button
          type="button"
          onClick={() => setPlanningYear(planningYear - 1)}
          aria-label={t('topbar.previousYear')}
          className="h-8 rounded-l-md px-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          ‹
        </button>
        <span className="min-w-[5.5rem] border-x border-gray-200 px-2 text-center text-sm font-semibold tabular-nums text-gray-700">
          {t('topbar.plan', { year: planningYear })}
        </span>
        <button
          type="button"
          onClick={() => setPlanningYear(planningYear + 1)}
          aria-label={t('topbar.nextYear')}
          className="h-8 rounded-r-md px-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          ›
        </button>
      </div>

      <LanguageSwitcher />

      {profile && (
        <div className="flex shrink-0 items-center gap-2 border-l border-gray-200 pl-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/20"
          >
            {initials(profileName)}
          </span>
          <div className="hidden leading-tight lg:block">
            <div className="text-sm font-medium text-gray-800">{profileName}</div>
            <div className="text-xs text-gray-500">{roleLabel}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            {t('topbar.signOut')}
          </Button>
        </div>
      )}
    </header>
  );
}
