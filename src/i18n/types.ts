/** Os dois idiomas da aplicação. Cada utilizador escolhe o seu no primeiro acesso
 *  (ver pages/ChooseLanguage.tsx) e pode trocar a qualquer momento pela Topbar. */
export type Lang = 'pt' | 'es';

export const LANGS: readonly Lang[] = ['pt', 'es'];

/** Rótulo de cada idioma — sempre no próprio idioma, nunca traduzido: quem só lê
 *  espanhol tem de reconhecer a sua opção mesmo com a app em português. */
export const LANG_LABELS: Record<Lang, string> = {
  pt: 'Português',
  es: 'Español',
};

export function isLang(value: unknown): value is Lang {
  return value === 'pt' || value === 'es';
}

/** Uma entrada do dicionário: [português, espanhol]. As duas traduções vivem lado a lado
 *  de propósito — num dicionário por ficheiro/idioma é fácil acrescentar a chave num e
 *  esquecer o outro, e o texto em falta só aparece em produção. */
export type Entry = readonly [pt: string, es: string];

export type Dictionary = Record<string, Entry>;
