import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, useLanguageStore } from '../stores';
import { useT } from '../i18n';

const LAST_ROUTE_KEY = 'pmplan:last-route';
const SESSION_FLAG_KEY = 'pmplan:session-active';
// Rotas de autenticação nunca são guardadas nem restauradas — não são um "sítio" onde o
// utilizador estava a trabalhar (o RequireAuth trata de lá voltar quando é preciso).
const EXCLUDED_ROUTES = new Set(['/login', '/set-password', '/language']);

// Persistência da rota entre relançamentos da PWA. Numa PWA standalone (start_url '/'),
// sair para outra app (ex.: Google Maps) e voltar pode fazer o sistema operativo MATAR e
// relançar a app — que reabre sempre no start_url e perde a página onde se estava. Aqui:
//  1) guarda-se a rota actual sempre que muda;
//  2) num arranque "fresco" (o sessionStorage foi limpo porque a app foi morta) que caia
//     no start_url '/', restaura-se a última rota guardada.
// O sessionStorage distingue relançamento (limpo → restaura) de navegação normal dentro da
// mesma sessão (flag presente → não interfere, para o utilizador poder ir ao início à mão).
function RoutePersistence() {
  const location = useLocation();
  const navigate = useNavigate();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const freshLaunch = !sessionStorage.getItem(SESSION_FLAG_KEY);
    sessionStorage.setItem(SESSION_FLAG_KEY, '1');
    if (!freshLaunch) return;
    const last = localStorage.getItem(LAST_ROUTE_KEY);
    // Só restaura se o arranque caiu no start_url ('/'); se veio por deep link, respeita-o.
    if (last && last !== '/' && !EXCLUDED_ROUTES.has(last) && window.location.pathname === '/') {
      navigate(last, { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!EXCLUDED_ROUTES.has(location.pathname)) {
      localStorage.setItem(LAST_ROUTE_KEY, location.pathname + location.search);
    }
  }, [location.pathname, location.search]);

  return null;
}

// Lazy loading de páginas (secção 12 — requisito de performance).
const Login = lazy(() => import('../pages/Login').then((m) => ({ default: m.Login })));
const SetPassword = lazy(() => import('../pages/SetPassword').then((m) => ({ default: m.SetPassword })));
const ChooseLanguage = lazy(() => import('../pages/ChooseLanguage').then((m) => ({ default: m.ChooseLanguage })));
const Dashboard = lazy(() => import('../pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Overview = lazy(() => import('../pages/Overview').then((m) => ({ default: m.Overview })));
const Equipment = lazy(() => import('../pages/Equipment').then((m) => ({ default: m.Equipment })));
const Engineers = lazy(() => import('../pages/Engineers').then((m) => ({ default: m.Engineers })));
const Clients = lazy(() => import('../pages/Clients').then((m) => ({ default: m.Clients })));
const Contacts = lazy(() => import('../pages/Contacts').then((m) => ({ default: m.Contacts })));
const Reports = lazy(() => import('../pages/Reports').then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import('../pages/Settings').then((m) => ({ default: m.Settings })));
const Users = lazy(() => import('../pages/Users').then((m) => ({ default: m.Users })));
const Holidays = lazy(() => import('../pages/Holidays').then((m) => ({ default: m.Holidays })));
const Approvals = lazy(() => import('../pages/Approvals').then((m) => ({ default: m.Approvals })));
const SystemHealth = lazy(() => import('../pages/SystemHealth').then((m) => ({ default: m.SystemHealth })));

function RouteFallback() {
  const t = useT();
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-gray-50">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-600 border-t-transparent" />
      <p className="text-sm text-gray-500">{t('common.loading')}</p>
    </div>
  );
}

// Sem sessão → /login. Conta com palavra-passe temporária (must_change_password,
// criada por um admin) → /set-password antes de mais nada. Perfil ainda sem idioma
// escolhido → /language. Autorização fina por role fica a cargo do RLS + permissions
// (lib/permissions.ts), não deste guard.
function RequireAuth({ children }: { children: ReactNode }) {
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const loading = useAuthStore((state) => state.loading);
  const langChosen = useLanguageStore((state) => state.chosen);

  if (loading) return <RouteFallback />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.must_change_password) return <Navigate to="/set-password" replace />;
  // A seguir à palavra-passe e antes de tudo o resto: a aplicação por trás deste guard
  // está toda escrita num dos dois idiomas, e não faz sentido mostrá-la antes de saber
  // em qual. Só afecta quem nunca escolheu (coluna language a nulo, migração 0019).
  if (!langChosen) return <Navigate to="/language" replace />;
  return <>{children}</>;
}

export function Router() {
  return (
    <BrowserRouter>
      <RoutePersistence />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/language" element={<ChooseLanguage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/painel"
            element={
              <RequireAuth>
                <Overview />
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
          <Route
            path="/system"
            element={
              <RequireAuth>
                <SystemHealth />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
