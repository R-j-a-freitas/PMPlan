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
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50 p-4">
      <form onSubmit={handleSubmit} className="pm-card w-full max-w-sm p-6">
        <img src="/pmplan-logo.png" alt="PMPlan" className="mx-auto mb-3 h-28 w-auto" />
        <p className="mb-5 text-center text-sm text-gray-500">Inicie sessão para aceder ao planeamento.</p>

        {passwordChanged && !error && (
          <p className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Palavra-passe definida. Inicie sessão com a nova palavra-passe.
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {resetNotice && (
          <p className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {resetNotice}
          </p>
        )}

        <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Email
          <input
            type="email"
            required
            autoFocus
            className="pm-field w-full font-normal"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="mb-5 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Palavra-passe
          <input
            type="password"
            required
            className="pm-field w-full font-normal"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <Button type="submit" className="h-9 w-full" disabled={submitting || resetting}>
          {submitting ? 'A entrar…' : 'Entrar'}
        </Button>

        <button
          type="button"
          onClick={handleResetPassword}
          disabled={submitting || resetting}
          className="mt-3 w-full rounded-md py-1 text-center text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resetting ? 'A enviar…' : 'Esqueci-me da palavra-passe'}
        </button>
      </form>
    </div>
  );
}
