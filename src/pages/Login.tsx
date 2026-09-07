import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores';
import { Button, LanguageSwitcher } from '../components/ui';
import { useT } from '../i18n';

export function Login() {
  const t = useT();
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
      setError(err instanceof Error ? err.message : t('login.failed'));
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
      setError(t('login.resetEmailRequired'));
      return;
    }
    setResetting(true);
    try {
      const { error: resetError } = await supabase.functions.invoke('send-password-reset', {
        body: { email: email.trim() },
      });
      if (resetError) throw resetError;
      // Mensagem neutra (não confirma se o email existe) — evita enumeração de contas.
      setResetNotice(t('login.resetSent'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.resetFailed'));
    } finally {
      setResetting(false);
    }
  }

  if (session) return <Navigate to="/" replace />;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50 p-4">
      <form onSubmit={handleSubmit} className="pm-card w-full max-w-sm p-6">
        {/* O selector aqui em cima serve quem ainda não tem sessão: o ecrã de login é o
            primeiro que se vê, e tem de poder ser lido antes de haver perfil onde ir
            buscar o idioma. */}
        <div className="mb-3 flex justify-end">
          <LanguageSwitcher />
        </div>
        <img src="/pmplan-logo.png" alt="PMPlan" className="mx-auto mb-3 h-28 w-auto" />
        <p className="mb-5 text-center text-sm text-gray-500">{t('login.subtitle')}</p>

        {passwordChanged && !error && (
          <p className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {t('login.passwordChanged')}
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
          {t('common.email')}
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
          {t('login.password')}
          <input
            type="password"
            required
            className="pm-field w-full font-normal"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <Button type="submit" className="h-9 w-full" disabled={submitting || resetting}>
          {submitting ? t('login.submitting') : t('login.submit')}
        </Button>

        <button
          type="button"
          onClick={handleResetPassword}
          disabled={submitting || resetting}
          className="mt-3 w-full rounded-md py-1 text-center text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resetting ? t('common.sending') : t('login.forgot')}
        </button>
      </form>
    </div>
  );
}
