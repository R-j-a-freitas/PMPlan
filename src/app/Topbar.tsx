import { NavLink } from 'react-router-dom';
import { useAuthStore, useCalendarStore } from '../stores';
import { Button } from '../components/ui';

const NAV_LINKS = [
  { to: '/', label: 'Calendário', end: true },
  { to: '/painel', label: 'Painel' },
  { to: '/equipment', label: 'Equipamentos' },
  { to: '/engineers', label: 'Engenheiros' },
  { to: '/clients', label: 'Hospitais' },
  { to: '/contacts', label: 'Contactos' },
  { to: '/holidays', label: 'Feriados' },
  { to: '/reports', label: 'Relatórios' },
  { to: '/settings', label: 'Configurações' },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  planner: 'Planeador',
  engineer: 'Engenheiro',
  readonly: 'Consulta',
};

// Iniciais para o avatar do perfil — duas letras chegam para identificar quem está
// autenticado sem gastar a largura de um nome completo na barra.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

// TOPBAR: Logo | navegação | Ano de planeamento | Perfil (secção 10). Notificações/
// filtros globais ficam para as Fases 3/4 (secção 14) — ainda sem requisitos definidos.
export function Topbar() {
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
  if (canApprove) navLinks = [...navLinks, { to: '/approvals', label: 'Aprovações' }];
  if (canManageUsers) navLinks = [...navLinks, { to: '/users', label: 'Utilizadores' }];
  if (canViewSystemHealth) navLinks = [...navLinks, { to: '/system', label: 'Sistema' }];

  const profileName = profile?.name ?? 'Utilizador';

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
            {link.label}
          </NavLink>
        ))}
      </nav>

      {/* Ano de planeamento — um só controlo agrupado, em vez de três elementos soltos:
          é um selector de valor, e tem de se ler como tal. */}
      <div
        className="flex shrink-0 items-center rounded-md border border-gray-300 bg-white shadow-sm"
        title="Ano de planeamento"
      >
        <button
          type="button"
          onClick={() => setPlanningYear(planningYear - 1)}
          aria-label="Ano anterior"
          className="h-8 rounded-l-md px-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          ‹
        </button>
        <span className="min-w-[5.5rem] border-x border-gray-200 px-2 text-center text-sm font-semibold tabular-nums text-gray-700">
          Plano {planningYear}
        </span>
        <button
          type="button"
          onClick={() => setPlanningYear(planningYear + 1)}
          aria-label="Ano seguinte"
          className="h-8 rounded-r-md px-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          ›
        </button>
      </div>

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
            <div className="text-xs text-gray-500">{ROLE_LABELS[profile.role] ?? profile.role}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sair
          </Button>
        </div>
      )}
    </header>
  );
}
