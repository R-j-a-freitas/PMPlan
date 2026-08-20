import type { ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Acções alinhadas à direita do título (botões, selectores). */
  actions?: ReactNode;
  /** `false` quando o conteúdo trata do seu próprio espaçamento — o caso das tabelas,
   *  que têm de encostar às margens do cartão para as linhas irem de ponta a ponta. */
  padded?: boolean;
  className?: string;
  children: ReactNode;
}

// Superfície branca sobre o fundo cinzento da página. É a única moldura de conteúdo da
// app: painéis de indicadores, listas, filtros e formulários vivem todos dentro de um
// destes, para que mudar de separador não pareça mudar de aplicação.
export function Card({ title, subtitle, actions, padded = true, className = '', children }: CardProps) {
  const hasHeader = Boolean(title || actions);
  return (
    <section className={`pm-card flex flex-col overflow-hidden ${className}`}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold text-gray-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'flex-1 p-4' : 'flex-1'}>{children}</div>
    </section>
  );
}
