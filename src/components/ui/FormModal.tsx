import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';

interface FormModalProps {
  title: string;
  /** Texto do botão de confirmação (por omissão "Adicionar"). */
  submitLabel?: string;
  /** Bloqueia os botões enquanto grava, para não haver duplo submit. */
  saving?: boolean;
  /** Campos obrigatórios preenchidos — quando falso, só "Cancelar" está disponível. */
  canSubmit?: boolean;
  /** Largura máxima do painel: formulários com muitos campos pedem "lg". */
  size?: 'md' | 'lg';
  onSubmit: () => void;
  onCancel: () => void;
  children: ReactNode;
}

const SIZE_CLASSES = { md: 'max-w-lg', lg: 'max-w-3xl' } as const;

// Modal de introdução de registos, partilhado pelas páginas de gestão (hospitais,
// equipamentos, engenheiros, contactos, feriados). Existe para o formulário de criação
// não ocupar permanentemente o topo da página: quem vem consultar a lista vê a lista, e
// só quem vai criar é que abre o formulário.
//
// Os campos vêm em children numa grelha de 2 colunas — um campo que precise da linha
// toda leva "col-span-2". O estado do formulário fica em quem usa o modal, montado só
// enquanto está aberto, para cada abertura começar limpa.
export function FormModal({
  title,
  submitLabel = 'Adicionar',
  saving = false,
  canSubmit = true,
  size = 'md',
  onSubmit,
  onCancel,
  children,
}: FormModalProps) {
  // Escape fecha — num modal sem X visível é o reflexo natural para sair.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`max-h-full w-full overflow-y-auto rounded-lg bg-white p-4 shadow-xl ${SIZE_CLASSES[size]}`}>
        <h2 className="mb-3 text-base font-semibold text-gray-900">{title}</h2>

        <div className="mb-4 grid grid-cols-2 gap-2">{children}</div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={saving || !canSubmit}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
