import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore, useLanguageStore, useUiStore } from '../stores';
import { LANGS, LANG_LABELS, translate, type Lang } from '../i18n';

// Ecrã de primeiro acesso: quem entra sem idioma gravado no perfil escolhe aqui antes de
// ver a aplicação (ver RequireAuth). Só aparece uma vez — depois disto a troca faz-se
// pelo selector da Topbar.
//
// Ao contrário de todos os outros ecrãs, este NÃO é traduzido para o idioma activo: cada
// opção é escrita no seu próprio idioma e a explicação aparece nas duas. Uma pessoa que
// só leia espanhol não pode ficar dependente de perceber português para chegar ao botão
// que põe a app em espanhol.
export function ChooseLanguage() {
  const navigate = useNavigate();
  const session = useAuthStore((state) => state.session);
  const setLang = useLanguageStore((state) => state.setLang);
  const pushToast = useUiStore((state) => state.pushToast);
  const [saving, setSaving] = useState<Lang | null>(null);

  async function choose(lang: Lang) {
    setSaving(lang);
    try {
      // Espera pela gravação no perfil antes de avançar. Se falhar, entra-se na mesma
      // (a interface já está no idioma escolhido) mas com o aviso de que a escolha não
      // ficou guardada — caso contrário voltaria a ser pedida sem explicação nenhuma.
      const persisted = await setLang(lang);
      if (!persisted) pushToast({ variant: 'warning', message: translate(lang, 'lang.saveFailed') });
      navigate('/', { replace: true });
    } finally {
      setSaving(null);
    }
  }

  // O idioma grava-se no perfil — sem sessão não há onde o guardar.
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50 p-4">
      <div className="pm-card w-full max-w-md p-6">
        <img src="/pmplan-logo.png" alt="PMPlan" className="mx-auto mb-4 h-24 w-auto" />

        <div className="flex flex-col gap-1">
          {LANGS.map((lang) => (
            <p key={lang} className="text-center text-sm text-gray-500">
              {translate(lang, 'lang.chooseDescription')}
            </p>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {LANGS.map((lang) => (
            <button
              key={lang}
              type="button"
              disabled={saving !== null}
              onClick={() => void choose(lang)}
              className="flex h-12 items-center justify-between rounded-lg border border-gray-300 bg-white px-4 text-left transition-colors hover:border-brand-600 hover:bg-brand-50 disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="text-sm font-medium text-gray-900">{LANG_LABELS[lang]}</span>
              <span className="text-xs font-semibold uppercase text-gray-400">
                {saving === lang ? '…' : lang}
              </span>
            </button>
          ))}
        </div>

        {/* O que esta escolha NÃO faz. É a confusão previsível: a app tem dois idiomas e
            os clientes também, mas são decisões independentes — as cartas e emails
            continuam a sair no idioma do país do hospital. */}
        <div className="mt-4 flex flex-col gap-1">
          {LANGS.map((lang) => (
            <p key={lang} className="text-center text-xs text-gray-400">
              {translate(lang, 'lang.exportNote')}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
