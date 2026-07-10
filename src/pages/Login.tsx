import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores';
import { Button } from '../components/ui';

export function Login() {
  const session = useAuthStore((state) => state.session);
  const signIn = useAuthStore((state) => state.signIn);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar sessão.');
    } finally {
      setSubmitting(false);
    }
  }

  if (session) return <Navigate to="/" replace />;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <img src="/pmplan-logo.png" alt="PMPlan" className="mx-auto mb-3 h-32 w-auto" />
        <p className="mb-4 text-sm text-gray-500">Inicie sessão para aceder ao planeamento.</p>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <label className="mb-3 flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoFocus
            className="rounded-md border border-gray-300 px-2 py-1.5"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="mb-4 flex flex-col gap-1 text-sm">
          Palavra-passe
          <input
            type="password"
            required
            className="rounded-md border border-gray-300 px-2 py-1.5"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <Button type="submit" className="w-full justify-center" disabled={submitting}>
          {submitting ? 'A entrar…' : 'Entrar'}
        </Button>
      </form>
    </div>
  );
}
