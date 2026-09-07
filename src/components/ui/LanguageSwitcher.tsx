import { useLanguageStore, useUiStore } from '../../stores';
import { LANGS, LANG_LABELS, translate, useT } from '../../i18n';

// Selector PT|ES da Topbar. Segmentado e sempre visível — não escondido dentro de um menu
// de perfil: quem abre a app no idioma errado tem de conseguir corrigi-lo sem procurar,
// e é precisamente essa pessoa que não consegue ler os rótulos do menu onde estaria.
//
// Mostra o código do idioma (PT/ES) e não a bandeira: o espanhol desta app é o de
// Espanha, mas uma bandeira num selector de idioma promete uma escolha de país que não
// existe aqui — o país do hospital é outra coisa, e decide-se noutro sítio.
export function LanguageSwitcher() {
  const lang = useLanguageStore((state) => state.lang);
  const setLang = useLanguageStore((state) => state.setLang);
  const pushToast = useUiStore((state) => state.pushToast);
  const t = useT();

  async function choose(option: (typeof LANGS)[number]) {
    const persisted = await setLang(option);
    // Já com a interface no idioma novo — daí a mensagem sair traduzida para ele.
    if (!persisted) pushToast({ variant: 'warning', message: translate(option, 'lang.saveFailed') });
  }

  return (
    <div
      role="group"
      aria-label={t('lang.title')}
      className="flex shrink-0 items-center gap-0.5 rounded-md border border-gray-300 bg-gray-100 p-0.5 shadow-sm"
    >
      {LANGS.map((option) => {
        const active = option === lang;
        return (
          <button
            key={option}
            type="button"
            onClick={() => {
              if (!active) void choose(option);
            }}
            aria-pressed={active}
            title={LANG_LABELS[option]}
            className={`h-7 rounded px-2 text-xs font-semibold uppercase transition-colors ${
              active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
