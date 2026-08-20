import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

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
  // Enter submete a partir de qualquer campo — num formulário de meia dúzia de campos é
  // o reflexo natural, e evita ter de ir com o rato ao botão. Fica de fora nos <textarea>,
  // onde Enter é mudança de linha.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Enter' || saving || !canSubmit) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'TEXTAREA' || target?.tagName === 'BUTTON') return;
      onSubmit();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onSubmit, saving, canSubmit]);

  return (
    <Modal
      title={title}
      size={size === 'lg' ? 'xl' : 'md'}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={saving || !canSubmit}>
            {saving ? 'A guardar…' : submitLabel}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </Modal>
  );
}
