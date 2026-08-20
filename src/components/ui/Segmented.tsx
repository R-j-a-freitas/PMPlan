import type { ReactNode } from 'react';

// Controlo segmentado: escolher uma de poucas opções mutuamente exclusivas (vista do
// calendário, densidade das barras). Antes eram botões primary/secondary a fazer de
// "ligado/desligado" — o que gastava o azul da acção principal num estado de vista, e
// punha três botões azuis no ecrã a competir com o "Gerar Plano Anual" ao lado.

export function SegmentedGroup({ children }: { children: ReactNode }) {
  return (
    <div
      role="group"
      className="flex items-center gap-0.5 rounded-md border border-gray-300 bg-gray-100 p-0.5 shadow-sm"
    >
      {children}
    </div>
  );
}

interface SegmentedOptionProps {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}

export function SegmentedOption({ active, onClick, title, children }: SegmentedOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`h-7 whitespace-nowrap rounded px-2.5 text-sm font-medium transition-colors ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}
