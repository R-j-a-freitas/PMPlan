import type { HTMLAttributes } from 'react';

type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: string;
  variant?: 'solid' | 'neutral';
  /** Tom semântico, para estados cuja cor não vem de dados (ver TONE_CLASSES). */
  tone?: BadgeTone;
  /** `sm` para dentro da sidebar de planeamento, onde a linha corre a 12px e um badge
   *  de tamanho normal passa a ser o elemento mais alto da linha — é ele que decidiria
   *  a altura, e a densidade da coluna deixava de depender da letra. */
  size?: BadgeSize;
}

type BadgeSize = 'sm' | 'md';

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0 text-[10px] leading-4',
  md: 'px-2 py-0.5 text-xs leading-5',
};

// Rótulo tingido: fundo muito claro + texto escuro da mesma família + contorno ténue.
// Lê-se melhor do que a pastilha saturada e, sobretudo, não compete com a cor do
// equipamento — a única cor com significado no planeamento (ver MainCalendar).
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-600 ring-gray-500/15',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  accent: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  success: 'bg-green-50 text-green-700 ring-green-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/20',
};

// `solid` (cor de fundo à escolha) é para badges cuja cor vem dos dados e significa
// alguma coisa — estado de aprovação, saúde do sistema, via de aprovação. `neutral`/`tone`
// são para rótulos que só identificam (ex. o código da zona).
export function Badge({
  color,
  variant = 'solid',
  tone,
  size = 'md',
  className = '',
  style,
  children,
  ...props
}: BadgeProps) {
  const base = `inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${SIZE_CLASSES[size]}`;
  const resolvedTone = tone ?? (variant === 'neutral' ? 'neutral' : null);

  if (resolvedTone) {
    return (
      <span className={`${base} ring-1 ring-inset ${TONE_CLASSES[resolvedTone]} ${className}`} style={style} {...props}>
        {children}
      </span>
    );
  }

  return (
    <span
      className={`${base} text-white shadow-sm ${className}`}
      style={{ backgroundColor: color ?? '#2563eb', ...style }}
      {...props}
    >
      {children}
    </span>
  );
}
