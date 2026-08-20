import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** Uma linha a explicar o que a página é, quando o título não chega. */
  description?: ReactNode;
  /** Acções da página — a primária à direita de todas (ver política em Button). */
  actions?: ReactNode;
}

// Cabeçalho de página: mesmo tamanho, mesmo peso e mesma posição das acções em todos os
// separadores. Era aqui que a app se via mais desalinhada — cada página punha o título e
// os botões à sua maneira.
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
