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

      navigate('/', { replace: true });
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
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="mb-1 text-lg font-bold text-blue-700">PMPlan</h1>
        <p className="mb-4 text-sm text-gray-500">Defina a sua palavra-passe para activar a conta.</p>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <label className="mb-3 flex flex-col gap-1 text-sm">
          Nova palavra-passe
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoFocus
            className="rounded-md border border-gray-300 px-2 py-1.5"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="mb-4 flex flex-col gap-1 text-sm">
          Confirmar palavra-passe
          <input
            type="password"
            required
            className="rounded-md border border-gray-300 px-2 py-1.5"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        <Button type="submit" className="w-full justify-center" disabled={submitting}>
          {submitting ? 'A gravar…' : 'Definir palavra-passe'}
        </Button>
      </form>
    </div>
  );
}
