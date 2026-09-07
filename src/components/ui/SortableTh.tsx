import type { ReactNode } from 'react';
import type { SortableHeaderProps } from '../../hooks/useTableSort';

interface SortableThProps extends SortableHeaderProps {
  children: ReactNode;
  /** `right` para colunas numéricas — o cabeçalho tem de encostar ao mesmo lado dos
   *  números, senão deixa de se ler como sendo daquela coluna. */
  align?: 'left' | 'right';
  className?: string;
}

// Cabeçalho de coluna ordenável. A seta da coluna activa está sempre visível e aponta
// para o sentido em vigor; nas restantes só aparece, esbatida, quando o rato passa por
// cima — é assim que se descobre que a tabela toda se ordena, sem encher a linha de
// cabeçalho com sete setas a competir com os títulos.
export function SortableTh({ children, active, direction, onSort, align = 'left', className = '' }: SortableThProps) {
  return (
    <th aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <button
        type="button"
        onClick={onSort}
        className={`group flex w-full items-center gap-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wide transition-colors ${
          align === 'right' ? 'justify-end' : ''
        } ${active ? 'text-brand-700' : 'text-gray-500 hover:text-gray-800'}`}
      >
        {children}
        <svg
          aria-hidden="true"
          viewBox="0 0 10 6"
          className={`h-2 w-2 shrink-0 transition-all ${direction === 'desc' ? 'rotate-180' : ''} ${
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
          }`}
        >
          <path
            d="M1 5 5 1l4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </th>
  );
}
