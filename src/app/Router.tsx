import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '../stores';

// Lazy loading de páginas (secção 12 — requisito de performance).
const Login = lazy(() => import('../pages/Login').then((m) => ({ default: m.Login })));
const SetPassword = lazy(() => import('../pages/SetPassword').then((m) => ({ default: m.SetPassword })));
const Dashboard = lazy(() => import('../pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Equipment = lazy(() => import('../pages/Equipment').then((m) => ({ default: m.Equipment })));
const Engineers = lazy(() => import('../pages/Engineers').then((m) => ({ default: m.Engineers })));
const Clients = lazy(() => import('../pages/Clients').then((m) => ({ default: m.Clients })));
const Contacts = lazy(() => import('../pages/Contacts').then((m) => ({ default: m.Contacts })));
const Reports = lazy(() => import('../pages/Reports').then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import('../pages/Settings').then((m) => ({ default: m.Settings })));
const Users = lazy(() => import('../pages/Users').then((m) => ({ default: m.Users })));
const Holidays = lazy(() => import('../pages/Holidays').then((m) => ({ default: m.Holidays })));
const Approvals = lazy(() => import('../pages/Approvals').then((m) => ({ default: m.Approvals })));

function RouteFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center text-sm text-gray-500">A carregar…</div>
  );
}

// Sem sessão → /login. Conta com palavra-passe temporária (must_change_password,
// criada por um admin) → /set-password antes de mais nada. Autorização fina por
// role fica a cargo do RLS + permissions (lib/permissions.ts), não deste guard.
function RequireAuth({ children }: { children: ReactNode }) {
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const loading = useAuthStore((state) => state.loading);

  if (loading) return <RouteFallback />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.must_change_password) return <Navigate to="/set-password" replace />;
  return <>{children}</>;
}

export function Router() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/equipment"
            element={
              <RequireAuth>
                <Equipment />
              </RequireAuth>
            }
          />
          <Route
            path="/engineers"
            element={
              <RequireAuth>
                <Engineers />
              </RequireAuth>
            }
          />
          <Route
            path="/clients"
            element={
              <RequireAuth>
                <Clients />
              </RequireAuth>
            }
          />
          <Route
            path="/contacts"
            element={
              <RequireAuth>
                <Contacts />
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <Reports />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />
          <Route
            path="/users"
            element={
              <RequireAuth>
                <Users />
              </RequireAuth>
            }
          />
          <Route
            path="/holidays"
            element={
              <RequireAuth>
                <Holidays />
              </RequireAuth>
            }
          />
          <Route
            path="/approvals"
            element={
              <RequireAuth>
                <Approvals />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
