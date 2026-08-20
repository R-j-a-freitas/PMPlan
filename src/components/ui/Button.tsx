import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerGhost' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// POLÍTICA DE BOTÕES (aplicada em toda a app — ver também FormModal e as páginas de
// gestão). O que distingue os variantes não é o gosto de cada ecrã, é o peso da acção:
//
//   primary      Uma por vista. A acção que cria ou faz avançar o trabalho ("Adicionar",
//                "Guardar", "Enviar a cliente"). Duas primárias lado a lado tiram-se
//                mutuamente o significado.
//   secondary    Acções de apoio ao mesmo nível ("Exportar", "Importar", "Cancelar",
//                "Pré-visualizar"). Caixa branca com contorno — presente, sem competir.
//   ghost        Controlos de barra e de navegação (setas do calendário, ↻ actualizar).
//                Sem caixa até se lhe passar o rato por cima.
//   dangerGhost  Destruir a partir de uma lista/linha ("Eliminar" numa tabela). Vermelho
//                só no texto: uma tabela com dez botões vermelhos sólidos lê-se como um
//                aviso permanente e deixa de se ver o que importa.
//   danger       Sólido, e só na confirmação final de um modal — é o clique que destrói
//                mesmo. É o único sítio onde o vermelho pesado se justifica.
//
// Ordem numa linha de acções: as consultivas primeiro, a destrutiva sempre no fim.
// Em modais: "Cancelar" (secondary) antes da confirmação (primary ou danger).
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'border border-brand-600 bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:border-brand-700 active:bg-brand-800',
  secondary: 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100',
  danger: 'border border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700 hover:border-red-700 active:bg-red-800',
  dangerGhost: 'border border-transparent bg-transparent text-red-600 hover:bg-red-50 hover:text-red-700 active:bg-red-100',
  ghost: 'border border-transparent bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200',
};

// Duas alturas: `md` para acções de página, `sm` para dentro de tabelas e barras densas,
// onde um botão de altura normal por linha faz a lista inteira parecer um formulário.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1 rounded-md px-2 text-xs',
  md: 'h-8 gap-1.5 rounded-md px-3 text-sm',
};

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
