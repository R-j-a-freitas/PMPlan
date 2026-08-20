import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** O que não há. */
  children: ReactNode;
  /** Como resolver (ex. o botão "Adicionar" da própria página). */
  action?: ReactNode;
  /** `compact` para dentro de cartões pequenos, onde 6rem de vazio seria demais. */
  size?: 'compact' | 'default';
}

// "Não há nada aqui" dito da mesma maneira em toda a app — antes cada lista tinha o seu
// parágrafo cinzento, uns centrados, outros não, com espaçamentos todos diferentes.
export function EmptyState({ children, action, size = 'default' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-center ${size === 'compact' ? 'py-6' : 'py-12'}`}>
      <p className="max-w-md text-sm text-gray-500">{children}</p>
      {action}
    </div>
  );
}
