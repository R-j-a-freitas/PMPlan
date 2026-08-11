interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

// Campo de procura das listas de gestão — filtra à medida que se escreve, sem botão de
// pesquisar. A comparação é feita por quem usa, com matchesSearch (src/lib/searchText).
export function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <input
      type="search"
      placeholder={placeholder}
      className="mb-4 w-full max-w-md rounded-md border border-gray-300 px-2 py-1 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
