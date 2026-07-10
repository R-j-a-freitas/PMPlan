import { NavLink } from 'react-router-dom';
import { useAuthStore, useCalendarStore } from '../stores';
import { Badge, Button } from '../components/ui';

const NAV_LINKS = [
  { to: '/', label: 'Calendário', end: true },
  { to: '/equipment', label: 'Equipamentos' },
  { to: '/engineers', label: 'Engenheiros' },
  { to: '/clients', label: 'Hospitais' },
  { to: '/contacts', label: 'Contactos' },
  { to: '/holidays', label: 'Feriados' },
  { to: '/reports', label: 'Relatórios' },
  { to: '/settings', label: 'Configurações' },
];

// TOPBAR: Logo | navegação | Ano de planeamento | Perfil (secção 10). Notificações/
// filtros globais ficam para as Fases 3/4 (secção 14) — ainda sem requisitos definidos.
export function Topbar() {
  const profile = useAuthStore((state) => state.profile);
  const canManageUsers = useAuthStore((state) => state.permissions.canManageUsers);
  const canApprove = useAuthStore(
    (state) => state.permissions.canApproveSchedule || state.permissions.canSendEmails,
  );
  const signOut = useAuthStore((state) => state.signOut);
  const planningYear = useCalendarStore((state) => state.planningYear);
  const setPlanningYear = useCalendarStore((state) => state.setPlanningYear);

  let navLinks = NAV_LINKS;
  if (canApprove) navLinks = [...navLinks, { to: '/approvals', label: 'Aprovações' }];
  if (canManageUsers) navLinks = [...navLinks, { to: '/users', label: 'Utilizadores' }];

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-3">
      <img src="/pmplan-logo.png" alt="PMPlan" className="h-10 w-auto" />

      <nav className="flex items-center gap-1">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `rounded-md px-2 py-1 text-sm ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1" title="Ano de planeamento">
        <Button variant="ghost" onClick={() => setPlanningYear(planningYear - 1)} aria-label="Ano anterior">
          ‹
        </Button>
        <span className="min-w-[3.5rem] text-center text-sm font-semibold text-gray-700">
          Plano {planningYear}
        </span>
        <Button variant="ghost" onClick={() => setPlanningYear(planningYear + 1)} aria-label="Ano seguinte">
          ›
        </Button>
      </div>

      {profile && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">{profile.name ?? 'Utilizador'}</span>
          <Badge>{profile.role}</Badge>
          <Button variant="ghost" onClick={signOut}>
            Sair
          </Button>
        </div>
      )}
    </header>
  );
}
