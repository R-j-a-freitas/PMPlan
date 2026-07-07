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

interface UiState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  toasts: ToastMessage[];

  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
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

        toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

        setSidebarWidth: (width) =>
          set({ sidebarWidth: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)) }),

        pushToast: (toast) =>
          set({ toasts: [...get().toasts, { ...toast, id: crypto.randomUUID() }] }),

        dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
      }),
      {
        name: 'pmplan-ui-preferences',
        partialize: (state) => ({
          sidebarCollapsed: state.sidebarCollapsed,
          sidebarWidth: state.sidebarWidth,
        }),
      },
    ),
    { name: 'ui-store' },
  ),
);
