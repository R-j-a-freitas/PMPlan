import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores';
import { Button } from '../components/ui';

export function Login() {
  const session = useAuthStore((state) => state.session);
  const signIn = useAuthStore((state) => state.signIn);
  const navigate = useNavigate();
  const location = useLocation();
  // Aviso vindo do /set-password após uma troca de palavra-passe bem-sucedida.
  const passwordChanged = (location.state as { passwordChanged?: boolean } | null)?.passwordChanged ?? false;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Estado do fluxo de recuperação por email (separado do erro de login).
  const [resetting, setResetting] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResetNotice(null);
    try {
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar sessão.');
    } finally {
      setSubmitting(false);
    }
  }

  // Recuperação via Edge Function send-password-reset (Resend), NÃO pelo email nativo do
  // Supabase: gera uma palavra-passe temporária, aplica-a à conta e envia-a por email. Ao
  // entrar com ela, o utilizador é levado a /set-password para definir a definitiva.
  async function handleResetPassword() {
    setError(null);
    setResetNotice(null);
    if (!email.trim()) {
      setError('Indique o email da conta para receber a nova palavra-passe.');
      return;
    }
    setResetting(true);
    try {
      const { error: resetError } = await supabase.functions.invoke('send-password-reset', {
        body: { email: email.trim() },
      });
      if (resetError) throw resetError;
      // Mensagem neutra (não confirma se o email existe) — evita enumeração de contas.
      setResetNotice('Se existir uma conta com este email, enviámos uma nova palavra-passe temporária.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar o email de recuperação.');
    } finally {
      setResetting(false);
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

        {passwordChanged && !error && (
          <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Palavra-passe definida. Inicie sessão com a nova palavra-passe.
          </p>
        )}
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {resetNotice && (
          <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{resetNotice}</p>
        )}

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

        <Button type="submit" className="w-full justify-center" disabled={submitting || resetting}>
          {submitting ? 'A entrar…' : 'Entrar'}
        </Button>

        <button
          type="button"
          onClick={handleResetPassword}
          disabled={submitting || resetting}
          className="mt-3 w-full text-center text-sm text-blue-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resetting ? 'A enviar…' : 'Esqueci-me da palavra-passe'}
        </button>
      </form>
    </div>
  );
}
