import { useEffect } from 'react';
import { useUiStore } from '../../stores';
import type { ToastMessage } from '../../stores';

const VARIANT_CLASSES: Record<ToastMessage['variant'], string> = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  warning: 'bg-amber-500',
  info: 'bg-gray-800',
};

const AUTO_DISMISS_MS = 5000;

export function ToastContainer() {
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto rounded-md px-4 py-2 text-sm text-white shadow-lg ${VARIANT_CLASSES[toast.variant]}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
