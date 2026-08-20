interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Substitui a largura por omissão — nos cabeçalhos de cartão convém mais estreito,
   *  para o campo não empurrar o título da lista. */
  className?: string;
}

// Campo de procura das listas de gestão — filtra à medida que se escreve, sem botão de
// pesquisar. A comparação é feita por quem usa, com matchesSearch (src/lib/searchText).
// A lupa dentro do campo evita ter de repetir "Procurar…" num rótulo por cima.
export function SearchInput({ value, onChange, placeholder, className = 'w-full max-w-md' }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      >
        <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="m13 13 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        className="pm-field w-full pl-8"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
