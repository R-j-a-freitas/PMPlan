import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getPermissions } from '../lib/permissions';
import type { Permissions, UserProfile } from '../types';

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  permissions: Permissions;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

async function loadProfile(session: Session): Promise<{ profile: UserProfile | null; error: string | null }> {
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error) return { profile: null, error: error.message };
  return { profile, error: null };
}

export const useAuthStore = create<AuthState>()(
  devtools((set) => {
    // Regista uma única vez, à criação da store — cobre tanto o arranque com sessão
    // já existente (evento INITIAL_SESSION, disparado automaticamente ao subscrever)
    // como qualquer login/logout que aconteça depois. O bug anterior só registava
    // este listener quando já havia sessão no arranque, pelo que um signIn() nunca
    // era detectado.
    supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        set({ session: null, profile: null, loading: false, permissions: getPermissions('readonly') });
        return;
      }
      loadProfile(session).then(({ profile, error }) => {
        set({
          session,
          profile,
          error,
          loading: false,
          permissions: getPermissions(profile?.role ?? 'readonly'),
        });
      });
    });

    return {
      session: null,
      profile: null,
      loading: true,
      error: null,
      permissions: getPermissions('readonly'),

      initialize: async () => {
        set({ loading: true, error: null });
        // Despoleta o INITIAL_SESSION acima caso o listener ainda não tenha resolvido.
        await supabase.auth.getSession();
      },

      signIn: async (email, password) => {
        set({ loading: true, error: null });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          set({ loading: false, error: error.message });
          throw error;
        }
        // onAuthStateChange (acima) trata de carregar o perfil e baixar loading.
      },

      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }),
);
