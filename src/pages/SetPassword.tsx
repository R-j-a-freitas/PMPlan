import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores';
import { Button } from '../components/ui';

const MIN_PASSWORD_LENGTH = 8;

// Duas formas de chegar aqui: (1) link de convite/recuperação por email — o
// supabase-js estabelece sessão a partir do token na URL; (2) login com palavra-passe
// temporária dada por um admin (must_change_password=true) — RequireAuth redirige
// para cá automaticamente. Em ambos os casos só falta escolher a palavra-passe final.
export function SetPassword() {
  const navigate = useNavigate();
  const session = useAuthStore((state) => state.session);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A palavra-passe tem de ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('As palavras-passe não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      if (session) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .update({ must_change_password: false })
          .eq('id', session.user.id);
        if (profileError) throw profileError;
      }

      // Termina a sessão e volta ao login. O perfil em memória (store) ainda tem
      // must_change_password=true — se navegássemos para "/" com a sessão activa, o
      // RequireAuth reenviava logo para cá (o loop reportado). Ao reautenticar, a store
      // recarrega o perfil já a false e o utilizador entra directamente.
      await supabase.auth.signOut();
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao definir a palavra-passe. Peça um novo convite ao administrador.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50 p-4">
      <form onSubmit={handleSubmit} className="pm-card w-full max-w-sm p-6">
        {/* Mesma entrada visual do login: o logótipo, e não um "PMPlan" escrito à mão
            noutra cor — são o mesmo momento do mesmo produto. */}
        <img src="/pmplan-logo.png" alt="PMPlan" className="mx-auto mb-3 h-28 w-auto" />
        <p className="mb-5 text-center text-sm text-gray-500">
          Defina a sua palavra-passe para activar a conta.
        </p>

        {error && (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Nova palavra-passe
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoFocus
            className="pm-field w-full font-normal"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <span className="text-xs font-normal text-gray-400">Pelo menos {MIN_PASSWORD_LENGTH} caracteres.</span>
        </label>
        <label className="mb-5 flex flex-col gap-1.5 text-sm font-medium text-gray-700">
          Confirmar palavra-passe
          <input
            type="password"
            required
            className="pm-field w-full font-normal"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        <Button type="submit" className="h-9 w-full" disabled={submitting}>
          {submitting ? 'A gravar…' : 'Definir palavra-passe'}
        </Button>
      </form>
    </div>
  );
}
