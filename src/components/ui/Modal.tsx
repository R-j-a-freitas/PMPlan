import { useEffect } from 'react';
import type { ReactNode } from 'react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  title: ReactNode;
  /** Uma linha por baixo do título, para contexto que não cabe no título. */
  description?: ReactNode;
  size?: ModalSize;
  /** Painel de altura fixa (90vh) — para modais com lista longa lá dentro, que devem
   *  ocupar sempre o mesmo espaço em vez de saltarem de tamanho com o conteúdo. */
  tall?: boolean;
  /** Acções do rodapé, alinhadas à direita. Ordem: cancelar → confirmar. */
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

// Moldura única de todos os modais da app. Antes cada um trazia o seu próprio overlay,
// raio, sombra e espaçamento — oito variações do mesmo objecto. Aqui ficam também os dois
// comportamentos que se esperam de um modal e que faltavam em metade deles: Escape fecha
// e clicar fora fecha.
export function Modal({ title, description, size = 'sm', tall = false, footer, onClose, children }: ModalProps) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        // mouseDown (e não click) no próprio overlay: arrastar uma selecção de texto de
        // dentro do painel para fora não pode fechar o modal a meio da escrita.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-modal ${
          tall ? 'h-[90vh]' : 'max-h-[90vh]'
        } ${SIZE_CLASSES[size]}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
