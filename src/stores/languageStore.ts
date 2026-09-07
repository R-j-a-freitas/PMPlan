import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { isLang, type Lang } from '../i18n/types';

interface LanguageState {
  lang: Lang;
  /** `false` enquanto o perfil autenticado ainda não tiver idioma gravado — é o que faz o
   *  RequireAuth desviar para o ecrã de escolha. `true` antes de haver sessão, para o
   *  ecrã de login não ficar refém de uma escolha que ainda não se pode gravar. */
  chosen: boolean;
  saving: boolean;

  /** Troca o idioma da interface e grava-o no perfil. Devolve `false` quando a gravação
   *  falhou — quem chama avisa o utilizador (a store não conhece a interface, e importar
   *  o tradutor daqui fecharia um ciclo com o módulo i18n, que já importa esta store). */
  setLang: (lang: Lang) => Promise<boolean>;
  /** Alinha o estado com o perfil acabado de carregar. `null` → ainda não escolheu. */
  syncFromProfile: (lang: Lang | null, userId: string | null) => void;
  /** Volta ao estado "sem sessão" no signOut, sem perder o idioma da última utilização
   *  (o ecrã de login deve reabrir no idioma em que se saiu). */
  reset: () => void;
}

/** Idioma inicial antes de haver perfil: o que o browser diz, com o português como
 *  omissão — a equipa é portuguesa e a maioria das contas fica em PT. */
function detectLang(): Lang {
  const browser = typeof navigator === 'undefined' ? '' : navigator.language.toLowerCase();
  return browser.startsWith('es') ? 'es' : 'pt';
}

export const useLanguageStore = create<LanguageState>()(
  devtools(
    persist(
      (set) => ({
        lang: detectLang(),
        chosen: true,
        saving: false,

        setLang: async (lang) => {
          if (!isLang(lang)) return false;
          set({ lang, chosen: true });
          const { data } = await supabase.auth.getSession();
          const userId = data.session?.user.id;
          // Sem sessão não há perfil onde gravar (ecrã de login) — não é uma falha.
          if (!userId) return true;
          set({ saving: true });
          const { error } = await supabase.from('user_profiles').update({ language: lang }).eq('id', userId);
          set({ saving: false });
          if (error) {
            // Falha típica: a migração 0019 ainda não foi aplicada e a coluna não existe.
            // Sem aviso, o utilizador escolheria o idioma outra vez a cada sessão sem
            // perceber porquê — a interface muda, mas nada fica guardado.
            console.error('languageStore: falha ao gravar idioma no perfil', error);
            return false;
          }
          return true;
        },

        syncFromProfile: (lang, userId) => {
          if (!userId) {
            set({ chosen: true });
            return;
          }
          if (isLang(lang)) {
            set({ lang, chosen: true });
            return;
          }
          // Perfil sem idioma: mantém-se o que está a ser mostrado (detectado ou da
          // sessão anterior) mas marca-se por escolher, para o utilizador confirmar.
          set({ chosen: false });
        },

        reset: () => set({ chosen: true, saving: false }),
      }),
      {
        name: 'pmplan-language',
        // Só o idioma é preferência de interface; `chosen` depende do perfil autenticado
        // e tem de ser recalculado a cada sessão.
        partialize: (state) => ({ lang: state.lang }),
      },
    ),
    { name: 'language-store' },
  ),
);

/** Leitura fora de componentes React (ex.: helpers de formatação em lib/). */
export function currentLang(): Lang {
  return useLanguageStore.getState().lang;
}
