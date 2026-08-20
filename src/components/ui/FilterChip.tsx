import type { ReactNode } from 'react';

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  /** Número de registos por trás da opção — mostrado à direita do rótulo. */
  count?: number;
  title?: string;
  children: ReactNode;
}

// Pastilha de filtro (ex. a via de aprovação). Alternativa ao <select> quando as opções
// são poucas e vale a pena vê-las todas de uma vez, com a contagem à vista.
export function FilterChip({ active, onClick, count, title, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
        active
          ? 'border-brand-600 bg-brand-50 text-brand-700'
          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900'
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`tabular-nums ${active ? 'text-brand-500' : 'text-gray-400'}`}>{count}</span>
      )}
    </button>
  );
}
