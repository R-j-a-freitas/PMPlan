import { useEffect } from 'react';
import { useUiStore } from '../../stores';
import { useT } from '../../i18n';
import type { ToastMessage } from '../../stores';

// Superfície branca com uma barra de cor à esquerda, em vez do rectângulo saturado de
// antes: legível sobre o calendário (que é sempre o que está por baixo) e coerente com
// os restantes cartões da app.
const VARIANT_CLASSES: Record<ToastMessage['variant'], { bar: string; icon: string; glyph: string }> = {
  success: { bar: 'bg-green-600', icon: 'text-green-600', glyph: '✓' },
  error: { bar: 'bg-red-600', icon: 'text-red-600', glyph: '!' },
  warning: { bar: 'bg-amber-500', icon: 'text-amber-600', glyph: '!' },
  info: { bar: 'bg-brand-600', icon: 'text-brand-600', glyph: 'i' },
};

const AUTO_DISMISS_MS = 5000;

export function ToastContainer() {
  const t = useT();
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const variant = VARIANT_CLASSES[toast.variant];
        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-float"
          >
            <span className={`w-1 shrink-0 ${variant.bar}`} />
            <div className="flex flex-1 items-start gap-2.5 px-3 py-2.5">
              <span
                aria-hidden="true"
                className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${variant.icon}`}
              >
                {variant.glyph}
              </span>
              <p className="flex-1 text-sm text-gray-700">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label={t('common.dismissNotice')}
                className="-mr-1 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
