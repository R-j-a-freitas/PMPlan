import type { ReactNode } from 'react';
import { Topbar } from './Topbar';

interface PageShellProps {
  /** Conteúdo largo (tabelas de 14 colunas) respira melhor sem o limite de largura. */
  wide?: boolean;
  children: ReactNode;
}

// Moldura de todas as páginas que não são o calendário: Topbar fixa, área de conteúdo
// com scroll próprio, fundo cinzento e o mesmo espaçamento em toda a app. O fundo
// cinzento é o que faz os cartões brancos existirem como superfícies — sem ele, "cartão"
// e "página" são a mesma coisa branca e nada tem hierarquia.
export function PageShell({ wide = false, children }: PageShellProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50">
      <Topbar />
      <main className="flex-1 overflow-y-auto">
        <div className={`mx-auto w-full px-6 py-6 ${wide ? '' : 'max-w-[1600px]'}`}>{children}</div>
      </main>
    </div>
  );
}
