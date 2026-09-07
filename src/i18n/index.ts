import { useCallback } from 'react';
import { useLanguageStore } from '../stores/languageStore';
import { LANGS, LANG_LABELS, isLang, type Dictionary, type Lang } from './types';
import { common } from './dictionaries/common';
import { nav } from './dictionaries/nav';
import { calendar } from './dictionaries/calendar';
import { equipment } from './dictionaries/equipment';
import { engineers } from './dictionaries/engineers';
import { clients } from './dictionaries/clients';
import { holidays } from './dictionaries/holidays';
import { reports } from './dictionaries/reports';
import { approvals } from './dictionaries/approvals';
import { users } from './dictionaries/users';
import { modals } from './dictionaries/modals';

export { LANGS, LANG_LABELS, isLang };
export type { Lang };

// Um único mapa achatado, composto a partir dos ficheiros por área. Chaves com prefixo de
// área ('equipment.title') — a colisão entre áreas seria silenciosa, o prefixo evita-a.
const DICTIONARY = {
  ...common,
  ...nav,
  ...calendar,
  ...equipment,
  ...engineers,
  ...clients,
  ...holidays,
  ...reports,
  ...approvals,
  ...users,
  ...modals,
} satisfies Dictionary;

export type TranslationKey = keyof typeof DICTIONARY;

export type TranslationParams = Record<string, string | number>;

const LANG_INDEX: Record<Lang, 0 | 1> = { pt: 0, es: 1 };

/** Traduz fora de um componente (helpers, stores). Dentro de componentes usar `useT()`,
 *  que volta a renderizar quando o idioma muda. */
export function translate(lang: Lang, key: TranslationKey, params?: TranslationParams): string {
  const entry = (DICTIONARY as Dictionary)[key];
  // Chave inexistente devolve a própria chave: aparece na interface, mas não parte o ecrã.
  if (!entry) return key;

  let text = entry[LANG_INDEX[lang]] ?? entry[0];

  // Plural: quando `count` vem nos parâmetros e existe uma chave `<key>_plural`, é essa
  // que se usa para tudo o que não seja exactamente 1 (as duas línguas partilham a regra).
  if (params && typeof params.count === 'number' && params.count !== 1) {
    const plural = (DICTIONARY as Dictionary)[`${key}_plural`];
    if (plural) text = plural[LANG_INDEX[lang]] ?? plural[0];
  }

  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type TFunction = (key: TranslationKey, params?: TranslationParams) => string;

/** Tradutor ligado ao idioma activo. */
export function useT(): TFunction {
  const lang = useLanguageStore((state) => state.lang);
  return useCallback((key: TranslationKey, params?: TranslationParams) => translate(lang, key, params), [lang]);
}

/** Idioma activo — para quando o componente precisa do idioma em si (locale do
 *  calendário, formatação de números) e não de uma tradução. */
export function useLang(): Lang {
  return useLanguageStore((state) => state.lang);
}
