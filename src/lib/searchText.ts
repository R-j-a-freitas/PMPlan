// Procura por substring, insensível a maiúsculas e a acentos — escrever "portugues"
// encontra "Português", que é o que se espera de uma app em português. Usada pelos
// campos de procura das listas de gestão (ver SearchInput), sempre sobre o texto que já
// está visível na tabela.
export function matchesSearch(search: string, fields: (string | null | undefined)[]): boolean {
  const needle = normalize(search);
  if (!needle) return true;
  return fields.some((field) => normalize(field).includes(needle));
}

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
