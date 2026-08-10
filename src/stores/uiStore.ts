import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 300;

export interface ToastMessage {
  id: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

/** Nº de linhas de detalhe por PM na grelha do calendário (Ano/Trimestre/Mês/Semana):
 *  1 = só o nome do equipamento (compacto, cabem mais PMs sobrepostas no mesmo dia);
 *  2 = equipamento + hospital (mais informação, menos PMs cabem antes do "mais +N"). */
export type EventLineDensity = 1 | 2;

interface UiState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  toasts: ToastMessage[];
  eventLineDensity: EventLineDensity;

  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
  setEventLineDensity: (density: EventLineDensity) => void;
}

// Preferência de UI apenas (largura/colapso da sidebar) — NÃO guardar dados de negócio em
// localStorage (regra 8, secção 15); dados de negócio vivem sempre no Supabase.
export const useUiStore = create<UiState>()(
  devtools(
    persist(
      (set, get) => ({
        sidebarCollapsed: false,
        sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
        toasts: [],
        eventLineDensity: 1,

        toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

        setSidebarWidth: (width) =>
          set({ sidebarWidth: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)) }),

        pushToast: (toast) =>
          set({ toasts: [...get().toasts, { ...toast, id: crypto.randomUUID() }] }),

        dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),

        setEventLineDensity: (eventLineDensity) => set({ eventLineDensity }),
      }),
      {
        name: 'pmplan-ui-preferences',
        partialize: (state) => ({
          sidebarCollapsed: state.sidebarCollapsed,
          sidebarWidth: state.sidebarWidth,
          eventLineDensity: state.eventLineDensity,
        }),
      },
    ),
    { name: 'ui-store' },
  ),
);
