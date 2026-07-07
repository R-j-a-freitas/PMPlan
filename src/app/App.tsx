import { useEffect } from 'react';
import { Providers } from './Providers';
import { Router } from './Router';
import { ToastContainer } from '../components/ui';
import { useAuthStore } from '../stores';

export function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize().catch((err: unknown) => {
      console.error('App: falha ao inicializar sessão', err);
    });
  }, [initialize]);

  return (
    <Providers>
      <Router />
      <ToastContainer />
    </Providers>
  );
}
